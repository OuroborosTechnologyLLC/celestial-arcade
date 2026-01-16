package middleware

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"github.com/rs/zerolog/log"
)

var SecretKey []byte

func SetSecretKey(key []byte) {
	SecretKey = key
}

func AuthMiddleware(c *fiber.Ctx) error {
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
		return ErrorResponse(c, fiber.StatusUnauthorized, "Missing token")
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
		if userId, ok := claims["id"].(string); ok {
			c.Locals("userId", userId)
		}
	}
	return c.Next()
}

func StandardErrorResponse(c *fiber.Ctx, status int, message string, err error) error {
	if err != nil {
		log.Error().Err(err).Msg(message)
		return c.Status(status).JSON(fiber.Map{"error": fmt.Sprintf("%s: %v", message, err)})
	}
	return c.Status(status).JSON(fiber.Map{"error": message})
}

func ErrorResponse(c *fiber.Ctx, status int, message string) error {
	return c.Status(status).JSON(fiber.Map{"error": message})
}
