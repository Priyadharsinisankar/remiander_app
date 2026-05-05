using DotNetEnv;
using Microsoft.EntityFrameworkCore;
using RemindAI.API.Data;
using RemindAI.API.Services;
using RemindAI.API.BackgroundTasks;
using Telegram.Bot;
using Telegram.Bot.Polling;

var builder = WebApplication.CreateBuilder(args);

// Load environment variables from .env file
Env.Load();

// Configure Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Configure Telegram Bot
var telegramToken = Environment.GetEnvironmentVariable("TELEGRAM_BOT_TOKEN") 
    ?? throw new InvalidOperationException("TELEGRAM_BOT_TOKEN is missing");

builder.Services.AddSingleton<ITelegramBotClient>(new TelegramBotClient(telegramToken));

// Configure OpenAI
var openAiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") 
    ?? throw new InvalidOperationException("OPENAI_API_KEY is missing");

builder.Services.AddSingleton<IAiService>(new OpenAiService(openAiKey));

// Register Application Services
builder.Services.AddScoped<IReminderService, ReminderService>();
builder.Services.AddScoped<ITelegramService, TelegramService>();

// Register Background Worker for checking reminders
builder.Services.AddHostedService<ReminderCheckerHostedService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// Auto-migrate database in development
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.MapControllers();

// Start Telegram Bot Long Polling
using (var scope = app.Services.CreateScope())
{
    var botClient = scope.ServiceProvider.GetRequiredService<ITelegramBotClient>();
    var telegramService = scope.ServiceProvider.GetRequiredService<ITelegramService>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    var receiverOptions = new ReceiverOptions
    {
        AllowedUpdates = { } // receive all update types
    };

    botClient.StartReceiving(
        updateHandler: async (bot, update, token) => await telegramService.HandleUpdateAsync(update),
        errorHandler: async (bot, exception, token) => 
        {
            logger.LogError(exception, "Telegram polling error");
            return Task.CompletedTask;
        },
        receiverOptions: receiverOptions
    );

    logger.LogInformation("Telegram bot started receiving updates.");
}

app.Run();
