const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const configManager = require('../config/configManager');
const aiMessageService = require('./aiMessageService');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.initializeClient();
    }

    initializeClient() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "birthday-bot",
                dataPath: path.join(__dirname, '../../.wwebjs_auth')
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-default-apps',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-features=VizDisplayCompositor'
                ],
                timeout: 60000,
                handleSIGINT: false,
                handleSIGTERM: false,
                handleSIGHUP: false
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('qr', qr => {
            logger.info('QR Code received, scan with your WhatsApp:');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            if (this.isReady) return; // Prevent multiple ready events
            this.isReady = true;
            logger.info('WhatsApp Birthday Bot is ready!');
            logger.info('Bot will check for birthdays based on the configured schedule.');
            this.sendTestMessage(); // Send test message
        });

        this.client.on('auth_failure', msg => {
            logger.error('Authentication failure', new Error(msg));
        });

        this.client.on('change_state', state => {
            logger.info(`Connection state changed to: ${state}`);
        });

        this.client.on('disconnected', (reason) => {
            this.isReady = false;
            logger.info(`Client was logged out: ${reason}`);
            // Destroy client and exit to allow clean restart
            this.destroy();
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });

        this.client.on('error', (error) => {
            logger.error('Client error occurred', error);
            if (error.message && error.message.includes('Evaluation failed')) {
                logger.info('Puppeteer evaluation error detected. Trying to restart...');
                setTimeout(() => {
                    process.exit(1);
                }, 2000);
            }
        });
    }

    async initialize() {
        try {
            logger.info('Initializing WhatsApp client...');
            await this.client.initialize();
        } catch (error) {
            logger.error('Failed to initialize WhatsApp client', error);
            logger.info('Common solutions:');
            logger.info('1. Make sure you have Google Chrome installed');
            logger.info('2. Close any existing WhatsApp Web sessions');
            logger.info('3. Try deleting the .wwebjs_auth folder and restart');
            logger.info('4. Check your internet connection');
            throw error;
        }
    }

    // Helper function to safely get chat by phone number
    async getSafeChatById(phoneNumber, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // logger.info(`Attempting to get chat for ${phoneNumber} (attempt ${attempt}/${maxRetries})`);
                
                // Try different format variations
                const formats = [
                    //`${phoneNumber}@c.us`,
                    `${phoneNumber.replace('+', '')}@c.us`,
                ];
                
                for (const format of formats) {
                    try {
                        const chat = await this.client.getChatById(format);
                        // logger.info(`Successfully got chat with format: ${format}`);
                        return chat;
                    } catch (formatError) {
                        logger.info(`Format ${format} failed: ${formatError.message}`);
                    }
                }
                
                // If all formats fail, wait before retry
                if (attempt < maxRetries) {
                    logger.info(`All formats failed, waiting 2 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                logger.info(`Attempt ${attempt} failed: ${error.message}`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        throw new Error(`Could not get chat for ${phoneNumber} after ${maxRetries} attempts`);
    }

    async sendMessage(phoneNumber, message) {
        if (!this.isReady) {
            throw new Error('WhatsApp client is not ready');
        }

        try {
            const chat = await this.getSafeChatById(phoneNumber);
            await chat.sendMessage(message);
            logger.info(`Message sent successfully to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error(`Failed to send message to ${phoneNumber}`, error);
            logger.info(`Make sure ${phoneNumber} is saved in your WhatsApp contacts`);
            throw error;
        }
    }

    async sendImage(phoneNumber, imagePath, caption = '') {
        if (!this.isReady) {
            throw new Error('WhatsApp client is not ready');
        }

        try {
            const media = MessageMedia.fromFilePath(imagePath);
            const chat = await this.getSafeChatById(phoneNumber);
            await chat.sendMessage(media, { caption: caption });
            logger.info(`Image sent successfully to ${phoneNumber}`);
            return true;
        } catch (error) {
            logger.error(`Failed to send image to ${phoneNumber}`, error);
            throw error;
        }
    }

    // Returns the latest message from a chat by phone number
    async getLatestMessage(phoneNumber) {
        if (!this.isReady) throw new Error('WhatsApp client is not ready');
        const chat = await this.getSafeChatById(phoneNumber);
        const messages = await chat.fetchMessages({ limit: 1 });
        if (messages && messages.length > 0) {
            const msg = messages[0];
            return { id: msg.id._serialized, text: msg.body };
        }
        return null;
    }

    async sendTestMessage() {
        const config = configManager.getConfig();
        
        if (!config.yourPhoneNumber) {
            logger.warn('Cannot send test message - yourPhoneNumber not configured');
            return;
        }

        // Wait a moment for WhatsApp to fully initialize
        setTimeout(async () => {
            if (!this.isReady) {
                logger.info('Client not ready yet, skipping test message');
                return;
            }

            try {
                const testMessage = await aiMessageService.generateTestMessage('Test User');
                await this.sendMessage(config.yourPhoneNumber, testMessage);
                logger.info('Test message sent successfully!');
            } catch (error) {
                logger.error('Failed to send test message', error);
                logger.info('Tip: Make sure you have your own number saved in your WhatsApp contacts');
            }
        }, 5000); // Wait 5 seconds
    }

    destroy() {
        if (this.client) {
            this.client.destroy();
        }
    }
}

// Export singleton instance
module.exports = new WhatsAppService();