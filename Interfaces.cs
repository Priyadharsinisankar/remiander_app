using RemindAI.API.Models;
using Telegram.Bot.Types;

namespace RemindAI.API.Services;

public interface IReminderService
{
    Task<Reminder> CreateReminderAsync(long userId, long chatId, CreateReminderDto dto, bool aiGenerated);
    Task<List<Reminder>> GetUserRemindersAsync(long userId);
    Task<List<Reminder>> GetPendingRemindersAsync();
    Task<bool> MarkCompletedAsync(Guid id);
    Task<bool> SnoozeReminderAsync(Guid id);
}

public interface IAiService
{
    Task<AiResponseDto> ProcessMessageAsync(long userId, string message);
}

public interface ITelegramService
{
    Task HandleUpdateAsync(Update update);
    Task SendTextAsync(long chatId, string text, int? replyToMessageId = null);
}
