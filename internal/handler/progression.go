package handler

import (
	"database/sql"
	"encoding/json"
	"time"

	"app/internal/middleware"
	"app/internal/model"

	"github.com/gofiber/fiber/v2"
)

func GetProgression(c *fiber.Ctx, db *sql.DB) error {
	userId, ok := c.Locals("userId").(string)
	if !ok || userId == "" {
		return middleware.ErrorResponse(c, 401, "Unauthorized")
	}

	var progression model.UserProgression
	var achievementsJSON, unlockedItemsJSON string

	err := db.QueryRow(`SELECT userId, coins, xp, achievements, unlockedItems, lastSyncedAt FROM user_progression WHERE userId = ?`, userId).Scan(&progression.UserId, &progression.Coins, &progression.Xp, &achievementsJSON, &unlockedItemsJSON, &progression.LastSyncedAt)

	if err == sql.ErrNoRows {
		progression = model.UserProgression{UserId: userId, Coins: 0, Xp: 0, Achievements: []string{}, UnlockedItems: []string{}, LastSyncedAt: time.Now().UTC().Format(time.RFC3339)}
		achievementsJSON = "[]"
		unlockedItemsJSON = "[]"
		_, err = db.Exec(`INSERT INTO user_progression(userId, coins, xp, achievements, unlockedItems, lastSyncedAt) VALUES (?, 0, 0, '[]', '[]', CURRENT_TIMESTAMP)`, userId)
		if err != nil {
			return middleware.StandardErrorResponse(c, 500, "Failed to initialize progression", err)
		}
	} else if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	if err := json.Unmarshal([]byte(achievementsJSON), &progression.Achievements); err != nil {
		progression.Achievements = []string{}
	}
	if err := json.Unmarshal([]byte(unlockedItemsJSON), &progression.UnlockedItems); err != nil {
		progression.UnlockedItems = []string{}
	}

	if progression.Achievements == nil {
		progression.Achievements = []string{}
	}
	if progression.UnlockedItems == nil {
		progression.UnlockedItems = []string{}
	}

	return c.JSON(progression)
}

func SyncProgression(c *fiber.Ctx, db *sql.DB) error {
	userId, ok := c.Locals("userId").(string)
	if !ok || userId == "" {
		return middleware.ErrorResponse(c, 401, "Unauthorized")
	}

	var syncReq model.ProgressionSyncRequest
	if err := c.BodyParser(&syncReq); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}

	if syncReq.CoinsEarned < 0 || syncReq.XpEarned < 0 {
		return middleware.ErrorResponse(c, 400, "Coins and XP values cannot be negative")
	}

	var currentProgression model.UserProgression
	var achievementsJSON, unlockedItemsJSON string

	err := db.QueryRow(`SELECT userId, coins, xp, achievements, unlockedItems, lastSyncedAt FROM user_progression WHERE userId = ?`, userId).Scan(&currentProgression.UserId, &currentProgression.Coins, &currentProgression.Xp, &achievementsJSON, &unlockedItemsJSON, &currentProgression.LastSyncedAt)

	if err == sql.ErrNoRows {
		currentProgression = model.UserProgression{UserId: userId, Coins: 0, Xp: 0, Achievements: []string{}, UnlockedItems: []string{}}
		achievementsJSON = "[]"
		unlockedItemsJSON = "[]"
	} else if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	if err := json.Unmarshal([]byte(achievementsJSON), &currentProgression.Achievements); err != nil {
		currentProgression.Achievements = []string{}
	}
	if err := json.Unmarshal([]byte(unlockedItemsJSON), &currentProgression.UnlockedItems); err != nil {
		currentProgression.UnlockedItems = []string{}
	}

	newCoins := currentProgression.Coins + syncReq.CoinsEarned
	newXp := currentProgression.Xp + syncReq.XpEarned

	mergedAchievements := mergeUniqueStrings(currentProgression.Achievements, syncReq.NewAchievements)
	mergedUnlockedItems := mergeUniqueStrings(currentProgression.UnlockedItems, syncReq.NewUnlockedItems)

	achievementsJSONBytes, err := json.Marshal(mergedAchievements)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to serialize achievements", err)
	}
	unlockedItemsJSONBytes, err := json.Marshal(mergedUnlockedItems)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to serialize unlocked items", err)
	}

	_, err = db.Exec(`
		INSERT INTO user_progression(userId, coins, xp, achievements, unlockedItems, lastSyncedAt)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(userId) DO UPDATE SET
			coins = excluded.coins,
			xp = excluded.xp,
			achievements = excluded.achievements,
			unlockedItems = excluded.unlockedItems,
			lastSyncedAt = excluded.lastSyncedAt
	`, userId, newCoins, newXp, string(achievementsJSONBytes), string(unlockedItemsJSONBytes))

	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to update progression", err)
	}

	result := model.UserProgression{UserId: userId, Coins: newCoins, Xp: newXp, Achievements: mergedAchievements, UnlockedItems: mergedUnlockedItems, LastSyncedAt: time.Now().UTC().Format(time.RFC3339)}

	return c.JSON(result)
}

func mergeUniqueStrings(existing []string, new []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(existing)+len(new))
	for _, item := range existing {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	for _, item := range new {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}
