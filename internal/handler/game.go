package handler

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"

	"app/internal/middleware"
	"app/internal/model"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
)

func GetOptionalUserId(c *fiber.Ctx) string {
	tokenString := ""
	if authHeader := c.Get("Authorization"); authHeader != "" {
		tokenString = authHeader
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		}
	} else if cookieToken := c.Cookies("token"); cookieToken != "" {
		tokenString = cookieToken
	}
	if tokenString == "" {
		return ""
	}
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return middleware.SecretKey, nil
	})
	if err != nil || !token.Valid {
		return ""
	}
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		if userId, ok := claims["id"].(string); ok {
			return userId
		}
	}
	return ""
}

func GetUserTier(db *sql.DB, userId string) string {
	if userId == "" {
		return "free"
	}
	var tier string
	err := db.QueryRow(`
		SELECT tier FROM subscriptions
		WHERE userId = ? AND status = 'active'
		AND (endDate IS NULL OR endDate > CURRENT_TIMESTAMP)
		ORDER BY createdAt DESC LIMIT 1
	`, userId).Scan(&tier)
	if err != nil {
		return "free"
	}
	return tier
}

func CanAccessTier(userTier string, requiredTier string) bool {
	tierHierarchy := map[string]int{"free": 0, "basic": 1, "premium": 2}
	userLevel, userExists := tierHierarchy[userTier]
	requiredLevel, requiredExists := tierHierarchy[requiredTier]
	if !userExists || !requiredExists {
		return false
	}
	return userLevel >= requiredLevel
}

func GetGamesPublic(c *fiber.Ctx, db *sql.DB) error {
	userId := GetOptionalUserId(c)
	userTier := GetUserTier(db, userId)

	rows, err := db.Query(`SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes, createdAt, updatedAt FROM games ORDER BY name ASC`)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	defer rows.Close()

	var games []model.Game
	for rows.Next() {
		var game model.Game
		err := rows.Scan(&game.Id, &game.Slug, &game.Name, &game.Description, &game.Version, &game.TierRequired, &game.ManifestPath, &game.SizeBytes, &game.CreatedAt, &game.UpdatedAt)
		if err != nil {
			return middleware.StandardErrorResponse(c, 500, "Database scan error", err)
		}
		if CanAccessTier(userTier, game.TierRequired) {
			games = append(games, game)
		}
	}

	if games == nil {
		games = []model.Game{}
	}

	return c.JSON(fiber.Map{"games": games, "userTier": userTier, "isAuthenticated": userId != ""})
}

func ServeGameFile(c *fiber.Ctx, db *sql.DB) error {
	slug := c.Params("slug")
	filePath := c.Params("*")
	if filePath == "" {
		filePath = "index.html"
	}

	userId := GetOptionalUserId(c)
	userTier := GetUserTier(db, userId)

	var tierRequired string
	err := db.QueryRow(`SELECT tierRequired FROM games WHERE slug = ?`, slug).Scan(&tierRequired)
	if err == sql.ErrNoRows {
		return middleware.ErrorResponse(c, 404, "Game not found")
	}
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	if !CanAccessTier(userTier, tierRequired) {
		return middleware.ErrorResponse(c, 403, "Subscription tier required: "+tierRequired)
	}

	fullPath := filepath.Join("games", slug, filePath)
	return c.SendFile(fullPath)
}

func GetGameManifestPublic(c *fiber.Ctx, db *sql.DB) error {
	slug := c.Params("slug")
	userId := GetOptionalUserId(c)
	userTier := GetUserTier(db, userId)

	var game model.Game
	err := db.QueryRow(`SELECT id, slug, name, tierRequired, manifestPath FROM games WHERE slug = ?`, slug).Scan(&game.Id, &game.Slug, &game.Name, &game.TierRequired, &game.ManifestPath)
	if err == sql.ErrNoRows {
		return middleware.ErrorResponse(c, 404, "Game not found")
	}
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	if !CanAccessTier(userTier, game.TierRequired) {
		return middleware.ErrorResponse(c, 403, "Subscription tier required: "+game.TierRequired)
	}

	manifestData, err := os.ReadFile(game.ManifestPath)
	if err != nil {
		return middleware.ErrorResponse(c, 404, "Manifest file not found")
	}

	var manifest model.GameManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return middleware.ErrorResponse(c, 500, "Invalid manifest format")
	}

	return c.JSON(manifest)
}
