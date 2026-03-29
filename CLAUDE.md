# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
dotnet build          # Build the project
dotnet run            # Run dev server at http://localhost:5000
dotnet publish -c Release  # Publish for production
```

No test projects exist. There are no lint configs; use `mcp__ide__getDiagnostics` for static analysis.

## Architecture

**Blazor Server** app (.NET 10, `GameStudio.csproj`) with interactive server-side rendering. The server binds to `http://0.0.0.0:5000`.

### Layers

**Data** — EF Core + SQLite (`app.db`, auto-created on startup):
- `User`: ID, Name, AvatarEmoji, CreatedAt, LastVisit
- `ScoreEntry`: ID, UserId (FK), GameName, Score, PlayedAt

**Services** (all registered as scoped):
- `UserService` — user CRUD
- `ScoreService` — score persistence and leaderboards; holds the canonical game list `["Flappy", "Dodge", "UmmFood"]`
- `UserSession` — in-memory per-circuit state holding the current user; uses `OnChange` event for UI reactivity

**Components** (`Components/`):
- `Layout/MainLayout.razor` — wraps everything; hosts `UserGate`
- `Shared/UserGate.razor` — floating overlay for user selection/creation; persists user ID to `localStorage` and restores it on load
- `Pages/Home.razor` — leaderboard ranked by total score across all games
- `Pages/Flappy.razor`, `Dodge.razor`, `UmmFood.razor` — individual game pages; each wraps an HTML5 Canvas, passes a `DotNetObjectReference` to JS, and receives scores via `[JSInvokable] OnGameOver(int score)`

**JavaScript** (`wwwroot/js/`):
- `flappy.js`, `dodge.js`, `umm-food.js` — self-contained canvas game engines
- All call back to Blazor with `dotNetRef.invokeMethodAsync('OnGameOver', score)`
- Static assets use cache-busting query params (e.g. `app.js?v=2`)

### Key wiring points
- `Program.cs` creates the DB schema and registers services; connection string is hardcoded as `Data Source=app.db`
- `UserSession` is scoped (one per SignalR circuit), so it must be injected — never instantiated directly
- Adding a new game requires: a JS file, a new Razor page, and adding the name to `ScoreService.Games`
