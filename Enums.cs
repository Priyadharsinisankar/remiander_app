namespace RemindAI.API.Models;

public enum ReminderStatus
{
    Pending,
    Completed,
    Cancelled,
    Snoozed
}

public enum ReminderPriority
{
    Low,
    Medium,
    High,
    Urgent
}

public enum AiIntent
{
    CreateReminder,
    ListReminders,
    UpdateReminder,
    DeleteReminder,
    GeneralChat,
    Help,
    Unknown
}
