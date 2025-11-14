package api

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
	"regexp"
)

// PasswordSettings defines the configuration for password requirements
// These can be adjusted for testing or different security levels
type PasswordSettings struct {
	MinLength        int  // MinLength is the minimum password length required
	MaxLength        int  // MaxLength is the maximum password length (bcrypt limit is 72 bytes)
	RequireUppercase bool // RequireUppercase determines if at least one uppercase letter is required
	RequireLowercase bool // RequireLowercase determines if at least one lowercase letter is required
	RequireNumber    bool // RequireNumber determines if at least one number is required
	RequireSymbol    bool // RequireSymbol determines if at least one special character is required
}

// PasswordConfig stores the active password settings
// By default, it uses production-level settings
var PasswordConfig = PasswordSettings{
	MinLength:        8,
	MaxLength:        72, // bcrypt only uses first 72 bytes
	RequireUppercase: true,
	RequireLowercase: true,
	RequireNumber:    true,
	RequireSymbol:    true,
}

// HashPassword creates a bcrypt hash from a plain text password
func HashPassword(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password cannot be empty")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}

	return string(hash), nil
}

// VerifyPassword compares a plain text password with a bcrypt hash
func VerifyPassword(hash, password string) error {
	if hash == "" || password == "" {
		return fmt.Errorf("hash and password cannot be empty")
	}

	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// ValidatePasswordStrength checks if a password meets the configured requirements
func ValidatePasswordStrength(password string) (bool, string) {
	// Check minimum length
	if len(password) < PasswordConfig.MinLength {
		return false, fmt.Sprintf("Password must be at least %d characters long", PasswordConfig.MinLength)
	}

	// Check maximum length (bcrypt only hashes first 72 bytes)
	if len(password) > PasswordConfig.MaxLength {
		return false, fmt.Sprintf("Password must not exceed %d characters (bcrypt limitation)", PasswordConfig.MaxLength)
	}

	// Test patterns individually for more reliable matching
	hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
	hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
	hasNumber := regexp.MustCompile(`[0-9]`).MatchString(password)
	hasSymbol := regexp.MustCompile(`[^A-Za-z0-9]`).MatchString(password)

	// Check for uppercase if required
	if PasswordConfig.RequireUppercase && !hasUpper {
		return false, "Password must contain at least one uppercase letter"
	}

	// Check for lowercase if required
	if PasswordConfig.RequireLowercase && !hasLower {
		return false, "Password must contain at least one lowercase letter"
	}

	// Check for number if required
	if PasswordConfig.RequireNumber && !hasNumber {
		return false, "Password must contain at least one number"
	}

	// Check for symbol if required
	if PasswordConfig.RequireSymbol && !hasSymbol {
		return false, "Password must contain at least one special character"
	}

	return true, ""
}
