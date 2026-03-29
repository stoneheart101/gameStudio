using GameStudio.Data;
using GameStudio.Models;
using Microsoft.EntityFrameworkCore;

namespace GameStudio.Services;

public class UserService(AppDbContext db)
{
    public async Task<List<User>> GetAllUsersAsync() =>
        await db.Users.OrderBy(u => u.Name).ToListAsync();

    public async Task<User?> GetUserByIdAsync(int id) =>
        await db.Users.FindAsync(id);

    public async Task<User> CreateUserAsync(string name, string avatarEmoji)
    {
        var user = new User
        {
            Name = name.Trim(),
            AvatarEmoji = avatarEmoji,
            CreatedAt = DateTime.UtcNow,
            LastVisit = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    public async Task UpdateLastVisitAsync(int userId)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return;
        user.LastVisit = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
