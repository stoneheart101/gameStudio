namespace GameStudio.Models;

public class ScoreEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string GameName { get; set; } = "";
    public int Score { get; set; }
    public DateTime PlayedAt { get; set; } = DateTime.UtcNow;
}
