package api

import (
	"database/sql"
	"encoding/json"
	"github.com/gofiber/fiber/v2"
	"time"
)

type UserProgression struct {
	UserId        string   `json:"userId"`
	Coins         int      `json:"coins"`
	Xp            int      `json:"xp"`
	Achievements  []string `json:"achievements"`
	UnlockedItems []string `json:"unlockedItems"`
	LastSyncedAt  string   `json:"lastSyncedAt"`
}

type ProgressionSyncRequest struct {
	CoinsEarned        int      `json:"coinsEarned"`
	XpEarned           int      `json:"xpEarned"`
	NewAchievements    []string `json:"newAchievements"`
	NewUnlockedItems   []string `json:"newUnlockedItems"`
	ClientLastSyncedAt string   `json:"clientLastSyncedAt"`
}

func GetProgression(c *fiber.Ctx, db *sql.DB) error {
	userId := c.Locals("userId").(string)

	var progression UserProgression
	var achievementsJSON, unlockedItemsJSON string

	err := db.QueryRow(`
		SELECT userId, coins, xp, achievements, unlockedItems, lastSyncedAt
		FROM user_progression
		WHERE userId = ?
	`, userId).Scan(&progression.UserId, &progression.Coins, &progression.Xp, &achievementsJSON, &unlockedItemsJSON, &progression.LastSyncedAt)

	if err == sql.ErrNoRows {
		progression = UserProgression{UserId: userId, Coins: 0, Xp: 0, Achievements: []string{}, UnlockedItems: []string{}, LastSyncedAt: time.Now().UTC().Format(time.RFC3339)}
		achievementsJSON = "[]"
		unlockedItemsJSON = "[]"
		_, err = db.Exec(`
			INSERT INTO user_progression(userId, coins, xp, achievements, unlockedItems, lastSyncedAt)
			VALUES (?, 0, 0, '[]', '[]', CURRENT_TIMESTAMP)
		`, userId)
		if err != nil {
			return StandardErrorResponse(c, 500, "Failed to initialize progression", err)
		}
	} else if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
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
	userId := c.Locals("userId").(string)

	var syncReq ProgressionSyncRequest
	if err := c.BodyParser(&syncReq); err != nil {
		return ErrorResponse(c, 400, "Invalid request body")
	}

	var currentProgression UserProgression
	var achievementsJSON, unlockedItemsJSON string

	err := db.QueryRow(`
		SELECT userId, coins, xp, achievements, unlockedItems, lastSyncedAt
		FROM user_progression
		WHERE userId = ?
	`, userId).Scan(&currentProgression.UserId, &currentProgression.Coins, &currentProgression.Xp, &achievementsJSON, &unlockedItemsJSON, &currentProgression.LastSyncedAt)

	if err == sql.ErrNoRows {
		currentProgression = UserProgression{UserId: userId, Coins: 0, Xp: 0, Achievements: []string{}, UnlockedItems: []string{}}
		achievementsJSON = "[]"
		unlockedItemsJSON = "[]"
	} else if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
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

	achievementsJSONBytes, _ := json.Marshal(mergedAchievements)
	unlockedItemsJSONBytes, _ := json.Marshal(mergedUnlockedItems)

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
		return StandardErrorResponse(c, 500, "Failed to update progression", err)
	}

	result := UserProgression{UserId: userId, Coins: newCoins, Xp: newXp, Achievements: mergedAchievements, UnlockedItems: mergedUnlockedItems, LastSyncedAt: time.Now().UTC().Format(time.RFC3339)}

	return c.JSON(result)
}

func mergeUniqueStrings(existing []string, new []string) []string {
	uniqueMap := make(map[string]bool)
	for _, item := range existing {
		uniqueMap[item] = true
	}
	for _, item := range new {
		uniqueMap[item] = true
	}
	result := make([]string, 0, len(uniqueMap))
	for item := range uniqueMap {
		result = append(result, item)
	}
	return result
}
