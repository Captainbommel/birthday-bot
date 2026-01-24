const logger = require('../utils/logger');
const configManager = require('../config/configManager');
const fs = require('fs');
const path = require('path');

class CommandService {
    constructor(whatsappService) {
        this.whatsappService = whatsappService;
        this.commandPrefix = '$:'; // Unique identifier for commands
        this.lastCheckedMessageId = null;
    }

    async startPolling(personalChatId) {
        setInterval(async () => {
            try {
                const latestMsg = await this.whatsappService.getLatestMessage(personalChatId);
                if (!latestMsg || latestMsg.id === this.lastCheckedMessageId) return;
                this.lastCheckedMessageId = latestMsg.id;
                if (latestMsg.text && latestMsg.text.startsWith(this.commandPrefix)) {
                    const commandText = latestMsg.text.slice(this.commandPrefix.length).trim();
                    this.handleCommand(commandText, personalChatId);
                }
            } catch (err) {
                logger.error('CommandService polling error:', err);
            }
        }, 1000); // Poll every second
    }

    async handleCommand(commandText, chatId) {
        const [cmd, ...args] = commandText.split(/\s+/);
        switch (cmd) {
            case 'addBirthday': {
                // Parse args: --n name -d date -ph phone -t type (optional)
                let name = '', date = '', phone = '', type = 'generated';
                for (let i = 0; i < args.length; i++) {
                    if (args[i] === '--n' && args[i+1]) {
                        name = args[i+1];
                        i++;
                    } else if (args[i] === '-d' && args[i+1]) {
                        date = args[i+1];
                        i++;
                    } else if (args[i] === '-ph' && args[i+1]) {
                        phone = args[i+1];
                        i++;
                    } else if (args[i] === '-t' && args[i+1]) {
                        type = args[i+1];
                        i++;
                    }
                }

                if (!name || !date) {
                    await this.whatsappService.sendMessage(chatId, 'Usage: $:addBirthday --n Name -d DD-MM -ph +49123456789 [-t personal|generated|generated_age]');
                    return;
                }

                // Load current birthdays
                const birthdaysFile = path.join(__dirname, '../../birthdays.json');
                let birthdays = [];

                try {
                    birthdays = JSON.parse(fs.readFileSync(birthdaysFile, 'utf8'));
                } catch (err) {
                    // If file doesn't exist or is invalid, start with empty array
                }

                birthdays.push({ name, date, phone, type });
                try {
                    fs.writeFileSync(birthdaysFile, JSON.stringify(birthdays, null, 2), 'utf8');
                    await this.whatsappService.sendMessage(chatId, 'Birthday added successfully.');
                } catch (err) {
                    await this.whatsappService.sendMessage(chatId, 'Failed to save birthday.');
                }
                
                break;
            }

            default:
                await this.whatsappService.sendMessage(chatId, `Unknown command: ${cmd}`);
        }
    }
}

module.exports = CommandService;
