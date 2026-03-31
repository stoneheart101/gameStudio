using Microsoft.EntityFrameworkCore;
using GameStudio.Data;
using GameStudio.Services;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://0.0.0.0:5000");

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=app.db"));

builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<ScoreService>();
builder.Services.AddScoped<UserSession>();
builder.Services.AddScoped<CharacterService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    // Add tables that may not exist in older databases
    db.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS Characters (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            UserId INTEGER NOT NULL,
            Name TEXT NOT NULL DEFAULT '',
            CreatedAt TEXT NOT NULL DEFAULT '0001-01-01 00:00:00',
            Speed INTEGER NOT NULL DEFAULT 1,
            Strength INTEGER NOT NULL DEFAULT 1,
            Smarts INTEGER NOT NULL DEFAULT 1,
            Agility INTEGER NOT NULL DEFAULT 1,
            Toughness INTEGER NOT NULL DEFAULT 1,
            Magic INTEGER NOT NULL DEFAULT 1,
            Health INTEGER NOT NULL DEFAULT 1,
            Level INTEGER NOT NULL DEFAULT 1,
            Experience INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (UserId) REFERENCES Users(Id)
        )");
    // Add stat columns to existing Characters tables
    foreach (var col in new[] { "Speed", "Strength", "Smarts", "Agility", "Toughness", "Magic", "Health" })
    {
        try { db.Database.ExecuteSqlRaw("ALTER TABLE Characters ADD COLUMN " + col + " INTEGER NOT NULL DEFAULT 1"); }
        catch { /* column already exists */ }
    }
    // Add Level and Experience columns to existing Characters tables
    foreach (var (colName, colDef) in new[] { ("Level", "INTEGER NOT NULL DEFAULT 1"), ("Experience", "INTEGER NOT NULL DEFAULT 0") })
    {
        try { db.Database.ExecuteSqlRaw($"ALTER TABLE Characters ADD COLUMN {colName} {colDef}"); }
        catch { /* column already exists */ }
    }
}

if (!app.Environment.IsDevelopment())
    app.UseExceptionHandler("/Error");

app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<GameStudio.Components.App>()
    .AddInteractiveServerRenderMode();

app.Run();
