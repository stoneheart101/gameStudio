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
            FOREIGN KEY (UserId) REFERENCES Users(Id)
        )");
}

if (!app.Environment.IsDevelopment())
    app.UseExceptionHandler("/Error");

app.UseStaticFiles();
app.UseAntiforgery();

app.MapRazorComponents<GameStudio.Components.App>()
    .AddInteractiveServerRenderMode();

app.Run();
