package store

import (
	"database/sql"
	"time"

	"app/internal/model"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

func CreateSession(db *sql.DB, userId string, refreshToken string, expiration time.Duration) error {
	sessionId := uuid.New().String()
	expiresAt := time.Now().UTC().Add(expiration)

	_, err := db.Exec(`INSERT INTO sessions(id, userId, refreshToken, expiresAt) VALUES(?, ?, ?, ?)`, sessionId, userId, refreshToken, expiresAt)
	return err
}

func ValidateSession(db *sql.DB, refreshToken string) (string, error) {
	var session model.Session

	err := db.QueryRow(`SELECT id, userId, refreshToken, expiresAt, isRevoked FROM sessions WHERE refreshToken = ?`, refreshToken).Scan(&session.Id, &session.UserId, &session.RefreshToken, &session.ExpiresAt, &session.IsRevoked)
	if err != nil {
		return "", err
	}

	if session.IsRevoked {
		return "", fiber.NewError(fiber.StatusUnauthorized, "Session has been revoked")
	}

	if time.Now().UTC().After(session.ExpiresAt) {
		return "", fiber.NewError(fiber.StatusUnauthorized, "Session has expired")
	}

	_, err = db.Exec(`UPDATE sessions SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ?`, session.Id)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to update session lastUsedAt")
	}

	return session.UserId, nil
}

func RevokeSession(db *sql.DB, refreshToken string) error {
	_, err := db.Exec(`UPDATE sessions SET isRevoked = 1 WHERE refreshToken = ?`, refreshToken)
	return err
}

func RevokeAllUserSessions(db *sql.DB, userId string) error {
	_, err := db.Exec(`UPDATE sessions SET isRevoked = 1 WHERE userId = ?`, userId)
	return err
}

func CleanupExpiredSessions(db *sql.DB) error {
	_, err := db.Exec(`DELETE FROM sessions WHERE expiresAt < CURRENT_TIMESTAMP OR isRevoked = 1`)
	return err
}
