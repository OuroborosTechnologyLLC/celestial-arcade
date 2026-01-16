package store

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog/log"
)

func InitializeDatabase(dbPath string) *sql.DB {
	connectionString := dbPath + "?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON"

	db, err := sql.Open("sqlite3", connectionString)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to open database")
	}

	if err = db.Ping(); err != nil {
		log.Fatal().Err(err).Msg("Could not ping database")
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	_, err = db.Exec("PRAGMA auto_vacuum=INCREMENTAL;")
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to enable auto vacuum")
	}

	_, err = db.Exec("PRAGMA incremental_vacuum;")
	if err != nil {
		log.Warn().Err(err).Msg("Failed to run incremental vacuum")
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users(
			id TEXT PRIMARY KEY,
			email TEXT UNIQUE,
			password TEXT,
			createdDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			modifiedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			deletedDate TIMESTAMP,
			isDeleted INTEGER DEFAULT 0
		)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions(
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL,
			refreshToken TEXT NOT NULL,
			createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			lastUsedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			expiresAt TIMESTAMP NOT NULL,
			isRevoked INTEGER DEFAULT 0,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
		)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_sessions_refreshToken ON sessions(refreshToken)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS subscriptions(
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL,
			tier TEXT NOT NULL DEFAULT 'free',
			status TEXT NOT NULL DEFAULT 'active',
			startDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			endDate TIMESTAMP,
			createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
		)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_userId ON subscriptions(userId)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS games(
			id TEXT PRIMARY KEY,
			slug TEXT UNIQUE NOT NULL,
			name TEXT NOT NULL,
			description TEXT,
			version TEXT NOT NULL DEFAULT '1.0.0',
			tierRequired TEXT NOT NULL DEFAULT 'free',
			manifestPath TEXT NOT NULL,
			sizeBytes INTEGER DEFAULT 0,
			createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_games_tierRequired ON games(tierRequired)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS user_progression(
			userId TEXT PRIMARY KEY,
			coins INTEGER DEFAULT 0,
			xp INTEGER DEFAULT 0,
			achievements TEXT DEFAULT '[]',
			unlockedItems TEXT DEFAULT '[]',
			lastSyncedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
		)`)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create table")
	}

	return db
}
