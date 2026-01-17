package handler

import (
	"database/sql"
	"regexp"
	"time"

	"app/internal/middleware"
	"app/internal/model"
	"app/internal/store"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func ValidateEmail(email string) bool {
	pattern := `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
	match, _ := regexp.MatchString(pattern, email)
	return match
}

func CreateUser(c *fiber.Ctx, db *sql.DB) error {
	c.Cookie(&fiber.Cookie{Name: "token", Value: "", Expires: time.Now().UTC().Add(-1 * time.Hour), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax"})

	var user model.User
	if err := c.BodyParser(&user); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}

	if !ValidateEmail(user.Email) {
		return middleware.ErrorResponse(c, 400, "Invalid email format")
	}

	valid, errorMsg := ValidatePasswordStrength(user.Password)
	if !valid {
		return middleware.ErrorResponse(c, 400, errorMsg)
	}

	if user.Password != user.ConfirmPassword {
		return middleware.ErrorResponse(c, 400, "Passwords do not match")
	}

	var existingEmail string
	err := db.QueryRow("SELECT email FROM users WHERE email = ? AND isDeleted=0", user.Email).Scan(&existingEmail)
	if err == nil {
		return middleware.ErrorResponse(c, 409, "Email already exists")
	}

	user.Id = uuid.New().String()

	hashed, err := HashPassword(user.Password)
	if err != nil {
		return middleware.ErrorResponse(c, 500, "Failed to hash password")
	}

	_, err = db.Exec("INSERT INTO users(id, email, password) VALUES(?,?,?)", user.Id, user.Email, string(hashed))
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	_, err = db.Exec("INSERT INTO subscriptions(id, userId, tier, status) VALUES(?,?,?,?)", uuid.New().String(), user.Id, "free", "active")
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to create subscription", err)
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ?", user.Id)
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	token, err := GenerateToken(user.Id)
	if err != nil {
		return middleware.ErrorResponse(c, 500, "Failed to generate token")
	}

	refreshToken, err := GenerateRefreshToken(user.Id)
	if err != nil {
		return middleware.ErrorResponse(c, 500, "Failed to generate refresh token")
	}

	err = store.CreateSession(db, user.Id, refreshToken, GetRefreshExpiration())
	if err != nil {
		return middleware.ErrorResponse(c, 500, "Failed to create session")
	}

	c.Cookie(&fiber.Cookie{Name: "token", Value: token, Expires: time.Now().UTC().Add(GetJWTExpiration()), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax"})
	c.Cookie(&fiber.Cookie{Name: "refresh_token", Value: refreshToken, Expires: time.Now().UTC().Add(GetRefreshExpiration()), HTTPOnly: true, Secure: c.Protocol() == "https", SameSite: "Lax", Path: "/api/refresh"})

	user.Password = ""
	return c.Status(201).JSON(fiber.Map{"user": user, "token": token, "refreshToken": refreshToken})
}

func GetCurrentUser(c *fiber.Ctx, db *sql.DB) error {
	currentUserId, ok := c.Locals("userId").(string)
	if !ok || currentUserId == "" {
		return middleware.ErrorResponse(c, 401, "Unauthorized")
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ? AND isDeleted=0", currentUserId)
	var user model.User
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return middleware.ErrorResponse(c, 404, "User not found")
	}
	return c.JSON(user)
}

func GetUser(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	currentUserId, ok := c.Locals("userId").(string)
	if !ok || currentUserId == "" {
		return middleware.ErrorResponse(c, 401, "Unauthorized")
	}

	if id != currentUserId {
		return middleware.ErrorResponse(c, 403, "Access denied: You can only view your own profile")
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ? AND isDeleted=0", id)
	var user model.User
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return middleware.ErrorResponse(c, 404, "User not found")
	}
	return c.JSON(user)
}

func UpdateUser(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	currentUserId, ok := c.Locals("userId").(string)
	if !ok || currentUserId == "" {
		return middleware.ErrorResponse(c, 401, "Unauthorized")
	}

	if id != currentUserId {
		return middleware.ErrorResponse(c, 403, "Access denied: You can only update your own profile")
	}

	var user model.User
	if err := c.BodyParser(&user); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}

	if !ValidateEmail(user.Email) {
		return middleware.ErrorResponse(c, 400, "Invalid email format")
	}

	var existingUser struct {
		Email    string
		Password string
	}
	err := db.QueryRow("SELECT email, password FROM users WHERE id = ? AND isDeleted=0", id).Scan(&existingUser.Email, &existingUser.Password)
	if err != nil {
		return middleware.ErrorResponse(c, 404, "User not found")
	}

	if user.Email != existingUser.Email {
		var duplicateEmail string
		err := db.QueryRow("SELECT email FROM users WHERE email = ? AND id != ? AND isDeleted=0", user.Email, id).Scan(&duplicateEmail)
		if err == nil {
			return middleware.ErrorResponse(c, 409, "Email already exists")
		}
	}

	if user.Password != "" {
		if user.CurrentPassword == "" {
			return middleware.ErrorResponse(c, 400, "Current password is required to change password")
		}
		if err := VerifyPassword(existingUser.Password, user.CurrentPassword); err != nil {
			return middleware.ErrorResponse(c, 401, "Current password is incorrect")
		}
		if user.Password != user.ConfirmPassword {
			return middleware.ErrorResponse(c, 400, "Passwords do not match")
		}
		valid, errorMsg := ValidatePasswordStrength(user.Password)
		if !valid {
			return middleware.ErrorResponse(c, 400, errorMsg)
		}
		hashed, err := HashPassword(user.Password)
		if err != nil {
			return middleware.ErrorResponse(c, 500, "Failed to hash password")
		}
		_, err = db.Exec("UPDATE users SET email=?, password=?, modifiedDate=CURRENT_TIMESTAMP WHERE id=?", user.Email, string(hashed), id)
		if err != nil {
			return middleware.StandardErrorResponse(c, 500, "Database error", err)
		}
	} else {
		_, err := db.Exec("UPDATE users SET email=?, modifiedDate=CURRENT_TIMESTAMP WHERE id=?", user.Email, id)
		if err != nil {
			return middleware.StandardErrorResponse(c, 500, "Database error", err)
		}
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ? AND isDeleted=0", id)
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	return c.JSON(user)
}

func DeleteUser(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	currentUserId, ok := c.Locals("userId").(string)
	if !ok || currentUserId == "" {
		return middleware.ErrorResponse(c, 401, "Unauthorized")
	}

	if id != currentUserId {
		return middleware.ErrorResponse(c, 403, "Access denied: You can only delete your own account")
	}

	if err := store.RevokeAllUserSessions(db, id); err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to revoke sessions", err)
	}

	_, err := db.Exec("UPDATE users SET isDeleted=1, deletedDate=CURRENT_TIMESTAMP WHERE id=?", id)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}

	return c.JSON(fiber.Map{"message": "User deleted"})
}
