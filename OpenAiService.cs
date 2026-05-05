using System.Text.Json;
using OpenAI.Chat;
using RemindAI.API.Models;

namespace RemindAI.API.Services;

public class OpenAiService : IAiService
{
    private readonly ChatClient _client;
    private const string Model = "gpt-4o-mini";

    public OpenAiService(string apiKey)
    {
        _client = new ChatClient(Model, apiKey);
    }

    public async Task<AiResponseDto> ProcessMessageAsync(long userId, string message)
    {
        var intent = await DetectIntentAsync(message);

        if (intent == AiIntent.CreateReminder)
        {
            var parsed = await ParseReminderAsync(message);
            return new AiResponseDto
            {
                Intent = AiIntent.CreateReminder,
                ExtractedReminder = parsed,
                Response = $"✅ I've created a reminder:\n\n📌 **{parsed.Title}**\n🕐 {parsed.ReminderTime:yyyy-MM-dd HH:mm} UTC"
            };
        }

        return new AiResponseDto { Intent = intent, Response = "How can I help you with your reminders today?" };
    }

    private async Task<AiIntent> DetectIntentAsync(string message)
    {
        var options = new ChatCompletionOptions
        {
            ResponseFormat = ChatResponseFormat.CreateTextFormat(),
            Temperature = 0f
        };
        
        options.Messages.Add(new SystemChatMessage("You are an intent detector. Respond ONLY with one of these exact words: CreateReminder, ListReminders, Help, GeneralChat. User message:"));
        options.Messages.Add(new UserChatMessage(message));

        var response = await _client.CompleteChatAsync(options);
        var text = response.Value.Content[0].Text.Trim().ToLower();

        return text switch
        {
            "createreminder" => AiIntent.CreateReminder,
            "listreminders" => AiIntent.ListReminders,
            "help" => AiIntent.Help,
            _ => AiIntent.GeneralChat
        };
    }

    private async Task<ParsedReminderDto> ParseReminderAsync(string message)
    {
        var options = new ChatCompletionOptions
        {
            ResponseFormat = ChatResponseFormat.CreateJsonObjectFormat(),
            Temperature = 0.1f
        };

        var prompt = $@"Parse this reminder request into JSON. Current UTC time: {DateTime.UtcNow:yyyy-MM-dd HH:mm}.
Return exactly this JSON structure: {"""title""":"""string""", """description""":"""string""", """reminder_time""":"""yyyy-MM-ddTHH:mm:ssZ""", """priority""":"""Low/Medium/High/Urgent""", """tags"":[""string""]}
Message: {message}";

        options.Messages.Add(new UserChatMessage(prompt));

        var response = await _client.CompleteChatAsync(options);
        var json = response.Value.Content[0].Text;
        
        var doc = JsonDocument.Parse(json).RootElement;
        
        return new ParsedReminderDto
        {
            Title = doc.GetProperty("title").GetString() ?? "Untitled Reminder",
            Description = doc.TryGetProperty("description", out var desc) ? desc.GetString() : null,
            ReminderTime = DateTime.TryParse(doc.GetProperty("reminder_time").GetString(), out var time) ? time : DateTime.UtcNow.AddHours(1),
            Priority = Enum.TryParse<ReminderPriority>(doc.GetProperty("priority").GetString(), true, out var p) ? p : ReminderPriority.Medium,
            Tags = doc.TryGetProperty("tags", out var tags) && tags.ValueKind == JsonValueKind.Array 
                ? tags.Deserialize<List<string>>() 
                : null
        };
    }
}
