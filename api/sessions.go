package api

import (
	"database/sql"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"log"
	"time"
)

/**
 * Session represents a user session in the database
 */
type Session struct {
	Id           string
	UserId       string
	RefreshToken string
	CreatedAt    time.Time
	LastUsedAt   time.Time
	ExpiresAt    time.Time
	IsRevoked    bool
}

/**
 * CreateSession stores a new session in the database
 * @param {*sql.DB} db - Database connection
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token
 * @returns {error} Error if any
 */
func CreateSession(db *sql.DB, userId string, refreshToken string) error {
	sessionId := uuid.New().String()
	expiresAt := time.Now().UTC().Add(GetRefreshExpiration())

	_, err := db.Exec(`
		INSERT INTO sessions(id, userId, refreshToken, expiresAt) 
		VALUES(?, ?, ?, ?)`,
		sessionId, userId, refreshToken, expiresAt)

	return err
}

/**
 * ValidateSession checks if a session is valid and not revoked
 * Updates lastUsedAt if valid
 * @param {*sql.DB} db - Database connection
 * @param {string} refreshToken - Refresh token to validate
 * @returns {string, error} - UserId and error if any
 */
func ValidateSession(db *sql.DB, refreshToken string) (string, error) {
	var session Session

	err := db.QueryRow(`
		SELECT id, userId, refreshToken, expiresAt, isRevoked 
		FROM sessions 
		WHERE refreshToken = ?`,
		refreshToken).Scan(
		&session.Id,
		&session.UserId,
		&session.RefreshToken,
		&session.ExpiresAt,
		&session.IsRevoked)

	if err != nil {
		return "", err
	}

	// Check if session is revoked
	if session.IsRevoked {
		return "", fiber.NewError(fiber.StatusUnauthorized, "Session has been revoked")
	}

	// Check if session is expired
	if time.Now().UTC().After(session.ExpiresAt) {
		return "", fiber.NewError(fiber.StatusUnauthorized, "Session has expired")
	}

	// Update lastUsedAt
	_, err = db.Exec(`UPDATE sessions SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ?`, session.Id)
	if err != nil {
		log.Printf("Warning: Failed to update session lastUsedAt: %v", err)
	}

	return session.UserId, nil
}

/**
 * RevokeSession marks a session as revoked
 * @param {*sql.DB} db - Database connection
 * @param {string} refreshToken - Refresh token to revoke
 * @returns {error} Error if any
 */
func RevokeSession(db *sql.DB, refreshToken string) error {
	_, err := db.Exec(`UPDATE sessions SET isRevoked = 1 WHERE refreshToken = ?`, refreshToken)
	return err
}

/**
 * RevokeAllUserSessions revokes all sessions for a user
 * Useful for "logout everywhere" or when subscription ends
 * @param {*sql.DB} db - Database connection
 * @param {string} userId - User ID
 * @returns {error} Error if any
 */
func RevokeAllUserSessions(db *sql.DB, userId string) error {
	_, err := db.Exec(`UPDATE sessions SET isRevoked = 1 WHERE userId = ?`, userId)
	return err
}

/**
 * CleanupExpiredSessions removes expired sessions from the database
 * Should be called periodically (e.g., daily cron job)
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func CleanupExpiredSessions(db *sql.DB) error {
	_, err := db.Exec(`DELETE FROM sessions WHERE expiresAt < CURRENT_TIMESTAMP OR isRevoked = 1`)
	return err
}
