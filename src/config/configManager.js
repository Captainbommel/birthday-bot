const cron = require('node-cron');
const logger = require('../utils/logger');
const db = require('./database');
const birthdayRepository = require('./birthdayRepository');

const DEFAULT_CRON = '0 8 * * *';
const DEFAULT_TIMEZONE = 'Europe/Berlin';

db.run(`
    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
`);

const _settingsGet = db.prepare('SELECT value FROM settings WHERE key = ?');
const _settingsSet = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

class ConfigManager {
    getConfig() {
        const row = _settingsGet.get('cronSchedule');
        const cronFromDb = row !== null && row !== undefined ? row.value : null;
        return {
            cronSchedule: cronFromDb || process.env.CRON_SCHEDULE || DEFAULT_CRON,
            timezone: process.env.TIMEZONE || DEFAULT_TIMEZONE,
            openaiApiKey: process.env.OPENAI_API_KEY || '',
            yourPhoneNumber: (process.env.YOUR_PHONE_NUMBER || '').replace(/\s+/g, ''),
            botOwner: process.env.BOT_OWNER || 'John',
        };
    }

    loadConfig() {
        return this.getConfig();
    }

    loadBirthdays() {
        return birthdayRepository.getAll();
    }

    getBirthdays() {
        return birthdayRepository.getAll();
    }

    setCronSchedule(schedule) {
        _settingsSet.run('cronSchedule', String(schedule));
    }

    validateConfig() {
        const config = this.getConfig();
        const warnings = [];
        const errors = [];

        if (!config.openaiApiKey) {
            warnings.push('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
        }

        if (!config.yourPhoneNumber) {
            warnings.push('Your phone number is not configured. Set YOUR_PHONE_NUMBER in .env for personal notifications');
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