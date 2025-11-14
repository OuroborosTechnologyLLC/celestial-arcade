package api

import (
	"database/sql"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"regexp"
	"time"
)

type User struct {
	Id              string `json:"id"`
	Email           string `json:"email"`
	Password        string `json:"password,omitempty"`
	ConfirmPassword string `json:"confirmPassword,omitempty"`
	CreatedDate     string `json:"createdDate,omitempty"`
	ModifiedDate    string `json:"modifiedDate,omitempty"`
	DeletedDate     string `json:"deletedDate,omitempty"`
}

/**
 * ValidateEmail checks if the email format is valid
 * @param {string} email - Email to validate
 * @returns {bool} - True if email is valid, false otherwise
 */
func ValidateEmail(email string) bool {
	pattern := `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
	match, _ := regexp.MatchString(pattern, email)
	return match
}

/**
 * Creates a new user account and logs them in
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func CreateUser(c *fiber.Ctx, db *sql.DB) error {
	// Clear any existing token first
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Expires:  time.Now().UTC().Add(-1 * time.Hour),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
	})

	var user User

	if err := c.BodyParser(&user); err != nil {
		return ErrorResponse(c, 400, "Invalid request body")
	}

	if !ValidateEmail(user.Email) {
		return ErrorResponse(c, 400, "Invalid email format")
	}

	// Validate password requirements first (more helpful errors)
	valid, errorMsg := ValidatePasswordStrength(user.Password)
	if !valid {
		return ErrorResponse(c, 400, errorMsg)
	}

	// Validate password confirmation after requirements check
	if user.Password != user.ConfirmPassword {
		return ErrorResponse(c, 400, "Passwords do not match")
	}

	var existingEmail string
	err := db.QueryRow("SELECT email FROM users WHERE email = ? AND isDeleted=0", user.Email).Scan(&existingEmail)
	if err == nil {
		return ErrorResponse(c, 409, "Email already exists")
	}

	user.Id = uuid.New().String()

	hashed, err := HashPassword(user.Password)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to hash password")
	}

	_, err = db.Exec("INSERT INTO users(id, email, password) VALUES(?,?,?)",
		user.Id, user.Email, string(hashed))
	if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ?", user.Id)
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}

	token, err := GenerateToken(user.Id)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to generate token")
	}

	// Generate refresh token
	refreshToken, err := GenerateRefreshToken(user.Id)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to generate refresh token")
	}

	// Store session in database
	err = CreateSession(db, user.Id, refreshToken)
	if err != nil {
		return ErrorResponse(c, 500, "Failed to create session")
	}

	// Set the access token as an HTTPOnly cookie
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    token,
		Expires:  time.Now().UTC().Add(GetJWTExpiration()),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
	})

	// Set the refresh token as a separate HTTPOnly cookie
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Expires:  time.Now().UTC().Add(GetRefreshExpiration()),
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
		Path:     "/api/refresh",
	})

	user.Password = ""
	return c.Status(201).JSON(fiber.Map{
		"user":         user,
		"token":        token,
		"refreshToken": refreshToken,
	})
}

/**
 * Retrieves the current authenticated user
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func GetCurrentUser(c *fiber.Ctx, db *sql.DB) error {
	currentUserId := c.Locals("userId").(string)

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ? AND isDeleted=0", currentUserId)
	var user User
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return ErrorResponse(c, 404, "User not found")
	}
	return c.JSON(user)
}

/**
 * Retrieves a specific user by ID (restricted to current user only)
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func GetUser(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	currentUserId := c.Locals("userId").(string)

	if id != currentUserId {
		return ErrorResponse(c, 403, "Access denied: You can only view your own profile")
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ? AND isDeleted=0", id)
	var user User
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return ErrorResponse(c, 404, "User not found")
	}
	return c.JSON(user)
}

/**
 * Updates user information (restricted to current user only)
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func UpdateUser(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	currentUserId := c.Locals("userId").(string)

	if id != currentUserId {
		return ErrorResponse(c, 403, "Access denied: You can only update your own profile")
	}

	var user User

	if err := c.BodyParser(&user); err != nil {
		return ErrorResponse(c, 400, "Invalid request body")
	}

	if !ValidateEmail(user.Email) {
		return ErrorResponse(c, 400, "Invalid email format")
	}

	var existingUser struct {
		Email string
	}
	err := db.QueryRow("SELECT email FROM users WHERE id = ? AND isDeleted=0", id).Scan(&existingUser.Email)
	if err != nil {
		return ErrorResponse(c, 404, "User not found")
	}

	if user.Email != existingUser.Email {
		var duplicateEmail string
		err := db.QueryRow("SELECT email FROM users WHERE email = ? AND id != ? AND isDeleted=0",
			user.Email, id).Scan(&duplicateEmail)
		if err == nil {
			return ErrorResponse(c, 409, "Email already exists")
		}
	}

	if user.Password != "" {
		// Validate password confirmation if provided
		if user.ConfirmPassword != "" && user.Password != user.ConfirmPassword {
			return ErrorResponse(c, 400, "Passwords do not match")
		}

		// Validate password requirements
		valid, errorMsg := ValidatePasswordStrength(user.Password)
		if !valid {
			return ErrorResponse(c, 400, errorMsg)
		}

		hashed, err := HashPassword(user.Password)
		if err != nil {
			return ErrorResponse(c, 500, "Failed to hash password")
		}
		_, err = db.Exec("UPDATE users SET email=?, password=?, modifiedDate=CURRENT_TIMESTAMP WHERE id=?",
			user.Email, string(hashed), id)
		if err != nil {
			return StandardErrorResponse(c, 500, "Database error", err)
		}
	} else {
		_, err := db.Exec("UPDATE users SET email=?, modifiedDate=CURRENT_TIMESTAMP WHERE id=?",
			user.Email, id)
		if err != nil {
			return StandardErrorResponse(c, 500, "Database error", err)
		}
	}

	row := db.QueryRow("SELECT id, email, createdDate, modifiedDate FROM users WHERE id = ? AND isDeleted=0", id)
	if err := row.Scan(&user.Id, &user.Email, &user.CreatedDate, &user.ModifiedDate); err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}
	return c.JSON(user)
}

/**
 * Soft-deletes a user account (restricted to current user only)
 * @param {*fiber.Ctx} c - Fiber context
 * @param {*sql.DB} db - Database connection
 * @returns {error} Error if any
 */
func DeleteUser(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	currentUserId := c.Locals("userId").(string)

	if id != currentUserId {
		return ErrorResponse(c, 403, "Access denied: You can only delete your own account")
	}

	_, err := db.Exec("UPDATE users SET isDeleted=1, deletedDate=CURRENT_TIMESTAMP WHERE id=?", id)
	if err != nil {
		return StandardErrorResponse(c, 500, "Database error", err)
	}

	return c.JSON(fiber.Map{
		"message": "User deleted",
	})
}
