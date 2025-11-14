package api

import (
	"database/sql"
	"encoding/json"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"os"
	"path/filepath"
)

type Game struct {
	Id           string `json:"id"`
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	Description  string `json:"description,omitempty"`
	Version      string `json:"version"`
	TierRequired string `json:"tierRequired"`
	ManifestPath string `json:"manifestPath"`
	SizeBytes    int64  `json:"sizeBytes"`
	CreatedAt    string `json:"createdAt,omitempty"`
	UpdatedAt    string `json:"updatedAt,omitempty"`
}

type Subscription struct {
	Id        string `json:"id"`
	UserId    string `json:"userId"`
	Tier      string `json:"tier"`
	Status    string `json:"status"`
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type GameManifest struct {
	Version     string   `json:"version"`
	EntryPoint  string   `json:"entryPoint"`
	Assets      []string `json:"assets"`
	TotalSize   int64    `json:"totalSize"`
	LastUpdated string   `json:"lastUpdated"`
}

func GetOptionalUserId(c *fiber.Ctx) string {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return ""
	}
	tokenString := authHeader
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		tokenString = authHeader[7:]
	}
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.ErrUnauthorized
		}
		return SecretKey, nil
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

	rows, err := db.Query(`
		SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes, createdAt, updatedAt
		FROM games
		ORDER BY name ASC
	`)
	if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var game Game
		err := rows.Scan(&game.Id, &game.Slug, &game.Name, &game.Description, &game.Version, &game.TierRequired, &game.ManifestPath, &game.SizeBytes, &game.CreatedAt, &game.UpdatedAt)
		if err != nil {
			return StandardErrorResponse(c, 500, "Database scan error", err)
		}
		if CanAccessTier(userTier, game.TierRequired) {
			games = append(games, game)
		}
	}

	if games == nil {
		games = []Game{}
	}

	return c.JSON(fiber.Map{"games": games, "userTier": userTier, "isAuthenticated": userId != ""})
}

func GetGames(c *fiber.Ctx, db *sql.DB) error {
	userId := c.Locals("userId").(string)
	userTier := GetUserTier(db, userId)

	rows, err := db.Query(`
		SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes, createdAt, updatedAt
		FROM games
		ORDER BY name ASC
	`)
	if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var game Game
		err := rows.Scan(&game.Id, &game.Slug, &game.Name, &game.Description, &game.Version, &game.TierRequired, &game.ManifestPath, &game.SizeBytes, &game.CreatedAt, &game.UpdatedAt)
		if err != nil {
			return StandardErrorResponse(c, 500, "Database scan error", err)
		}
		if CanAccessTier(userTier, game.TierRequired) {
			games = append(games, game)
		}
	}

	if games == nil {
		games = []Game{}
	}

	return c.JSON(fiber.Map{"games": games, "userTier": userTier})
}

func GetGameManifestPublic(c *fiber.Ctx, db *sql.DB) error {
	slug := c.Params("slug")
	userId := GetOptionalUserId(c)
	userTier := GetUserTier(db, userId)

	var game Game
	err := db.QueryRow(`
		SELECT id, slug, name, tierRequired, manifestPath
		FROM games
		WHERE slug = ?
	`, slug).Scan(&game.Id, &game.Slug, &game.Name, &game.TierRequired, &game.ManifestPath)

	if err == sql.ErrNoRows {
		return ErrorResponse(c, 404, "Game not found")
	}
	if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}

	if !CanAccessTier(userTier, game.TierRequired) {
		return ErrorResponse(c, 403, "Subscription tier required: "+game.TierRequired)
	}

	manifestPath := filepath.Join("games", slug, "manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		return ErrorResponse(c, 404, "Manifest file not found")
	}

	var manifest GameManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return ErrorResponse(c, 500, "Invalid manifest format")
	}

	return c.JSON(manifest)
}

func GetGameManifest(c *fiber.Ctx, db *sql.DB) error {
	slug := c.Params("slug")
	userId := c.Locals("userId").(string)
	userTier := GetUserTier(db, userId)

	var game Game
	err := db.QueryRow(`
		SELECT id, slug, name, tierRequired, manifestPath
		FROM games
		WHERE slug = ?
	`, slug).Scan(&game.Id, &game.Slug, &game.Name, &game.TierRequired, &game.ManifestPath)

	if err == sql.ErrNoRows {
		return ErrorResponse(c, 404, "Game not found")
	}
	if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}

	if !CanAccessTier(userTier, game.TierRequired) {
		return ErrorResponse(c, 403, "Subscription tier required: "+game.TierRequired)
	}

	manifestPath := filepath.Join("games", slug, "manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		return ErrorResponse(c, 404, "Manifest file not found")
	}

	var manifest GameManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		return ErrorResponse(c, 500, "Invalid manifest format")
	}

	return c.JSON(manifest)
}
