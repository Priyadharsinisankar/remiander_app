using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using RemindAI.API.Models;

namespace RemindAI.API.Services;

public class TelegramService : ITelegramService
{
    private readonly ITelegramBotClient _bot;
    private readonly IAiService _aiService;
    private readonly IReminderService _reminderService;

    public TelegramService(ITelegramBotClient bot, IAiService aiService, IReminderService reminderService)
    {
        _bot = bot;
        _aiService = aiService;
        _reminderService = reminderService;
    }

    public async Task HandleUpdateAsync(Update update)
    {
        if (update.Message is not { } message || message.Text is not { } text) return;

        var chatId = message.Chat.Id;
        var userId = message.From?.Id ?? 0;

        try
        {
            // Handle Commands
            if (text.StartsWith("/"))
            {
                await HandleCommandAsync(chatId, userId, text);
                return;
            }

            // Handle Quick Actions
            if (text.StartsWith("done ") && Guid.TryParse(text.Split(' ')[1], out var doneId))
            {
                await _reminderService.MarkCompletedAsync(doneId);
                await SendTextAsync(chatId, "✅ Reminder marked as done!");
                return;
            }

            if (text.StartsWith("snooze ") && Guid.TryParse(text.Split(' ')[1], out var snoozeId))
            {
                await _reminderService.SnoozeReminderAsync(snoozeId);
                await SendTextAsync(chatId, "⏰ Reminder snoozed for 1 hour!");
                return;
            }

            // Process with AI
            var aiResult = await _aiService.ProcessMessageAsync(userId, text);

            if (aiResult.Intent == AiIntent.CreateReminder && aiResult.ExtractedReminder != null)
            {
                var dto = new CreateReminderDto
                {
                    Title = aiResult.ExtractedReminder.Title,
                    Description = aiResult.ExtractedReminder.Description,
                    ReminderTime = aiResult.ExtractedReminder.ReminderTime,
                    Priority = aiResult.ExtractedReminder.Priority,
                    Tags = aiResult.ExtractedReminder.Tags
                };

                var reminder = await _reminderService.CreateReminderAsync(userId, chatId, dto, true);
                await SendTextAsync(chatId, $"{aiResult.Response}\n\n`ID: {reminder.Id}`", message.MessageId);
            }
            else
            {
                await SendTextAsync(chatId, aiResult.Response, message.MessageId);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error handling update: {ex.Message}");
            await SendTextAsync(chatId, "🤖 Sorry, an error occurred while processing your request.");
        }
    }

    private async Task HandleCommandAsync(long chatId, long userId, string text)
    {
        var command = text.Split(' ')[0].ToLower();
        
        switch (command)
        {
            case "/start":
                await SendTextAsync(chatId, "🤖 **Welcome to Reminder AI Bot!**\n\nTell me what you need to remember in natural language.\nExample: \"Remind me to call mom tomorrow at 3pm\"");
                break;
            case "/list":
                var reminders = await _reminderService.GetUserRemindersAsync(userId);
                if (!reminders.Any()) await SendTextAsync(chatId, "📝 You have no pending reminders.");
                else
                {
                    var list = string.Join("\n", reminders.Select(r => 
                        $"⏳ {r.Title} - {r.ReminderTime:yyyy-MM-dd HH:mm} `\ndone {r.Id}`"));
                    await SendTextAsync(chatId, $"📋 **Your Reminders:**\n\n{list}");
                }
                break;
            case "/help":
                await SendTextAsync(chatId, "💡 **How to use:**\n• Just type: \"Remind me to [task] at [time]\"\n• Type `/list` to see reminders\n• Reply `done [id]` to complete");
                break;
        }
    }

    public async Task SendTextAsync(long chatId, string text, int? replyToMessageId = null)
    {
        await _bot.SendMessage(
            chatId: chatId,
            text: text,
            parseMode: ParseMode.Markdown,
            replyToMessageId: replyToMessageId
        );
    }
}
