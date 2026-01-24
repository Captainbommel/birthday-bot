# WhatsApp Birthday Bot

Simple bot that automatically sends birthday messages to your "special" friends.

## Features

- Scheduled birthday checking using cron (default: daily at 8 AM)
- AI-generated funny birthday messages via OpenAI with multiple message types
- Personal reminders for special people

## Message Types

The bot supports different types of birthday messages controlled by the `type` field in `birthdays.json`:

- **`personal`**: Sends you a reminder to wish the person happy birthday yourself
- **`generated`**: Generates a friendly, funny birthday message that gently teases the person
- **`generated_age`**: Generates a cheeky, sarcastic message that humorously roasts the person's age

## Troubleshooting

### WhatsApp Web "markedUnread" Error

If you encounter the error `TypeError: Cannot read properties of undefined (reading 'markedUnread')`, this is caused by WhatsApp Web API changes. Apply this fix to `node_modules\whatsapp-web.js\src\util\Injected\Utils.js`:

Replace the `window.WWebJS.sendSeen` function with:

```javascript
window.WWebJS.sendSeen = async (chatId) => {
    const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
    if (!chat) return false;

    const isChannel = window.Store.ChatGetters.getIsNewsletter(chat);
    const isStatus = window.Store.ChatGetters.getIsBroadcast(chat);

    const canUseSendSeen = typeof chat.markedUnread !== 'undefined';

    try {
        window.Store.WAWebStreamModel.Stream.markAvailable();

        if (canUseSendSeen && window.Store.SendSeen.sendSeen && !isChannel && !isStatus) {
            await window.Store.SendSeen.sendSeen(chat);
        } else if (window.Store.SendSeen.markSeen) {
            await window.Store.SendSeen.markSeen(chat);
        } else {
            return false;
        }

        return true;
    } catch (err) {
        try {
            if (window.Store.SendSeen.markSeen) {
                await window.Store.SendSeen.markSeen(chat);
                return true;
            }
        } catch (_) {}
        return false;
    } finally {
        window.Store.WAWebStreamModel.Stream.markUnavailable();
    }
};
```

This fix adds proper checks for channels, status broadcasts, and fallback mechanisms to prevent crashes.

## ROADMAP
- more commands over personal chat
- semi-automatic qr-code updates
- add tests for commandService
- finnish readme