package handler

import (
	"database/sql"
	"os"
	"time"

	"app/internal/middleware"
	"app/internal/model"
	"app/internal/store"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"github.com/rs/zerolog/log"
)

var secretKey []byte

func InitializeAuth() {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal().Msg("JWT_SECRET environment variable is required but not set")
	}
	if len(jwtSecret) < 32 {
		log.Warn().Msg("JWT_SECRET should be at least 32 characters long for security")
	}
	secretKey = []byte(jwtSecret)
	middleware.SetSecretKey(secretKey)
	log.Info().Msg("JWT authentication initialized successfully")
}

func GetJWTExpiration() time.Duration {
	expStr := os.Getenv("JWT_EXPIRATION")
	if expStr == "" {
		return 24 * time.Hour
	}
	if duration, err := time.ParseDuration(expStr); err == nil {
		return duration
	}
	return 24 * time.Hour
}

func GetRefreshExpiration() time.Duration {
	expStr := os.Getenv("REFRESH_TOKEN_EXPIRATION")
	if expStr == "" {
		return 7 * 24 * time.Hour
	}
	if duration, err := time.ParseDuration(expStr); err == nil {
		return duration
	}
	return 7 * 24 * time.Hour
}

func GenerateToken(userId string) (string, error) {
	token := jwt.New(jwt.SigningMethodHS256)
	claims := token.Claims.(jwt.MapClaims)
	claims["id"] = userId
	claims["exp"] = time.Now().UTC().Add(GetJWTExpiration()).Unix()
	claims["type"] = "access"
	return token.SignedString(secretKey)
}

func GenerateRefreshToken(userId string) (string, error) {
	token := jwt.New(jwt.SigningMethodHS256)
	claims := token.Claims.(jwt.MapClaims)
	claims["id"] = userId
	claims["exp"] = time.Now().UTC().Add(GetRefreshExpiration()).Unix()
	claims["type"] = "refresh"
	return token.SignedString(secretKey)
}

func LoginUser(c *fiber.Ctx, db *sql.DB) error {
	c.Cookie(&fiber.Cookie{Name: "token", Value: "", Expires: time.Now().UTC().Add(-1 * time.Hour), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax"})

	var credentials struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&credentials); err != nil {
		return middleware.ErrorResponse(c, fiber.StatusBadRequest, "Bad request")
	}

	var user model.User
	row := db.QueryRow("SELECT id, email, password FROM users WHERE email = ? AND isDeleted=0", credentials.Email)
	if err := row.Scan(&user.Id, &user.Email, &user.Password); err != nil {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "Invalid credentials")
	}

	if err := VerifyPassword(user.Password, credentials.Password); err != nil {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "Invalid credentials")
	}

	t, err := GenerateToken(user.Id)
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to generate token")
	}

	refreshToken, err := GenerateRefreshToken(user.Id)
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to generate refresh token")
	}

	err = store.CreateSession(db, user.Id, refreshToken, GetRefreshExpiration())
	if err != nil {
		log.Error().Err(err).Msg("Failed to create session")
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create session")
	}

	c.Cookie(&fiber.Cookie{Name: "token", Value: t, Expires: time.Now().UTC().Add(GetJWTExpiration()), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax"})
	c.Cookie(&fiber.Cookie{Name: "refresh_token", Value: refreshToken, Expires: time.Now().UTC().Add(GetRefreshExpiration()), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax", Path: "/api/refresh"})

	return c.JSON(fiber.Map{"token": t, "refreshToken": refreshToken, "expiresIn": GetJWTExpiration().Seconds(), "user": fiber.Map{"email": user.Email}})
}

func RefreshToken(c *fiber.Ctx, db *sql.DB) error {
	refreshToken := c.Cookies("refresh_token")
	if refreshToken == "" {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "Refresh token required")
	}

	userId, err := store.ValidateSession(db, refreshToken)
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, err.Error())
	}

	token, err := jwt.Parse(refreshToken, func(token *jwt.Token) (interface{}, error) {
		return secretKey, nil
	})
	if err != nil || !token.Valid {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "Invalid refresh token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "Invalid token claims")
	}

	if tokenType, ok := claims["type"].(string); !ok || tokenType != "refresh" {
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "Invalid token type")
	}

	var exists int
	err = db.QueryRow("SELECT COUNT(*) FROM users WHERE id = ? AND isDeleted = 0", userId).Scan(&exists)
	if err != nil || exists == 0 {
		store.RevokeSession(db, refreshToken)
		return middleware.ErrorResponse(c, fiber.StatusUnauthorized, "User not found")
	}

	newToken, err := GenerateToken(userId)
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to generate token")
	}

	c.Cookie(&fiber.Cookie{Name: "token", Value: newToken, Expires: time.Now().UTC().Add(GetJWTExpiration()), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax"})

	return c.JSON(fiber.Map{"token": newToken, "expiresIn": GetJWTExpiration().Seconds()})
}

func LogoutUser(c *fiber.Ctx, db *sql.DB) error {
	refreshToken := c.Cookies("refresh_token")
	if refreshToken != "" {
		if err := store.RevokeSession(db, refreshToken); err != nil {
			log.Error().Err(err).Msg("Failed to revoke session")
		}
	}

	c.Cookie(&fiber.Cookie{Name: "token", Value: "", Expires: time.Now().UTC().Add(-1 * time.Hour), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax"})
	c.Cookie(&fiber.Cookie{Name: "refresh_token", Value: "", Expires: time.Now().UTC().Add(-1 * time.Hour), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax", Path: "/api/refresh"})

	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}
