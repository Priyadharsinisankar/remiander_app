using Microsoft.EntityFrameworkCore;
using RemindAI.API.Data;
using RemindAI.API.Models;
using System.Text.Json;

namespace RemindAI.API.Services;

public class ReminderService : IReminderService
{
    private readonly AppDbContext _context;

    public ReminderService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<Reminder> CreateReminderAsync(long userId, long chatId, CreateReminderDto dto, bool aiGenerated)
    {
        var reminder = new Reminder
        {
            UserId = userId,
            ChatId = chatId,
            Title = dto.Title,
            Description = dto.Description,
            ReminderTime = dto.ReminderTime,
            Priority = dto.Priority,
            IsRecurring = dto.IsRecurring,
            RecurrencePattern = dto.RecurrencePattern,
            AiGenerated = aiGenerated,
            Tags = dto.Tags != null ? JsonDocument.Parse(JsonSerializer.Serialize(dto.Tags)) : null
        };

        _context.Reminders.Add(reminder);
        await _context.SaveChangesAsync();
        return reminder;
    }

    public async Task<List<Reminder>> GetUserRemindersAsync(long userId)
    {
        return await _context.Reminders
            .Where(r => r.UserId == userId && r.Status == ReminderStatus.Pending)
            .OrderBy(r => r.ReminderTime)
            .ToListAsync();
    }

    public async Task<List<Reminder>> GetPendingRemindersAsync()
    {
        var now = DateTime.UtcNow;
        return await _context.Reminders
            .Where(r => r.Status == ReminderStatus.Pending && r.ReminderTime <= now.AddMinutes(1))
            .ToListAsync();
    }

    public async Task<bool> MarkCompletedAsync(Guid id)
    {
        var reminder = await _context.Reminders.FindAsync(id);
        if (reminder == null) return false;

        reminder.Status = ReminderStatus.Completed;
        reminder.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> SnoozeReminderAsync(Guid id)
    {
        var reminder = await _context.Reminders.FindAsync(id);
        if (reminder == null) return false;

        reminder.ReminderTime = DateTime.UtcNow.AddHours(1);
        reminder.Status = ReminderStatus.Snoozed;
        reminder.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return true;
    }
}
