package model

import "time"

type User struct {
	Id              string `json:"id"`
	Email           string `json:"email"`
	Password        string `json:"password,omitempty"`
	ConfirmPassword string `json:"confirmPassword,omitempty"`
	CurrentPassword string `json:"currentPassword,omitempty"`
	IsAdmin         int    `json:"isAdmin,omitempty"`
	CreatedDate     string `json:"createdDate,omitempty"`
	ModifiedDate    string `json:"modifiedDate,omitempty"`
	DeletedDate     string `json:"deletedDate,omitempty"`
}

type Session struct {
	Id           string
	UserId       string
	RefreshToken string
	CreatedAt    time.Time
	LastUsedAt   time.Time
	ExpiresAt    time.Time
	IsRevoked    bool
}

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
	Id        string  `json:"id"`
	UserId    string  `json:"userId"`
	Tier      string  `json:"tier"`
	Status    string  `json:"status"`
	StartDate string  `json:"startDate"`
	EndDate   *string `json:"endDate,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

type GameManifest struct {
	Version     string   `json:"version"`
	EntryPoint  string   `json:"entryPoint"`
	Assets      []string `json:"assets"`
	TotalSize   int64    `json:"totalSize"`
	LastUpdated string   `json:"lastUpdated"`
}

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

type PasswordSettings struct {
	MinLength        int
	MaxLength        int
	RequireUppercase bool
	RequireLowercase bool
	RequireNumber    bool
	RequireSymbol    bool
}
