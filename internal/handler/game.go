package handler

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"

	"app/internal/middleware"
	"app/internal/model"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"github.com/google/uuid"
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

	limit, _ := strconv.Atoi(c.Query("limit", "0"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM games`).Scan(&total); err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	query := `SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes, createdAt, updatedAt FROM games ORDER BY name ASC`
	if limit > 0 {
		query += " LIMIT " + strconv.Itoa(limit) + " OFFSET " + strconv.Itoa(offset)
	}

	rows, err := db.Query(query)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	defer rows.Close()

	games := []model.Game{}
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

	return c.JSON(fiber.Map{"games": games, "total": total, "limit": limit, "offset": offset, "userTier": userTier, "isAuthenticated": userId != ""})
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

func CreateGame(c *fiber.Ctx, db *sql.DB) error {
	var game model.Game
	if err := c.BodyParser(&game); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}
	if game.Slug == "" || game.Name == "" || game.ManifestPath == "" {
		return middleware.ErrorResponse(c, 400, "Slug, name, and manifestPath are required")
	}
	var existingSlug string
	err := db.QueryRow("SELECT slug FROM games WHERE slug = ?", game.Slug).Scan(&existingSlug)
	if err == nil {
		return middleware.ErrorResponse(c, 409, "Game with this slug already exists")
	}
	game.Id = uuid.New().String()
	if game.Version == "" {
		game.Version = "1.0.0"
	}
	if game.TierRequired == "" {
		game.TierRequired = "free"
	}
	_, err = db.Exec("INSERT INTO games(id, slug, name, description, version, tierRequired, manifestPath, sizeBytes) VALUES(?,?,?,?,?,?,?,?)", game.Id, game.Slug, game.Name, game.Description, game.Version, game.TierRequired, game.ManifestPath, game.SizeBytes)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to create game", err)
	}
	err = db.QueryRow("SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes, createdAt, updatedAt FROM games WHERE id = ?", game.Id).Scan(&game.Id, &game.Slug, &game.Name, &game.Description, &game.Version, &game.TierRequired, &game.ManifestPath, &game.SizeBytes, &game.CreatedAt, &game.UpdatedAt)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to retrieve created game", err)
	}
	return c.Status(201).JSON(game)
}

func UpdateGame(c *fiber.Ctx, db *sql.DB) error {
	slug := c.Params("slug")
	var existingGame model.Game
	err := db.QueryRow("SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes FROM games WHERE slug = ?", slug).Scan(&existingGame.Id, &existingGame.Slug, &existingGame.Name, &existingGame.Description, &existingGame.Version, &existingGame.TierRequired, &existingGame.ManifestPath, &existingGame.SizeBytes)
	if err == sql.ErrNoRows {
		return middleware.ErrorResponse(c, 404, "Game not found")
	}
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	var updates model.Game
	if err := c.BodyParser(&updates); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}
	if updates.Name != "" {
		existingGame.Name = updates.Name
	}
	if updates.Description != "" {
		existingGame.Description = updates.Description
	}
	if updates.Version != "" {
		existingGame.Version = updates.Version
	}
	if updates.TierRequired != "" {
		existingGame.TierRequired = updates.TierRequired
	}
	if updates.ManifestPath != "" {
		existingGame.ManifestPath = updates.ManifestPath
	}
	if updates.SizeBytes != 0 {
		existingGame.SizeBytes = updates.SizeBytes
	}
	_, err = db.Exec("UPDATE games SET name=?, description=?, version=?, tierRequired=?, manifestPath=?, sizeBytes=?, updatedAt=CURRENT_TIMESTAMP WHERE slug=?", existingGame.Name, existingGame.Description, existingGame.Version, existingGame.TierRequired, existingGame.ManifestPath, existingGame.SizeBytes, slug)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to update game", err)
	}
	err = db.QueryRow("SELECT id, slug, name, description, version, tierRequired, manifestPath, sizeBytes, createdAt, updatedAt FROM games WHERE slug = ?", slug).Scan(&existingGame.Id, &existingGame.Slug, &existingGame.Name, &existingGame.Description, &existingGame.Version, &existingGame.TierRequired, &existingGame.ManifestPath, &existingGame.SizeBytes, &existingGame.CreatedAt, &existingGame.UpdatedAt)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to retrieve updated game", err)
	}
	return c.JSON(existingGame)
}

func DeleteGame(c *fiber.Ctx, db *sql.DB) error {
	slug := c.Params("slug")
	result, err := db.Exec("DELETE FROM games WHERE slug = ?", slug)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to delete game", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to check deletion result", err)
	}
	if rowsAffected == 0 {
		return middleware.ErrorResponse(c, 404, "Game not found")
	}
	return c.JSON(fiber.Map{"message": "Game deleted"})
}
