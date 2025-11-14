package api

import (
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"log"
)

/**
 * AuthMiddleware checks for a valid JWT in the Authorization header
 * @param {*fiber.Ctx} c - Fiber context
 * @returns {error} Error if any
 */
func AuthMiddleware(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return ErrorResponse(c, fiber.StatusUnauthorized, "Missing token")
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
		return ErrorResponse(c, fiber.StatusUnauthorized, "Invalid token")
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok {
		c.Locals("userId", claims["id"])
	}
	return c.Next()
}

/**
 * StandardErrorResponse creates a standardized error response
 * @param {*fiber.Ctx} c - Fiber context
 * @param {int} status - HTTP status code
 * @param {string} message - Error message
 * @param {error} err - Error object (optional)
 * @returns {error} Fiber error
 */
func StandardErrorResponse(c *fiber.Ctx, status int, message string, err error) error {
	if err != nil {
		log.Printf("%s: %v", message, err)
		return c.Status(status).JSON(fiber.Map{
			"error": fmt.Sprintf("%s: %v", message, err),
		})
	}

	return c.Status(status).JSON(fiber.Map{
		"error": message,
	})
}

/**
 * ErrorResponse creates a simple standardized error response without logging
 * @param {*fiber.Ctx} c - Fiber context
 * @param {int} status - HTTP status code
 * @param {string} message - Error message
 * @returns {error} Fiber error
 */
func ErrorResponse(c *fiber.Ctx, status int, message string) error {
	return c.Status(status).JSON(fiber.Map{
		"error": message,
	})
}
