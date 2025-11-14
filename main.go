package main

import (
	"app/api"
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
)

/**
 * Sets up API routes and middleware for the application
 * @param {*fiber.App} app - Fiber application instance
 * @param {*sql.DB} db - Database connection object
 */
func initializeAPIRoutes(app *fiber.App, db *sql.DB) {
	apiGroup := app.Group("/api")

	apiGroup.Post("/users", func(c *fiber.Ctx) error { return api.CreateUser(c, db) })
	apiGroup.Post("/login", func(c *fiber.Ctx) error { return api.LoginUser(c, db) })
	apiGroup.Post("/refresh", func(c *fiber.Ctx) error { return api.RefreshToken(c, db) })
	apiGroup.Post("/logout", func(c *fiber.Ctx) error { return api.LogoutUser(c, db) })
	apiGroup.Get("/games", func(c *fiber.Ctx) error { return api.GetGamesPublic(c, db) })
	apiGroup.Get("/games/:slug/manifest", func(c *fiber.Ctx) error { return api.GetGameManifestPublic(c, db) })

	apiGroup.Use(api.AuthMiddleware)

	apiGroup.Get("/users/me", func(c *fiber.Ctx) error { return api.GetCurrentUser(c, db) })
	apiGroup.Get("/users/:id", func(c *fiber.Ctx) error { return api.GetUser(c, db) })
	apiGroup.Put("/users/:id", func(c *fiber.Ctx) error { return api.UpdateUser(c, db) })
	apiGroup.Delete("/users/:id", func(c *fiber.Ctx) error { return api.DeleteUser(c, db) })

	apiGroup.Get("/progression", func(c *fiber.Ctx) error { return api.GetProgression(c, db) })
	apiGroup.Post("/progression/sync", func(c *fiber.Ctx) error { return api.SyncProgression(c, db) })
}

/**
 * Main application entry point
 */
func main() {
	// Set up file logging
	logFile, err := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		// Fall back to console if can't open log file
		fmt.Printf("Failed to open log file: %v\n", err)
	} else {
		// Redirect all log output to the file
		log.SetOutput(logFile)
		defer logFile.Close()
	}

	// Add timestamp and source file info to log entries
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	// Use godotenv.Overload() to ensure .env values take precedence when file exists
	// This overwrites existing environment variables with .env values if present
	if err := godotenv.Overload(); err != nil {
		log.Println("Warning: No .env file found or error loading it. Using environment variables.")
	}

	// Initialize JWT authentication with secret from environment
	api.InitializeAuth()

	dbPath := flag.String("db", "app.db", "a path to a sqlite db")
	port := flag.String("port", "8080", "a port to run on")
	flag.Parse()

	db := api.InitializeDatabase(*dbPath)

	app := fiber.New()

	app.Static("/public", "./public")
	app.Static("/games", "./games")

	initializeAPIRoutes(app, db)

	app.Get("/*", func(c *fiber.Ctx) error {
		return c.SendFile("./public/index.html")
	})

	// Run initial session cleanup on startup
	log.Println("Running initial session cleanup...")
	if err := api.CleanupExpiredSessions(db); err != nil {
		log.Printf("Initial session cleanup error: %v", err)
	} else {
		log.Println("Initial session cleanup completed")
	}

	// Start periodic session cleanup (runs every 24 hours)
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			log.Println("Running periodic session cleanup...")
			if err := api.CleanupExpiredSessions(db); err != nil {
				log.Printf("Session cleanup error: %v", err)
			} else {
				log.Println("Session cleanup completed")
			}
		}
	}()

	go func() {
		log.Printf("Server starting on port %s", *port)
		if err := app.Listen(fmt.Sprintf(":%s", *port)); err != nil {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	handleShutdown(app, db)
}

/**
 * Handles graceful shutdown of the application
 * @param {*fiber.App} app - Fiber application instance
 * @param {*sql.DB} db - Database connection object
 */
func handleShutdown(app *fiber.App, db *sql.DB) {
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	<-signalChan
	log.Println("Shutdown signal received...")

	// Close main database connection
	if err := db.Close(); err != nil {
		log.Printf("Error closing main database: %v", err)
	}

	// Shutdown the HTTP server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Printf("Error shutting down server: %v", err)
	}
}
