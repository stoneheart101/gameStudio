namespace GameStudio.Models;

public class Character
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string Name { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Stats (16 points to distribute, min 1 each)
    public int Speed { get; set; } = 1;
    public int Strength { get; set; } = 1;
    public int Smarts { get; set; } = 1;
    public int Agility { get; set; } = 1;
    public int Toughness { get; set; } = 1;
    public int Magic { get; set; } = 1;
    public int Health { get; set; } = 1;
    public int Level { get; set; } = 1;
    public int Experience { get; set; } = 0;

    // Derived: HP = Health * 5 + Toughness * 2
    public int MaxHitPoints => Health * 5 + Toughness * 2;
}
