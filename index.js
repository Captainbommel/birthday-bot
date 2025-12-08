#!/usr/bin/env node

/**
 * WhatsApp Birthday Bot
 * A simple bot that automatically sends AI-generated birthday messages
 * 
 * Entry point - orchestrates all services and handles app lifecycle
 */

const logger = require('./src/utils/logger');
const configManager = require('./src/config/configManager');
const whatsappService = require('./src/services/whatsappService');
const birthdayService = require('./src/services/birthdayService');
const CommandService = require('./src/services/commandService');

class BirthdayBot {
    constructor() {
        this.isRunning = false;
        this.commandService = null;
    }

    async start() {
        try {
            logger.info('Starting WhatsApp Birthday Bot...');
            
            // Load and validate configuration
            configManager.loadConfig();
            configManager.loadBirthdays();
            configManager.validateConfig();
            
            // Initialize WhatsApp service
            await whatsappService.initialize();
            
            // Wait for WhatsApp to be ready, then start birthday checker
            this.waitForWhatsAppReady();
            
            this.isRunning = true;
            logger.info('Birthday Bot started successfully!');
            
        } catch (error) {
            logger.error('Failed to start Birthday Bot', error);
            process.exit(1);
        }
    }

    waitForWhatsAppReady() {
        const checkReady = async () => {
            if (whatsappService.isReady) {
                // Start the birthday checking service
                birthdayService.startBirthdayChecker();
                // Start the command service polling for personal chat commands
                if (!this.commandService) {
                    this.commandService = new CommandService(whatsappService);
                    const personalChatId = configManager.getConfig().yourPhoneNumber;
                    this.commandService.startPolling(personalChatId);
                }
            } else {
                // Check again in 1 second
                setTimeout(checkReady, 1000);
            }
        };
        
        checkReady();
    }

    async stop() {
        if (!this.isRunning) return;
        
        logger.info('Shutting down Birthday Bot...');
        
        // Stop birthday checker
        birthdayService.stopBirthdayChecker();
        
        // Destroy WhatsApp client
        whatsappService.destroy();
        
        this.isRunning = false;
        logger.info('Birthday Bot stopped successfully');
    }
}

// Create bot instance
const bot = new BirthdayBot();

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    logger.info('\nReceived SIGINT, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('\nReceived SIGTERM, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at Promise', reason);
    process.exit(1);
});

// Start the bot
bot.start().catch((error) => {
    logger.error('Failed to start bot', error);
    process.exit(1);
});