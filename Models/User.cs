namespace GameStudio.Models;

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string AvatarEmoji { get; set; } = "🎮";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastVisit { get; set; } = DateTime.UtcNow;
}
