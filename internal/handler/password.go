package handler

import (
	"fmt"
	"regexp"

	"app/internal/model"

	"golang.org/x/crypto/bcrypt"
)

var PasswordConfig = model.PasswordSettings{MinLength: 8, MaxLength: 72, RequireUppercase: true, RequireLowercase: true, RequireNumber: true, RequireSymbol: true}

var (
	regexUpper  = regexp.MustCompile(`[A-Z]`)
	regexLower  = regexp.MustCompile(`[a-z]`)
	regexNumber = regexp.MustCompile(`[0-9]`)
	regexSymbol = regexp.MustCompile(`[^A-Za-z0-9]`)
)

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

func VerifyPassword(hash, password string) error {
	if hash == "" || password == "" {
		return fmt.Errorf("hash and password cannot be empty")
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func ValidatePasswordStrength(password string) (bool, string) {
	if len(password) < PasswordConfig.MinLength {
		return false, fmt.Sprintf("Password must be at least %d characters long", PasswordConfig.MinLength)
	}
	if len(password) > PasswordConfig.MaxLength {
		return false, fmt.Sprintf("Password must not exceed %d characters", PasswordConfig.MaxLength)
	}
	if PasswordConfig.RequireUppercase && !regexUpper.MatchString(password) {
		return false, "Password must contain at least one uppercase letter"
	}
	if PasswordConfig.RequireLowercase && !regexLower.MatchString(password) {
		return false, "Password must contain at least one lowercase letter"
	}
	if PasswordConfig.RequireNumber && !regexNumber.MatchString(password) {
		return false, "Password must contain at least one number"
	}
	if PasswordConfig.RequireSymbol && !regexSymbol.MatchString(password) {
		return false, "Password must contain at least one special character"
	}
	return true, ""
}
