package handler

import (
	"database/sql"

	"app/internal/middleware"
	"app/internal/model"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func GetSubscriptions(c *fiber.Ctx, db *sql.DB) error {
	rows, err := db.Query(`SELECT s.id, s.userId, s.tier, s.status, s.startDate, s.endDate, s.createdAt, u.email FROM subscriptions s JOIN users u ON s.userId = u.id WHERE u.isDeleted=0 ORDER BY s.createdAt DESC`)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	defer rows.Close()
	var subscriptions []fiber.Map
	for rows.Next() {
		var sub model.Subscription
		var email string
		err := rows.Scan(&sub.Id, &sub.UserId, &sub.Tier, &sub.Status, &sub.StartDate, &sub.EndDate, &sub.CreatedAt, &email)
		if err != nil {
			return middleware.StandardErrorResponse(c, 500, "Database scan error", err)
		}
		subscriptions = append(subscriptions, fiber.Map{"id": sub.Id, "userId": sub.UserId, "email": email, "tier": sub.Tier, "status": sub.Status, "startDate": sub.StartDate, "endDate": sub.EndDate, "createdAt": sub.CreatedAt})
	}
	if subscriptions == nil {
		subscriptions = []fiber.Map{}
	}
	return c.JSON(fiber.Map{"subscriptions": subscriptions})
}

func CreateSubscription(c *fiber.Ctx, db *sql.DB) error {
	var sub model.Subscription
	if err := c.BodyParser(&sub); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}
	if sub.UserId == "" || sub.Tier == "" {
		return middleware.ErrorResponse(c, 400, "userId and tier are required")
	}
	var existingUserId string
	err := db.QueryRow("SELECT id FROM users WHERE id = ? AND isDeleted=0", sub.UserId).Scan(&existingUserId)
	if err == sql.ErrNoRows {
		return middleware.ErrorResponse(c, 404, "User not found")
	}
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	sub.Id = uuid.New().String()
	if sub.Status == "" {
		sub.Status = "active"
	}
	_, err = db.Exec("INSERT INTO subscriptions(id, userId, tier, status, endDate) VALUES(?,?,?,?,?)", sub.Id, sub.UserId, sub.Tier, sub.Status, sub.EndDate)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to create subscription", err)
	}
	err = db.QueryRow("SELECT id, userId, tier, status, startDate, endDate, createdAt FROM subscriptions WHERE id = ?", sub.Id).Scan(&sub.Id, &sub.UserId, &sub.Tier, &sub.Status, &sub.StartDate, &sub.EndDate, &sub.CreatedAt)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to retrieve created subscription", err)
	}
	return c.Status(201).JSON(sub)
}

func UpdateSubscription(c *fiber.Ctx, db *sql.DB) error {
	id := c.Params("id")
	var existingSub model.Subscription
	err := db.QueryRow("SELECT id, userId, tier, status, startDate, endDate, createdAt FROM subscriptions WHERE id = ?", id).Scan(&existingSub.Id, &existingSub.UserId, &existingSub.Tier, &existingSub.Status, &existingSub.StartDate, &existingSub.EndDate, &existingSub.CreatedAt)
	if err == sql.ErrNoRows {
		return middleware.ErrorResponse(c, 404, "Subscription not found")
	}
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Database error", err)
	}
	var updates model.Subscription
	if err := c.BodyParser(&updates); err != nil {
		return middleware.ErrorResponse(c, 400, "Invalid request body")
	}
	if updates.Tier != "" {
		existingSub.Tier = updates.Tier
	}
	if updates.Status != "" {
		existingSub.Status = updates.Status
	}
	if updates.EndDate != nil {
		existingSub.EndDate = updates.EndDate
	}
	_, err = db.Exec("UPDATE subscriptions SET tier=?, status=?, endDate=? WHERE id=?", existingSub.Tier, existingSub.Status, existingSub.EndDate, id)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to update subscription", err)
	}
	err = db.QueryRow("SELECT id, userId, tier, status, startDate, endDate, createdAt FROM subscriptions WHERE id = ?", id).Scan(&existingSub.Id, &existingSub.UserId, &existingSub.Tier, &existingSub.Status, &existingSub.StartDate, &existingSub.EndDate, &existingSub.CreatedAt)
	if err != nil {
		return middleware.StandardErrorResponse(c, 500, "Failed to retrieve updated subscription", err)
	}
	return c.JSON(existingSub)
}
