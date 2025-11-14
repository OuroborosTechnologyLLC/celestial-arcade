package api

import (
	"database/sql"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"log"
	"os"
	"time"
)

/**
 * SecretKey is used for signing and verifying JWT tokens
 * Loaded from JWT_SECRET environment variable
 */
var SecretKey []byte

/**
 * InitializeAuth sets up the JWT secret key from environment
 * Must be called during application startup
 */
func InitializeAuth() {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET environment variable is required but not set. Please set it in your .env file or environment variables.")
	}
	if len(jwtSecret) < 32 {
		log.Println("Warning: JWT_SECRET should be at least 32 characters long for security")
	}
	SecretKey = []byte(jwtSecret)
	log.Println("JWT authentication initialized successfully")
}

/**
 * GetJWTExpiration returns the JWT expiration duration from environment
 * Defaults to 24 hours if not set
 */
func GetJWTExpiration() time.Duration {
	expStr := os.Getenv("JWT_EXPIRATION")
	if expStr == "" {
		return 24 * time.Hour // Default: 24 hours
	}
	if duration, err := time.ParseDuration(expStr); err == nil {
		return duration
	}
	return 24 * time.Hour
}

/**
 * GetRefreshExpiration returns the refresh token expiration duration
 * Defaults to 7 days if not set
 */
func GetRefreshExpiration() time.Duration {
	expStr := os.Getenv("REFRESH_TOKEN_EXPIRATION")
	if expStr == "" {
		return 7 * 24 * time.Hour // Default: 7 days
	}
	if duration, err := time.ParseDuration(expStr); err == nil {
		return duration
	}
	return 7 * 24 * time.Hour
}

/**
 * GenerateToken creates a JWT token for a user
 * @param {string} userId - User ID
 * @returns {string, error} - Token and error if any
 */
func GenerateToken(userId string) (string, error) {
	token := jwt.New(jwt.SigningMethodHS256)
	claims := token.Claims.(jwt.MapClaims)
	claims["id"] = userId
	claims["exp"] = time.Now().UTC().Add(GetJWTExpiration()).Unix()
	claims["type"] = "access"

	t, err := token.SignedString(SecretKey)
	if err != nil {
		return "", err
	}

	return t, nil
}

/**
 * GenerateRefreshToken creates a refresh token for a user
 * @param {string} userId - User ID
 * @returns {string, error} - Refresh token and error if any
 */
func GenerateRefreshToken(userId string) (string, error) {
	token := jwt.New(jwt.SigningMethodHS256)
	claims := token.Claims.(jwt.MapClaims)
	claims["id"] = userId
	claims["exp"] = time.Now().UTC().Add(GetRefreshExpiration()).Unix()
	claims["type"] = "refresh"

	t, err := token.SignedString(SecretKey)
	if err != nil {
		return "", err
	}

	return t, nil
}

/**
 * Authenticates a user and generates a JWT token
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func LoginUser(c *fiber.Ctx, db *sql.DB) error {
	// Clear any existing token first
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Expires:  time.Now().UTC().Add(-1 * time.Hour),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
	})

	/**
	 * Credentials struct for login
	 * @field {string} Email - User's email
	 * @field {string} Password - User's password
	 */
	var credentials struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&credentials); err != nil {
		return ErrorResponse(c, fiber.StatusBadRequest, "Bad request")
	}

	var user User

	row := db.QueryRow("SELECT id, email, password FROM users WHERE email = ? AND isDeleted=0",
		credentials.Email)
	if err := row.Scan(&user.Id, &user.Email, &user.Password); err != nil {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Invalid credentials")
	}

	// Compare the plain password with the stored hash
	if err := VerifyPassword(user.Password, credentials.Password); err != nil {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Invalid credentials")
	}

	t, err := GenerateToken(user.Id)
	if err != nil {
		return ErrorResponse(c, fiber.StatusInternalServerError, "Failed to generate token")
	}

	refreshToken, err := GenerateRefreshToken(user.Id)
	if err != nil {
		return ErrorResponse(c, fiber.StatusInternalServerError, "Failed to generate refresh token")
	}

	// Store session in database
	err = CreateSession(db, user.Id, refreshToken)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		return ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create session")
	}

	// Set the access token as an HTTPOnly cookie
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    t,
		Expires:  time.Now().UTC().Add(GetJWTExpiration()),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
	})

	// Set the refresh token as a separate HTTPOnly cookie
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Expires:  time.Now().UTC().Add(GetRefreshExpiration()),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
		Path:     "/api/refresh", // Only send refresh token to refresh endpoint
	})

	return c.JSON(fiber.Map{
		"token":        t,
		"refreshToken": refreshToken,
		"expiresIn":    GetJWTExpiration().Seconds(),
		"user": fiber.Map{
			"email": user.Email,
		},
	})
}

/**
 * VerifyToken verifies a JWT token and returns the claims
 * @param {string} tokenString - JWT token string
 * @returns {jwt.MapClaims, error} - Claims and error if any
 */
func VerifyToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return SecretKey, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, jwt.ErrInvalidKey
}

/**
 * RefreshToken handles token refresh requests
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func RefreshToken(c *fiber.Ctx, db *sql.DB) error {
	// Get refresh token from cookie
	refreshToken := c.Cookies("refresh_token")
	if refreshToken == "" {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Refresh token required")
	}

	// Validate session in database (checks if revoked, expired, etc.)
	userId, err := ValidateSession(db, refreshToken)
	if err != nil {
		return ErrorResponse(c, fiber.StatusUnauthorized, err.Error())
	}

	// Verify refresh token JWT
	token, err := jwt.Parse(refreshToken, func(token *jwt.Token) (interface{}, error) {
		return SecretKey, nil
	})

	if err != nil || !token.Valid {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Invalid refresh token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Invalid token claims")
	}

	// Check token type
	if tokenType, ok := claims["type"].(string); !ok || tokenType != "refresh" {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Invalid token type")
	}

	// Verify user still exists and is active
	var exists int
	err = db.QueryRow("SELECT COUNT(*) FROM users WHERE id = ? AND isDeleted = 0", userId).Scan(&exists)
	if err != nil || exists == 0 {
		// Revoke session if user no longer exists
		RevokeSession(db, refreshToken)
		return ErrorResponse(c, fiber.StatusUnauthorized, "User not found")
	}

	// Generate new access token
	newToken, err := GenerateToken(userId)
	if err != nil {
		return ErrorResponse(c, fiber.StatusInternalServerError, "Failed to generate token")
	}

	// Set new access token cookie
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    newToken,
		Expires:  time.Now().UTC().Add(GetJWTExpiration()),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
	})

	return c.JSON(fiber.Map{"token": newToken, "expiresIn": GetJWTExpiration().Seconds()})
}

/**
 * LogoutUser revokes the current session and clears cookies
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func LogoutUser(c *fiber.Ctx, db *sql.DB) error {
	// Get refresh token from cookie
	refreshToken := c.Cookies("refresh_token")
	if refreshToken != "" {
		// Revoke the session in the database
		err := RevokeSession(db, refreshToken)
		if err != nil {
			log.Printf("Failed to revoke session: %v", err)
		}
	}

	// Clear access token cookie
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Expires:  time.Now().UTC().Add(-1 * time.Hour),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
	})

	// Clear refresh token cookie
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Expires:  time.Now().UTC().Add(-1 * time.Hour),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
		Path:     "/api/refresh",
	})

	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}
