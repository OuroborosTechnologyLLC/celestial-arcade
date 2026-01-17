package middleware

import (
	"database/sql"

	"github.com/gofiber/fiber/v2"
)

func AdminMiddleware(db *sql.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userId, ok := c.Locals("userId").(string)
		if !ok || userId == "" {
			return ErrorResponse(c, 401, "Unauthorized")
		}
		var isAdmin int
		err := db.QueryRow("SELECT isAdmin FROM users WHERE id = ? AND isDeleted=0", userId).Scan(&isAdmin)
		if err != nil || isAdmin != 1 {
			return ErrorResponse(c, 403, "Admin access required")
		}
		return c.Next()
	}
}
