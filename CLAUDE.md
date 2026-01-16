# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Context

- This is a simple authentication API prototype - don't worry about database migrations or backwards compatibility
- The project is a minimal account API with JWT authentication
- Uses Go with Fiber framework, SQLite database, and vanilla JavaScript frontend

## Project Structure

```
celestial-arcade/
├── cmd/server/main.go        # Application entry point
├── internal/
│   ├── handler/              # HTTP handlers (auth, user, game, progression)
│   ├── middleware/           # Auth middleware, error helpers
│   ├── model/                # Data structures (User, Game, Session, etc.)
│   └── store/                # Database initialization and session operations
├── games/                    # Game files (static content)
├── public/                   # Frontend files (static content)
└── go.mod
```

## Build & Run Commands

**IMPORTANT**: Never run the server or build the application. Only use formatting and linting commands.

- Format code: `go fmt ./...`
- Lint code: `go vet ./...`
- Install dependencies: `go mod tidy` (if needed)

**DO NOT RUN**:
- `go build ./cmd/server`
- `go run ./cmd/server`
- Any server startup commands

The user will run the server when needed.

## Code Style Guidelines

- Import organization: standard library first, then third-party packages, alphabetically sorted
- Error handling: check errors immediately, return early pattern preferred
- Variable naming: camelCase for local variables, PascalCase for exported symbols
- Function signatures: return error as the last return value
- Documentation: add comments for all exported functions, types, and variables
- File organization: one package per directory, meaningful file names
- Type declarations: prefer explicit type declarations over inference
- Keep functions < 50 lines, files < 500 lines
- Use context.Context for cancellation and timeouts in API calls
- alphabetize css properties

## Frontend:

- `/public/` - Static files served by Go backend
- No build process - vanilla HTML/CSS/JS
- Does not use any third-party dependencies but uses Shadcn as inspiration for look and feel
- keep html elements on one line

## Time Handling Rules

**IMPORTANT**: All server timestamps MUST use UTC
- Always use `time.Now().UTC()` not `time.Now()`
- Database stores all timestamps in UTC (SQLite CURRENT_TIMESTAMP is UTC)
- API responses return UTC timestamps
- Client JavaScript handles UTC to local timezone conversion
- Never do timezone conversion on the server side

## Code Preferences

- prefer no comments or very little comments in code
- prefer to take up more horizontal space then vertical space
- prefer keeping code on one line unless it doesn't make sense
