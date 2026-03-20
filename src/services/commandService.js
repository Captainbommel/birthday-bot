const logger = require('../utils/logger');
const configManager = require('../config/configManager');
const birthdayRepository = require('../config/birthdayRepository');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

class CommandService {
    constructor(whatsappService, birthdayService) {
        this.whatsappService = whatsappService;
        this.birthdayService = birthdayService;
        this.commandPrefix = '$:'; // Unique identifier for commands
        this.lastCheckedMessageId = null;
        this.botActive = true;
    }

    async startPolling(personalChatId) {
        // Seed lastCheckedMessageId from the current latest message so we don't
        // re-execute commands that were sent before the bot started.
        try {
            const seed = await this.whatsappService.getLatestMessage(personalChatId);
            if (seed) this.lastCheckedMessageId = seed.id;
        } catch (err) {
            logger.warn('Could not seed initial message ID; pre-existing commands may re-execute', err);
        }

        setInterval(async () => {
            try {
                const latestMsg = await this.whatsappService.getLatestMessage(personalChatId);
                if (!latestMsg) return;
                // If seed failed at startup, use the first message we see to initialize
                // without processing it — prevents re-executing pre-existing commands.
                if (this.lastCheckedMessageId === null) {
                    this.lastCheckedMessageId = latestMsg.id;
                    return;
                }
                if (latestMsg.id === this.lastCheckedMessageId) return;
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
            case 'help':
                await this.handleHelp(chatId);
                break;

            case 'addBday':
            case 'editBday':
                await this.handleAddOrEditBirthday(cmd, args, chatId);
                break;

            case 'removeBday':
                await this.handleRemoveBirthday(args, chatId);
                break;

            case 'listBdays':
                await this.handleListBirthdays(chatId);
                break;

            case 'exportBdays':
                await this.handleExportBirthdays(chatId);
                break;

            case 'importBdays':
                await this.handleImportBirthdays(args, chatId);
                break;

            case 'setCron':
                await this.handleSetCron(args, chatId);
                break;

            case 'activate':
                await this.handleActivate(chatId);
                break;

            case 'deactivate':
                await this.handleDeactivate(chatId);
                break;

            case 'status':
                await this.handleStatus(chatId);
                break;

            case 'triggerBday':
                await this.handleTriggerBirthday(args, chatId);
                break;

            default:
                await this.whatsappService.sendMessage(chatId, `Unknown command: ${cmd}\n\nType $:help for available commands.`);
        }
    }

    async handleHelp(chatId) {
        const helpText = `*Birthday Bot Commands*

*Birthday Management:*
• $:addBday --n Name -d DD-MM -ph +49123 [-t type]
  Add a new birthday (type: personal|generated|generated_age)

• $:editBday --n Name -d DD-MM -ph +49123 [-t type]
  Edit existing birthday (same syntax as add)

• $:removeBday --n Name
  Remove a birthday by name

• $:listBdays
  Show all saved birthdays

• $:exportBdays
  Export all birthdays to birthdays.json

• $:importBdays --file birthdays.json
  Import birthdays from birthdays.json (upserts existing entries)

• $:triggerBday --n Name
  Manually send birthday message for a person

*Bot Control:*
• $:setCron --schedule "0 8 * * *"
  Change cron schedule (time when bot checks)

• $:activate
  Start the birthday checker

• $:deactivate
  Stop the birthday checker

• $:status
  Show bot status and configuration

• $:help
  Show this help message`;

        await this.whatsappService.sendMessage(chatId, helpText);
    }

    async handleAddOrEditBirthday(cmd, args, chatId) {
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
            await this.whatsappService.sendMessage(chatId, 'Usage: $:' + cmd + ' --n Name -d DD-MM -ph +49123456789 [-t personal|generated|generated_topic_age]');
            return;
        }

        // Validate date format
        if (!/^\d{2}-\d{2}$/.test(date)) {
            await this.whatsappService.sendMessage(chatId, 'Invalid date format. Use DD-MM (e.g., 15-03)');
            return;
        }

        // Check if birthday exists (for both add and edit)
        const existing = birthdayRepository.getByName(name);

        try {
            if (cmd === 'editBday') {
                if (!existing) {
                    await this.whatsappService.sendMessage(chatId, `Birthday for "${name}" not found. Use $:addBday to add a new one.`);
                    return;
                }
                birthdayRepository.update(name, date, phone, type);
            } else {
                if (existing) {
                    await this.whatsappService.sendMessage(chatId, `Birthday for "${name}" already exists. Use $:editBday to modify it, or $:removeBday to delete it first.`);
                    return;
                }
                birthdayRepository.add(name, date, phone, type);
            }
            const action = cmd === 'editBday' ? 'updated' : 'added';
            await this.whatsappService.sendMessage(chatId, `Birthday ${action} successfully for ${name} (${date})`);
        } catch (err) {
            logger.error('Failed to save birthday', err);
            await this.whatsappService.sendMessage(chatId, 'Failed to save birthday.');
        }
    }

    async handleRemoveBirthday(args, chatId) {
        let name = '';
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--n' && args[i+1]) {
                name = args[i+1];
                i++;
            }
        }

        if (!name) {
            await this.whatsappService.sendMessage(chatId, 'Usage: $:removeBirthday --n Name');
            return;
        }

        const removed = birthdayRepository.remove(name);
        if (!removed) {
            await this.whatsappService.sendMessage(chatId, `Birthday for "${name}" not found.`);
            return;
        }
        await this.whatsappService.sendMessage(chatId, `Birthday removed successfully for ${name}.`);
    }

    async handleListBirthdays(chatId) {
        const birthdays = configManager.getBirthdays();

        if (birthdays.length === 0) {
            await this.whatsappService.sendMessage(chatId, 'No birthdays saved yet.');
            return;
        }

        // Sort birthdays by date
        birthdays.sort((a, b) => {
            const [dayA, monthA] = a.date.split('-').map(Number);
            const [dayB, monthB] = b.date.split('-').map(Number);
            if (monthA !== monthB) return monthA - monthB;
            return dayA - dayB;
        });

        let message = `*Saved Birthdays (${birthdays.length})*\n\n`;
        
        birthdays.forEach((b, index) => {
            message += `${index + 1}. *${b.name}*\n`;
            message += `   Date: ${b.date}\n`;
            message += `   Phone: ${b.phone || 'N/A'}\n`;
            message += `   Type: ${b.type}\n\n`;
        });

        await this.whatsappService.sendMessage(chatId, message);
    }

    async handleExportBirthdays(chatId) {
        try {
            const json = birthdayRepository.exportJSON();
            const file = path.join(__dirname, '../../birthdays.json');
            fs.writeFileSync(file, json, 'utf8');
            const count = birthdayRepository.getAll().length;
            await this.whatsappService.sendMessage(chatId, `Exported ${count} birthdays to birthdays.json`);
        } catch (err) {
            logger.error('Failed to export birthdays', err);
            await this.whatsappService.sendMessage(chatId, 'Failed to export birthdays.');
        }
    }

    async handleImportBirthdays(args, chatId) {
        let filename = 'birthdays.json';
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--file' && args[i + 1]) {
                filename = args[i + 1];
                break;
            }
        }
        const file = path.join(__dirname, '../../', filename);
        try {
            const raw = fs.readFileSync(file, 'utf8');
            const data = JSON.parse(raw);
            const entries = Array.isArray(data) ? data : (data.birthdays || []);
            const count = birthdayRepository.importJSON(entries);
            await this.whatsappService.sendMessage(chatId, `Imported ${count} birthdays from ${filename}`);
        } catch (err) {
            logger.error('Failed to import birthdays', err);
            await this.whatsappService.sendMessage(chatId, `Failed to import birthdays from ${filename}: ${err.message}`);
        }
    }

    async handleSetCron(args, chatId) {
        let schedule = '';
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--schedule' && args[i+1]) {
                // Handle quoted schedule strings
                if (args[i+1].startsWith('"')) {
                    schedule = args.slice(i+1).join(' ').replace(/"/g, '');
                    break;
                } else {
                    schedule = args[i+1];
                }
                i++;
            }
        }

        if (!schedule) {
            await this.whatsappService.sendMessage(chatId, 'Usage: $:setCron --schedule "0 8 * * *"\n\nExamples:\n• "0 8 * * *" - Daily at 8 AM\n• "0 12 * * *" - Daily at 12 PM\n• "0 8 * * 1" - Every Monday at 8 AM');
            return;
        }

        // Validate cron expression
        if (!cron.validate(schedule)) {
            await this.whatsappService.sendMessage(chatId, 'Invalid cron schedule. Use format like "0 8 * * *"');
            return;
        }

        try {
            configManager.setCronSchedule(schedule);
            await this.whatsappService.sendMessage(chatId, `Cron schedule updated to: ${schedule}\n\nThe bot will automatically apply this change within 1 minute.`);
        } catch (err) {
            logger.error('Failed to update cron schedule', err);
            await this.whatsappService.sendMessage(chatId, 'Failed to update cron schedule.');
        }
    }

    async handleActivate(chatId) {
        if (this.botActive) {
            await this.whatsappService.sendMessage(chatId, 'Bot is already active.');
            return;
        }

        try {
            this.birthdayService.startBirthdayChecker();
            this.botActive = true;
            await this.whatsappService.sendMessage(chatId, 'Birthday checker activated successfully!');
            logger.info('Birthday checker activated via command');
        } catch (err) {
            logger.error('Failed to activate bot', err);
            await this.whatsappService.sendMessage(chatId, 'Failed to activate bot.');
        }
    }

    async handleDeactivate(chatId) {
        if (!this.botActive) {
            await this.whatsappService.sendMessage(chatId, 'Bot is already inactive.');
            return;
        }

        try {
            this.birthdayService.stopBirthdayChecker();
            this.botActive = false;
            await this.whatsappService.sendMessage(chatId, 'Birthday checker deactivated successfully!');
            logger.info('Birthday checker deactivated via command');
        } catch (err) {
            logger.error('Failed to deactivate bot', err);
            await this.whatsappService.sendMessage(chatId, 'Failed to deactivate bot.');
        }
    }

    async handleStatus(chatId) {
        const config = configManager.getConfig();
        const birthdays = configManager.getBirthdays();
        
        const statusText = this.botActive ? 'Active' : 'Inactive';
        
        let message = `*Bot Status*\n\n`;
        message += `Status: ${statusText}\n`;
        message += `Bot Owner: ${config.botOwner || 'Not set'}\n`;
        message += `Your Number: ${config.yourPhoneNumber || 'Not set'}\n`;
        message += `Schedule: ${config.cronSchedule || '0 8 * * *'}\n`;
        message += `Timezone: ${config.timezone || 'Europe/Berlin'}\n`;
        message += `OpenAI: ${config.openaiApiKey ? 'Configured' : 'Not configured'}\n`;
        message += `Birthdays Saved: ${birthdays.length}\n`;

        await this.whatsappService.sendMessage(chatId, message);
    }

    async handleTriggerBirthday(args, chatId) {
        let name = '';
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--n' && args[i+1]) {
                name = args[i+1];
                i++;
            }
        }

        if (!name) {
            await this.whatsappService.sendMessage(chatId, 'Usage: $:triggerBday --n Name');
            return;
        }

        const birthdays = configManager.getBirthdays();

        const person = birthdays.find(b => b.name.toLowerCase() === name.toLowerCase());

        if (!person) {
            await this.whatsappService.sendMessage(chatId, `Birthday entry for "${name}" not found.`);
            return;
        }

        try {
            const config = configManager.getConfig();
            const currentYear = new Date().getFullYear();
            
            // Use the birthday service's handleBirthday method to send the message
            await this.birthdayService.handleBirthday(person, config, currentYear);
            
            await this.whatsappService.sendMessage(chatId, `Birthday message triggered successfully for ${person.name}.`);
            logger.info(`Manually triggered birthday message for ${person.name}`);
        } catch (err) {
            logger.error(`Failed to trigger birthday for ${name}`, err);
            await this.whatsappService.sendMessage(chatId, 'Failed to send birthday message.');
        }
    }
}

module.exports = CommandService;
