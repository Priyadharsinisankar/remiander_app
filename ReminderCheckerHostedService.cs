using RemindAI.API.Services;

namespace RemindAI.API.BackgroundTasks;

public class ReminderCheckerHostedService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;

    public ReminderCheckerHostedService(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

            using var scope = _serviceProvider.CreateScope();
            var reminderService = scope.ServiceProvider.GetRequiredService<IReminderService>();
            var telegramService = scope.ServiceProvider.GetRequiredService<ITelegramService>();

            var pending = await reminderService.GetPendingRemindersAsync();

            foreach (var reminder in pending)
            {
                var priorityEmoji = reminder.Priority switch
                {
                    Models.ReminderPriority.Urgent => "🚨",
                    Models.ReminderPriority.High => "🔴",
                    Models.ReminderPriority.Medium => "🟡",
                    _ => "🟢"
                };

                var message = $"{priorityEmoji} **Reminder** {priorityEmoji}\n\n📌 *{reminder.Title}*\n" +
                              (string.IsNullOrEmpty(reminder.Description) ? "" : $"📝 {reminder.Description}\n") +
                              $"\n`done {reminder.Id}` | `snooze {reminder.Id}`";

                await telegramService.SendTextAsync(reminder.ChatId, message);
                await reminderService.MarkCompletedAsync(reminder.Id);
            }
        }
    }
}
