const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

// ── Stable mock functions – reassigned per test; wrapper closures stay live ──
let mockSettingsGet = jest.fn().mockReturnValue(null);
let mockSettingsSet = jest.fn();

// Wrappers delegate through the live variable so the reassigned fn is always called.
const settingsGetWrapper = (...args) => mockSettingsGet(...args);
const settingsSetWrapper = (...args) => mockSettingsSet(...args);

const mockDb = {
    run: jest.fn(),
    prepare: jest.fn().mockImplementation((sql) => {
        if (sql.toUpperCase().startsWith('SELECT')) return { get: settingsGetWrapper };
        return { run: settingsSetWrapper };
    }),
};

const mockBirthdayRepository = {
    getAll: jest.fn().mockReturnValue([]),
    getByName: jest.fn().mockReturnValue(null),
    add: jest.fn(),
    update: jest.fn(),
    remove: jest.fn().mockReturnValue(false),
    exportJSON: jest.fn().mockReturnValue('{}'),
    importJSON: jest.fn().mockReturnValue(0),
};

// Register module mocks BEFORE requiring the module under test.
// mock.module intercepts at Bun's resolution layer, preventing the real
// bun:sqlite database from being built when configManager is re-required.
mock.module('node-cron', () => ({ schedule: jest.fn(), validate: jest.fn() }));
mock.module('../../src/config/database', () => mockDb);
mock.module('../../src/config/birthdayRepository', () => mockBirthdayRepository);

// Trigger initial module load at file scope
require('../../src/config/configManager');

const cron = require('node-cron');
const logger = require('../../src/utils/logger');

describe('ConfigManager', () => {
    let configManager;
    let savedEnv;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reassign fresh mock functions so each test starts with zero call history
        mockSettingsGet = jest.fn().mockReturnValue(null);
        mockSettingsSet = jest.fn();

        // Restore mockDb.prepare implementation after clearAllMocks clears it
        mockDb.prepare.mockImplementation((sql) => {
            if (sql.toUpperCase().startsWith('SELECT')) return { get: settingsGetWrapper };
            return { run: settingsSetWrapper };
        });

        // Restore birthdayRepository default return values
        mockBirthdayRepository.getAll.mockReturnValue([]);
        mockBirthdayRepository.getByName.mockReturnValue(null);
        mockBirthdayRepository.remove.mockReturnValue(false);
        mockBirthdayRepository.exportJSON.mockReturnValue('{}');
        mockBirthdayRepository.importJSON.mockReturnValue(0);

        // Save and clear relevant env vars so each test starts clean
        savedEnv = {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            TIMEZONE: process.env.TIMEZONE,
            YOUR_PHONE_NUMBER: process.env.YOUR_PHONE_NUMBER,
            BOT_OWNER: process.env.BOT_OWNER,
            CRON_SCHEDULE: process.env.CRON_SCHEDULE,
        };
        delete process.env.OPENAI_API_KEY;
        delete process.env.TIMEZONE;
        delete process.env.YOUR_PHONE_NUMBER;
        delete process.env.BOT_OWNER;
        delete process.env.CRON_SCHEDULE;

        spyOn(logger, 'info').mockImplementation(() => {});
        spyOn(logger, 'warn').mockImplementation(() => {});
        spyOn(logger, 'error').mockImplementation(() => {});
        spyOn(logger, 'debug').mockImplementation(() => {});

        delete require.cache[require.resolve('../../src/config/configManager')];
        configManager = require('../../src/config/configManager');
    });

    afterEach(() => {
        Object.entries(savedEnv).forEach(([key, val]) => {
            if (val === undefined) delete process.env[key];
            else process.env[key] = val;
        });
        mock.restore();
    });

    describe('getConfig', () => {
        const defaults = {
            cronSchedule: '0 8 * * *',
            timezone: 'Europe/Berlin',
            openaiApiKey: '',
            yourPhoneNumber: '',
            botOwner: 'John',
        };

        test('should return defaults when no env vars are set', () => {
            expect(configManager.getConfig()).toEqual(defaults);
        });

        test('should read OPENAI_API_KEY from process.env', () => {
            process.env.OPENAI_API_KEY = 'test-key';
            expect(configManager.getConfig().openaiApiKey).toBe('test-key');
        });

        test('should read TIMEZONE from process.env', () => {
            process.env.TIMEZONE = 'America/New_York';
            expect(configManager.getConfig().timezone).toBe('America/New_York');
        });

        test('should read YOUR_PHONE_NUMBER from process.env and strip spaces', () => {
            process.env.YOUR_PHONE_NUMBER = '+49 1575 1234';
            expect(configManager.getConfig().yourPhoneNumber).toBe('+4915751234');
        });

        test('should read BOT_OWNER from process.env', () => {
            process.env.BOT_OWNER = 'Lars';
            expect(configManager.getConfig().botOwner).toBe('Lars');
        });

        test('should read cronSchedule from the database', () => {
            mockSettingsGet.mockReturnValue({ value: '0 9 * * *' });
            expect(configManager.getConfig().cronSchedule).toBe('0 9 * * *');
        });

        test('should fall back to CRON_SCHEDULE env var when not in DB', () => {
            mockSettingsGet.mockReturnValue(null);
            process.env.CRON_SCHEDULE = '0 10 * * *';
            expect(configManager.getConfig().cronSchedule).toBe('0 10 * * *');
        });

        test('should use default cronSchedule when not in DB and not in env', () => {
            mockSettingsGet.mockReturnValue(null);
            expect(configManager.getConfig().cronSchedule).toBe('0 8 * * *');
        });
    });

    describe('loadConfig', () => {
        test('should be an alias for getConfig', () => {
            const spy = jest.spyOn(configManager, 'getConfig');
            configManager.loadConfig();
            expect(spy).toHaveBeenCalled();
        });
    });

    describe('setCronSchedule', () => {
        test('should persist schedule to the database', () => {
            configManager.setCronSchedule('0 12 * * *');
            expect(mockSettingsSet).toHaveBeenCalledWith('cronSchedule', '0 12 * * *');
        });
    });

    describe('loadBirthdays', () => {
        test('should delegate to birthdayRepository.getAll', () => {
            const mockBirthdays = [
                { name: 'John Doe', date: '01-01', phone: '+1111111111', type: 'generated' },
                { name: 'Jane Smith', date: '02-02', phone: '+2222222222', type: 'personal' }
            ];
            mockBirthdayRepository.getAll.mockReturnValue(mockBirthdays);

            const result = configManager.loadBirthdays();

            expect(mockBirthdayRepository.getAll).toHaveBeenCalledTimes(1);
            expect(result).toEqual(mockBirthdays);
        });

        test('should return empty array when no birthdays exist', () => {
            mockBirthdayRepository.getAll.mockReturnValue([]);

            const result = configManager.loadBirthdays();

            expect(result).toEqual([]);
        });
    });

    describe('getBirthdays', () => {
        test('should call birthdayRepository.getAll and return result', () => {
            const mockBirthdays = [{ name: 'Test', date: '01-01' }];
            mockBirthdayRepository.getAll.mockReturnValue(mockBirthdays);

            const result = configManager.getBirthdays();

            expect(mockBirthdayRepository.getAll).toHaveBeenCalled();
            expect(result).toEqual(mockBirthdays);
        });
    });

    describe('validateConfig', () => {
        beforeEach(() => {
            // Mock getConfig method
            configManager.getConfig = jest.fn();
            // Re-create cron.validate as fresh jest.fn() since mock.module factory's
            // jest.fn() may lose mock API after jest.clearAllMocks()
            cron.validate = jest.fn().mockReturnValue(true);
        });

        test('should return true when config is valid with no warnings', () => {
            const validConfig = {
                cronSchedule: "0 8 * * *",
                timezone: "Europe/Berlin",
                openaiApiKey: "test-key",
                yourPhoneNumber: "+1234567890"
            };
            
            configManager.getConfig.mockReturnValue(validConfig);
            cron.validate.mockReturnValue(true);

            const result = configManager.validateConfig();

            expect(cron.validate).toHaveBeenCalledWith("0 8 * * *");
            expect(result).toBe(true);
            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.error).not.toHaveBeenCalled();
        });

        test('should log warnings when optional fields are missing', () => {
            const configWithWarnings = {
                cronSchedule: "0 8 * * *",
                timezone: "Europe/Berlin",
                openaiApiKey: "",
                yourPhoneNumber: ""
            };
            
            configManager.getConfig.mockReturnValue(configWithWarnings);
            cron.validate.mockReturnValue(true);

            const result = configManager.validateConfig();

            expect(logger.warn).toHaveBeenCalledWith('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
            expect(logger.warn).toHaveBeenCalledWith('Your phone number is not configured. Set YOUR_PHONE_NUMBER in .env for personal notifications');
            expect(result).toBe(false); // Returns false when there are warnings
        });

        test('should log warnings when optional fields are undefined', () => {
            const configWithWarnings = {
                cronSchedule: "0 8 * * *",
                timezone: "Europe/Berlin"
                // openaiApiKey and yourPhoneNumber are undefined
            };
            
            configManager.getConfig.mockReturnValue(configWithWarnings);
            cron.validate.mockReturnValue(true);

            const result = configManager.validateConfig();

            expect(logger.warn).toHaveBeenCalledWith('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
            expect(logger.warn).toHaveBeenCalledWith('Your phone number is not configured. Set YOUR_PHONE_NUMBER in .env for personal notifications');
            expect(result).toBe(false);
        });

        test('should throw error when cron schedule is invalid', () => {
            const invalidConfig = {
                cronSchedule: "invalid cron",
                timezone: "Europe/Berlin",
                openaiApiKey: "test-key",
                yourPhoneNumber: "+1234567890"
            };
            
            configManager.getConfig.mockReturnValue(invalidConfig);
            cron.validate.mockReturnValue(false);

            expect(() => configManager.validateConfig()).toThrow('Configuration validation failed: Invalid cron schedule: invalid cron. Please use valid cron syntax (e.g., "0 8 * * *" for 8 AM daily)');
            expect(logger.error).toHaveBeenCalledWith('Invalid cron schedule: invalid cron. Please use valid cron syntax (e.g., "0 8 * * *" for 8 AM daily)');
        });

        test('should validate cron schedule when it exists', () => {
            const configWithCron = {
                cronSchedule: "0 8 * * *",
                timezone: "Europe/Berlin",
                openaiApiKey: "test-key",
                yourPhoneNumber: "+1234567890"
            };
            
            configManager.getConfig.mockReturnValue(configWithCron);
            cron.validate.mockReturnValue(true);

            configManager.validateConfig();

            expect(cron.validate).toHaveBeenCalledWith("0 8 * * *");
        });

        test('should skip cron validation when cronSchedule is empty', () => {
            const configWithoutCron = {
                cronSchedule: "",
                timezone: "Europe/Berlin",
                openaiApiKey: "test-key",
                yourPhoneNumber: "+1234567890"
            };
            
            configManager.getConfig.mockReturnValue(configWithoutCron);

            configManager.validateConfig();

            expect(cron.validate).not.toHaveBeenCalled();
        });

        test('should skip cron validation when cronSchedule is undefined', () => {
            const configWithoutCron = {
                timezone: "Europe/Berlin",
                openaiApiKey: "test-key",
                yourPhoneNumber: "+1234567890"
            };
            
            configManager.getConfig.mockReturnValue(configWithoutCron);

            configManager.validateConfig();

            expect(cron.validate).not.toHaveBeenCalled();
        });

        test('should handle multiple validation errors', () => {
            const invalidConfig = {
                cronSchedule: "invalid cron",
                timezone: "Europe/Berlin",
                openaiApiKey: "",
                yourPhoneNumber: ""
            };
            
            configManager.getConfig.mockReturnValue(invalidConfig);
            cron.validate.mockReturnValue(false);

            expect(() => configManager.validateConfig()).toThrow('Configuration validation failed: Invalid cron schedule: invalid cron. Please use valid cron syntax (e.g., "0 8 * * *" for 8 AM daily)');
            expect(logger.error).toHaveBeenCalledWith('Invalid cron schedule: invalid cron. Please use valid cron syntax (e.g., "0 8 * * *" for 8 AM daily)');
            // Note: warnings are not logged when there are errors because the error is thrown first
            expect(logger.warn).not.toHaveBeenCalled();
        });
    });

    describe('module export', () => {
        test('should export a singleton instance', () => {
            // Re-require to test singleton behavior
            const instance1 = require('../../src/config/configManager');
            const instance2 = require('../../src/config/configManager');
            
            expect(instance1).toBe(instance2);
        });
    });
});