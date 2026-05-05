namespace RemindAI.API.Models;

public class CreateReminderDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime ReminderTime { get; set; }
    public ReminderPriority Priority { get; set; }
    public bool IsRecurring { get; set; }
    public string? RecurrencePattern { get; set; }
    public List<string>? Tags { get; set; }
}

public class AiResponseDto
{
    public string Response { get; set; } = string.Empty;
    public ParsedReminderDto? ExtractedReminder { get; set; }
    public AiIntent Intent { get; set; }
}

public class ParsedReminderDto
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime ReminderTime { get; set; }
    public ReminderPriority Priority { get; set; }
    public List<string>? Tags { get; set; }
}
