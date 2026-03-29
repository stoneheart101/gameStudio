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

    public async Task<Character> CreateCharacterAsync(int userId, string name)
    {
        var character = new Character { UserId = userId, Name = name };
        db.Characters.Add(character);
        await db.SaveChangesAsync();
        return character;
    }
}
