const OpenAI = require('openai');
const logger = require('../utils/logger');
const configManager = require('../config/configManager');

class AIMessageService {
    constructor() {
        this.openai = null;
        this.initialize();
    }

    initialize() {
        const config = configManager.getConfig();
        
        if (config.openaiApiKey) {
            this.openai = new OpenAI({
                apiKey: config.openaiApiKey
            });
            logger.info('OpenAI service initialized');
        } else {
            logger.warn('OpenAI not configured, will use default messages');
        }
    }

    async generateBirthdayMessage(name) {
        const config = configManager.getConfig();
        const signature = `_gesendet von ${config.botOwner || 'John'} total persönlichem Geburtstags Bot_`;

        if (!this.openai) {
            logger.info('OpenAI not configured, using default message');
            return `🎉 Alles Gute zum Geburtstag, ${name}! 🎂 Ich hoffe, du hast einen fantastischen Tag!\n\n ${signature}`;
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Du bist ein witziger und lustiger Geburtstags-Nachrichtengenerator. Erstelle kurze, lustige und persönliche Geburtstagsnachrichten auf Deutsch. Halte sie fröhlich und amüsant. Die Nachricht sollte maximal 1-2 Sätze lang sein. Füge NICHT den Namen der Person in die Nachricht ein - das wird separat hinzugefügt. Schreibe ausschließlich auf Deutsch. Die Nachricht soll die Person auf eine lustige, freundliche Weise necken oder leicht beleidigen, aber niemals gemein oder verletzend sein."
                    },
                    {
                        role: "user",
                        content: "Generiere eine lustige, freundliche Geburtstagsnachricht auf Deutsch, die die Person auf witzige Weise neckt."
                    }
                ],
                max_tokens: 100,
                temperature: 0.9,
            });

            const aiMessage = response.choices[0].message.content.trim();
            const fullMessage = `🎉 Alles Gute zum Geburtstag, ${name}! 🎂\n\n${aiMessage}\n\n ${signature}`;
            
            logger.info(`Generated AI message for ${name}`);
            return fullMessage;
        } catch (error) {
            logger.error('Error generating AI message', error);
            return `🎉 Alles Gute zum Geburtstag, ${name}! 🎂 Hab einen wundervollen Tag voller Freude und Lachen!\n\n ${signature}`;
        }
    }

    async generatePersonalReminderMessage(name) {
        const config = configManager.getConfig();
        const signature = `_gesendet von ${config.botOwner || 'John'} total persönlichem Geburtstags Bot_`;
        return `🎂 *Persönliche Geburtstags-Erinnerung*\n\n${name} hat heute Geburtstag! Du wolltest das persönlich handhaben.\n\n ${signature}`;
    }

    async generateTestMessage(name) {
        const config = configManager.getConfig();
        const timezone = config.timezone || 'Europe/Berlin';
        const signature = `_gesendet von ${config.botOwner || 'John'} total persönlichem Geburtstags Bot_`;
        
        const currentTime = new Date().toLocaleString('de-DE', { 
            timeZone: timezone,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `🤖 *Bot Gestartet*\n\nDein Geburtstags-Bot ist erfolgreich gestartet! \n\nStartzeit: ${currentTime}\n\n ${signature}`;
    }
}

// Export singleton instance
module.exports = new AIMessageService();