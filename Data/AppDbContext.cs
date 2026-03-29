using Microsoft.EntityFrameworkCore;
using GameStudio.Models;

namespace GameStudio.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ScoreEntry> Scores => Set<ScoreEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ScoreEntry>()
            .HasOne(s => s.User)
            .WithMany()
            .HasForeignKey(s => s.UserId);
    }
}
