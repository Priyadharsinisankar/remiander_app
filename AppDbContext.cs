using Microsoft.EntityFrameworkCore;
using RemindAI.API.Models;

namespace RemindAI.API.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Reminder> Reminders => Set<Reminder>();
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Reminder>()
            .HasIndex(r => r.UserId);
        
        modelBuilder.Entity<Reminder>()
            .HasIndex(r => r.ReminderTime);

        modelBuilder.Entity<UserSettings>()
            .HasKey(u => u.UserId);
    }
}
