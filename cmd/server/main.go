package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"app/internal/handler"
	"app/internal/middleware"
	"app/internal/store"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func initializeAPIRoutes(app *fiber.App, db *sql.DB) {
	apiGroup := app.Group("/api")

	apiGroup.Use(limiter.New(limiter.Config{
		Max:        60,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			if userId := handler.GetOptionalUserId(c); userId != "" {
				return "user:" + userId
			}
			return "ip:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(429).JSON(fiber.Map{"error": "Too many requests, please try again later"})
		},
	}))

	apiGroup.Post("/users", func(c *fiber.Ctx) error { return handler.CreateUser(c, db) })
	apiGroup.Post("/login", func(c *fiber.Ctx) error { return handler.LoginUser(c, db) })
	apiGroup.Post("/refresh", func(c *fiber.Ctx) error { return handler.RefreshToken(c, db) })
	apiGroup.Post("/logout", func(c *fiber.Ctx) error { return handler.LogoutUser(c, db) })
	apiGroup.Get("/games", func(c *fiber.Ctx) error { return handler.GetGamesPublic(c, db) })
	apiGroup.Get("/games/:slug/manifest", func(c *fiber.Ctx) error { return handler.GetGameManifestPublic(c, db) })

	apiGroup.Use(middleware.AuthMiddleware)

	apiGroup.Get("/users/me", func(c *fiber.Ctx) error { return handler.GetCurrentUser(c, db) })
	apiGroup.Get("/users/:id", func(c *fiber.Ctx) error { return handler.GetUser(c, db) })
	apiGroup.Put("/users/:id", func(c *fiber.Ctx) error { return handler.UpdateUser(c, db) })
	apiGroup.Delete("/users/:id", func(c *fiber.Ctx) error { return handler.DeleteUser(c, db) })

	apiGroup.Get("/progression", func(c *fiber.Ctx) error { return handler.GetProgression(c, db) })
	apiGroup.Post("/progression/sync", func(c *fiber.Ctx) error { return handler.SyncProgression(c, db) })

	adminGroup := apiGroup.Group("/admin")
	adminGroup.Use(middleware.AdminMiddleware(db))
	adminGroup.Get("/games", func(c *fiber.Ctx) error { return handler.GetGamesPublic(c, db) })
	adminGroup.Post("/games", func(c *fiber.Ctx) error { return handler.CreateGame(c, db) })
	adminGroup.Put("/games/:slug", func(c *fiber.Ctx) error { return handler.UpdateGame(c, db) })
	adminGroup.Delete("/games/:slug", func(c *fiber.Ctx) error { return handler.DeleteGame(c, db) })
	adminGroup.Get("/subscriptions", func(c *fiber.Ctx) error { return handler.GetSubscriptions(c, db) })
	adminGroup.Post("/subscriptions", func(c *fiber.Ctx) error { return handler.CreateSubscription(c, db) })
	adminGroup.Put("/subscriptions/:id", func(c *fiber.Ctx) error { return handler.UpdateSubscription(c, db) })
}

func main() {
	_ = godotenv.Overload()

	if logPath := os.Getenv("LOG_FILE"); logPath != "" {
		logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			fmt.Printf("Failed to open log file: %v\n", err)
			log.Logger = zerolog.New(os.Stdout).With().Timestamp().Caller().Logger()
		} else {
			log.Logger = zerolog.New(logFile).With().Timestamp().Caller().Logger()
			defer logFile.Close()
		}
	} else {
		log.Logger = zerolog.New(os.Stdout).With().Timestamp().Caller().Logger()
	}

	handler.InitializeAuth()

	dbPath := flag.String("db", "app.db", "a path to a sqlite db")
	port := flag.String("port", "8080", "a port to run on")
	flag.Parse()

	db := store.InitializeDatabase(*dbPath)

	app := fiber.New(fiber.Config{BodyLimit: 1 * 1024 * 1024})

	app.Use(func(c *fiber.Ctx) error {
		start := time.Now().UTC()
		err := c.Next()
		log.Info().Str("method", c.Method()).Str("path", c.Path()).Int("status", c.Response().StatusCode()).Dur("latency", time.Since(start)).Msg("request")
		return err
	})

	if corsOrigins := os.Getenv("CORS_ORIGINS"); corsOrigins != "" {
		app.Use(cors.New(cors.Config{AllowOrigins: corsOrigins, AllowHeaders: "Origin, Content-Type, Accept, Authorization", AllowMethods: "GET, POST, PUT, DELETE, OPTIONS", AllowCredentials: true}))
	}

	app.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })

	app.Static("/public", "./public")
	app.Get("/games/:slug/*", func(c *fiber.Ctx) error { return handler.ServeGameFile(c, db) })

	initializeAPIRoutes(app, db)

	app.Get("/*", func(c *fiber.Ctx) error {
		return c.SendFile("./public/index.html")
	})

	log.Info().Msg("Running initial session cleanup...")
	if err := store.CleanupExpiredSessions(db); err != nil {
		log.Error().Err(err).Msg("Initial session cleanup error")
	} else {
		log.Info().Msg("Initial session cleanup completed")
	}

	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			log.Info().Msg("Running periodic session cleanup...")
			if err := store.CleanupExpiredSessions(db); err != nil {
				log.Error().Err(err).Msg("Session cleanup error")
			} else {
				log.Info().Msg("Session cleanup completed")
			}
		}
	}()

	go func() {
		log.Info().Str("port", *port).Msg("Server starting")
		if err := app.Listen(fmt.Sprintf(":%s", *port)); err != nil {
			log.Fatal().Err(err).Msg("Server failed to start")
		}
	}()

	handleShutdown(app, db)
}

func handleShutdown(app *fiber.App, db *sql.DB) {
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	<-signalChan
	log.Info().Msg("Shutdown signal received...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Error().Err(err).Msg("Error shutting down server")
	}

	if err := db.Close(); err != nil {
		log.Error().Err(err).Msg("Error closing database")
	}
}
