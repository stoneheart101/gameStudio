using Microsoft.EntityFrameworkCore;
using GameStudio.Data;
using GameStudio.Models;

namespace GameStudio.Services;

public class CharacterService(AppDbContext db)
{
    public async Task<List<Character>> GetCharactersAsync(int userId) =>
        await db.Characters
            .Where(c => c.UserId == userId)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

    public async Task DeleteCharacterAsync(int id)
    {
        var c = await db.Characters.FindAsync(id);
        if (c != null) { db.Characters.Remove(c); await db.SaveChangesAsync(); }
    }

    public async Task UpdateCharacterAsync(Character character)
    {
        var entry = db.Entry(character);
        if (entry.State == EntityState.Detached)
            db.Characters.Update(character);
        await db.SaveChangesAsync();
    }

    public async Task<Character> CreateCharacterAsync(int userId, string name,
        int speed, int strength, int smarts, int agility, int toughness, int magic, int health)
    {
        var character = new Character
        {
            UserId = userId,
            Name = name,
            Speed = speed,
            Strength = strength,
            Smarts = smarts,
            Agility = agility,
            Toughness = toughness,
            Magic = magic,
            Health = health,
            Level = 1,
            Experience = 0
        };
        db.Characters.Add(character);
        await db.SaveChangesAsync();
        return character;
    }
}
