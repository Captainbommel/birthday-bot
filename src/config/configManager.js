const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const logger = require('../utils/logger');

class ConfigManager {
    constructor() {
        this.CONFIG_FILE = path.join(__dirname, '../../config.json');
    }

    loadConfig() {
        const defaultConfig = {
            cronSchedule: "0 8 * * *",
            timezone: "Europe/Berlin",
            openaiApiKey: "",
            yourPhoneNumber: "",
            botOwner: "John",
            birthdays: []
        };

        if (fs.existsSync(this.CONFIG_FILE)) {
            try {
                const loadedConfig = JSON.parse(fs.readFileSync(this.CONFIG_FILE, 'utf8'));
                const config = { ...defaultConfig, ...loadedConfig };

                // Strip spaces from phone number
                if (config.yourPhoneNumber) {
                    config.yourPhoneNumber = config.yourPhoneNumber.replace(/\s+/g, '');
                }

                return config;
            } catch (error) {
                logger.error('Error loading config file', error);
                return defaultConfig;
            }
        } else {
            logger.error('Config file not found. Please create config.json with required settings.');
            return defaultConfig;
        }
    }

    loadBirthdays() {
        const config = this.loadConfig();
        const birthdays = config.birthdays || [];
        // Strip spaces from phone numbers
        return birthdays.map(birthday => {
            if (birthday.phone) {
                birthday.phone = birthday.phone.replace(/\s+/g, '');
            }
            return birthday;
        });
    }

    getConfig() {
        // Always load fresh config to allow runtime changes
        return this.loadConfig();
    }

    getBirthdays() {
        // Always load fresh birthdays to allow runtime changes
        return this.loadBirthdays();
    }

    validateConfig() {
        const config = this.getConfig();
        const warnings = [];
        const errors = [];

        if (!config.openaiApiKey) {
            warnings.push('OpenAI API key not configured. Add it to config.json');
        }

        if (!config.yourPhoneNumber) {
            warnings.push('Your phone number is not configured. Add it to config.json for personal notifications');
        }

        // Validate cron schedule
        if (config.cronSchedule && !cron.validate(config.cronSchedule)) {
            errors.push(`Invalid cron schedule: ${config.cronSchedule}. Please use valid cron syntax (e.g., "0 8 * * *" for 8 AM daily)`);
        }

        if (errors.length > 0) {
            errors.forEach(error => logger.error(error));
            throw new Error('Configuration validation failed: ' + errors.join(', '));
        }

        if (warnings.length > 0) {
            warnings.forEach(warning => logger.warn(warning));
        }

        return warnings.length === 0;
    }
}

// Export singleton instance
module.exports = new ConfigManager();