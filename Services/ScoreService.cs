using GameStudio.Data;
using GameStudio.Models;
using Microsoft.EntityFrameworkCore;

namespace GameStudio.Services;

public class ScoreService(AppDbContext db)
{
    public static readonly string[] Games = ["Flappy", "Dodge", "UmmFood", "Explorer", "CowCoral"];

    public async Task<ScoreEntry> SaveScoreAsync(int userId, string gameName, int score)
    {
        var entry = new ScoreEntry
        {
            UserId = userId,
            GameName = gameName,
            Score = score,
            PlayedAt = DateTime.UtcNow
        };
        db.Scores.Add(entry);
        await db.SaveChangesAsync();
        return entry;
    }

    public async Task<ScoreEntry?> GetHighScoreAsync(int userId, string gameName) =>
        await db.Scores
            .Where(s => s.UserId == userId && s.GameName == gameName)
            .OrderByDescending(s => s.Score)
            .FirstOrDefaultAsync();

    public async Task ResetGameScoresAsync(string gameName)
    {
        var entries = await db.Scores.Where(s => s.GameName == gameName).ToListAsync();
        db.Scores.RemoveRange(entries);
        await db.SaveChangesAsync();
    }

    public async Task<List<(User User, Dictionary<string, ScoreEntry?> Scores)>> GetLeaderboardAsync()
    {
        var users = await db.Users.OrderBy(u => u.Name).ToListAsync();
        var result = new List<(User, Dictionary<string, ScoreEntry?>)>();

        foreach (var user in users)
        {
            var scores = new Dictionary<string, ScoreEntry?>();
            foreach (var game in Games)
            {
                scores[game] = await db.Scores
                    .Where(s => s.UserId == user.Id && s.GameName == game)
                    .OrderByDescending(s => s.Score)
                    .FirstOrDefaultAsync();
            }
            result.Add((user, scores));
        }

        return result;
    }
}
