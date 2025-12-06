const moment = require('moment-timezone');
const cron = require('node-cron');
const parser = require('cron-parser');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const configManager = require('../config/configManager');
const whatsappService = require('./whatsappService');
const aiMessageService = require('./aiMessageService');

const DEFAULT_CRON_SCHEDULE = '0 8 * * *';

class BirthdayService {
    constructor() {
        this.cronJob = null;
        this.currentSchedule = null;
        this.scheduleCheckInterval = null;
    }

    startBirthdayChecker() {
        // Check immediately on startup
        // this.checkForBirthdays();
        
        // Start the cron job with current config
        this.updateCronSchedule();
        
        // Check for schedule changes every minute
        this.scheduleCheckInterval = setInterval(() => {
            this.checkForScheduleChanges();

            // Validate birthdays.json
            const birthdays = configManager.getBirthdays();
            if (!Array.isArray(birthdays) || birthdays.length === 0) {
                logger.warn('Please check birthdays.json, it is either malformed or empty.');
            }
            
        }, 60000); // Check every minute
        
        logger.info('Birthday checker started with dynamic config reloading');
    }

    updateCronSchedule() {
        const config = configManager.getConfig();
        const cronSchedule = config.cronSchedule || DEFAULT_CRON_SCHEDULE;
        const timezone = config.timezone || 'Europe/Berlin';
        
        // Stop existing job if it exists
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob.destroy();
        }
        
        // Create new cron job
        this.cronJob = cron.schedule(cronSchedule, () => {
            this.checkForBirthdays();
        }, {
            scheduled: true,
            timezone: timezone
        });
        
        this.currentSchedule = cronSchedule;
        this.logNextExecution(cronSchedule, timezone);
    }

    checkForScheduleChanges() {
        const config = configManager.getConfig();
        const newSchedule = config.cronSchedule || DEFAULT_CRON_SCHEDULE;
        
        if (newSchedule !== this.currentSchedule) {
            logger.info(`Cron schedule changed from "${this.currentSchedule}" to "${newSchedule}". Updating...`);
            this.updateCronSchedule();
        }
    }

    stopBirthdayChecker() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob.destroy();
            this.cronJob = null;
        }
        
        if (this.scheduleCheckInterval) {
            clearInterval(this.scheduleCheckInterval);
            this.scheduleCheckInterval = null;
        }
        
        logger.info('Birthday checker stopped');
    }

    logNextExecution(cronSchedule, timezone) {
        try {
            const interval = parser.parseExpression(cronSchedule, { tz: timezone });
            const nextRun = interval.next().toDate();
            const nextRunFormatted = moment(nextRun).tz(timezone).format('dddd, MMMM Do YYYY, h:mm A');
            logger.info(`Birthday checker scheduled. Next check: ${nextRunFormatted} (${timezone})`);
        } catch (error) {
            logger.info(`Birthday checker scheduled with cron: ${cronSchedule} (${timezone}). Error: ${error.message}`);
        }
    }

    async checkForBirthdays() {
        const config = configManager.getConfig();
        const timezone = config.timezone || 'Europe/Berlin';
        
        // Use the configured timezone instead of server timezone
        const today = moment().tz(timezone);
        const todayKey = `${today.date().toString().padStart(2, '0')}-${(today.month() + 1).toString().padStart(2, '0')}`;
        
        logger.info(`Checking for birthdays on ${todayKey} (${timezone})...`);
        
        const birthdays = configManager.getBirthdays();
        
        // Check each person to see if it's their birthday
        for (const person of birthdays) {
            if (person.date === todayKey) {
                logger.info(`Found birthday: ${person.name}`);
                
                try {
                    await this.handleBirthday(person, config);
                } catch (error) {
                    logger.error(`Error handling birthday for ${person.name}`, error);
                    logger.info(`Make sure ${person.name}'s number (${person.phone || 'not provided'}) is saved in your WhatsApp contacts`);
                }
            }
        }
    }

    async handleBirthday(person, config) {
        if (person.personal) {
            // Send personal notification to you for manual handling
            if (config.yourPhoneNumber) {
                const reminderMessage = await aiMessageService.generatePersonalReminderMessage(person.name);
                await whatsappService.sendMessage(config.yourPhoneNumber, reminderMessage);
                logger.info(`Sent personal reminder for ${person.name} to you`);
            } else {
                logger.warn(`Personal birthday for ${person.name} but yourPhoneNumber not configured`);
            }
        } else {
            // Generate AI message and send automatically
            const aiMessage = await aiMessageService.generateBirthdayMessage(person.name);
            
            if (person.phone) {
                // Send Minion Image
                try {
                    const minionsDir = path.join(__dirname, '../../minions');
                    if (fs.existsSync(minionsDir)) {
                        const files = fs.readdirSync(minionsDir);
                        const images = files.filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
                        
                        if (images.length > 0) {
                            const randomImage = images[Math.floor(Math.random() * images.length)];
                            const imagePath = path.join(minionsDir, randomImage);
                            await whatsappService.sendImage(person.phone, imagePath);
                            logger.info(`Sent minion image (${randomImage}) to ${person.name}`);
                            
                            // Small delay to ensure image arrives first (optional but good for UX)
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } else {
                            logger.warn('No images found in minions folder');
                        }
                    } else {
                        logger.warn('Minions folder not found');
                    }
                } catch (error) {
                    logger.error('Error sending minion image', error);
                }

                await whatsappService.sendMessage(person.phone, aiMessage);
                logger.info(`Sent AI birthday message to ${person.name} at ${person.phone}`);
            } else {
                logger.warn(`No phone number for ${person.name}, cannot send message`);
            }
        }
    }

    // Utility method to add a birthday (for future expansion)
    addBirthday(name, date, phone, personal = false) {
        const birthdays = configManager.getBirthdays();
        birthdays.push({ name, date, phone, personal });
        // Note: This would need a save method in configManager to persist
        logger.info(`Added birthday for ${name} on ${date}`);
    }

    // Utility method to get upcoming birthdays (for future expansion)
    getUpcomingBirthdays(days = 7) {
        const config = configManager.getConfig();
        const timezone = config.timezone || 'Europe/Berlin';
        const birthdays = configManager.getBirthdays();
        const today = moment().tz(timezone);
        const upcoming = [];

        for (let i = 0; i < days; i++) {
            const checkDate = today.clone().add(i, 'days');
            const checkKey = `${checkDate.date().toString().padStart(2, '0')}-${(checkDate.month() + 1).toString().padStart(2, '0')}`;
            
            const birthdaysToday = birthdays.filter(person => person.date === checkKey);
            if (birthdaysToday.length > 0) {
                upcoming.push({
                    date: checkDate.format('DD-MM'),
                    fullDate: checkDate.format('YYYY-MM-DD'),
                    people: birthdaysToday
                });
            }
        }

        return upcoming;
    }
}

// Export singleton instance
module.exports = new BirthdayService();