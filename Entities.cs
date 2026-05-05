using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace RemindAI.API.Models;

public class Reminder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long UserId { get; set; } // Telegram User ID
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime ReminderTime { get; set; }
    public ReminderStatus Status { get; set; } = ReminderStatus.Pending;
    public ReminderPriority Priority { get; set; } = ReminderPriority.Medium;
    public bool IsRecurring { get; set; } = false;
    public string? RecurrencePattern { get; set; }
    public long ChatId { get; set; }
    public bool AiGenerated { get; set; } = false;
    
    [Column(TypeName = "jsonb")]
    public JsonDocument? Tags { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class UserSettings
{
    public long UserId { get; set; } // Primary Key
    public string Timezone { get; set; } = "UTC";
    public bool NotificationEnabled { get; set; } = true;
    public bool AiAssistantEnabled { get; set; } = true;
    public ReminderPriority DefaultPriority { get; set; } = ReminderPriority.Medium;
    public string Language { get; set; } = "en";
}
