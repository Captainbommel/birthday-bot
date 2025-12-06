const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Mock external modules
jest.mock('fs');
jest.mock('path');
jest.mock('node-cron');
jest.mock('../../src/utils/logger', () => require('../__mocks__/logger'));

const logger = require('../../src/utils/logger');

describe('ConfigManager', () => {
    let ConfigManager;
    let configManager;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Re-require the module to get a fresh instance
        jest.isolateModules(() => {
            ConfigManager = require('../../src/config/configManager');
            configManager = ConfigManager;
        });
    });

    describe('constructor', () => {
        test('should set correct file paths', () => {
            expect(path.join).toHaveBeenCalledWith(expect.any(String), '../../config.json');
            expect(path.join).toHaveBeenCalledWith(expect.any(String), '../../birthdays.json');
        });
    });

    describe('loadConfig', () => {
        const defaultConfig = {
            cronSchedule: "0 8 * * *",
            timezone: "Europe/Berlin",
            openaiApiKey: "",
            yourPhoneNumber: "",
            botOwner: "John"
        };

        test('should return default config when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            const result = configManager.loadConfig();
            
            expect(fs.existsSync).toHaveBeenCalledWith(configManager.CONFIG_FILE);
            expect(logger.error).toHaveBeenCalledWith('Config file not found. Please create config.json with required settings.');
            expect(result).toEqual(defaultConfig);
        });

        test('should load and merge config from file when it exists', () => {
            const fileConfig = {
                cronSchedule: "0 9 * * *",
                openaiApiKey: "test-api-key",
                yourPhoneNumber: "+1234567890"
            };
            const expectedConfig = { ...defaultConfig, ...fileConfig };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));

            const result = configManager.loadConfig();

            expect(fs.existsSync).toHaveBeenCalledWith(configManager.CONFIG_FILE);
            expect(fs.readFileSync).toHaveBeenCalledWith(configManager.CONFIG_FILE, 'utf8');
            expect(result).toEqual(expectedConfig);
        });

        test('should return default config and log error when JSON parsing fails', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');

            const result = configManager.loadConfig();

            expect(logger.error).toHaveBeenCalledWith('Error loading config file', expect.any(Error));
            expect(result).toEqual(defaultConfig);
        });

        test('should handle file read errors gracefully', () => {
            const readError = new Error('File read error');
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockImplementation(() => {
                throw readError;
            });

            const result = configManager.loadConfig();

            expect(logger.error).toHaveBeenCalledWith('Error loading config file', readError);
            expect(result).toEqual(defaultConfig);
        });

        test('should strip spaces from yourPhoneNumber', () => {
            const fileConfig = {
                yourPhoneNumber: "+1 234 567 890"
            };
            
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));

            const result = configManager.loadConfig();

            expect(result.yourPhoneNumber).toBe("+1234567890");
        });
    });

    describe('loadBirthdays', () => {
        test('should return empty array when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            
            const result = configManager.loadBirthdays();
            
            expect(fs.existsSync).toHaveBeenCalledWith(configManager.BIRTHDAYS_FILE);
            expect(logger.warn).toHaveBeenCalledWith('Birthdays file not found. Creating empty array.');
            expect(result).toEqual([]);
        });

        test('should load birthdays from file when it exists', () => {
            const mockBirthdays = [
                { name: 'John Doe', date: '01-01', phone: '+1111111111', personal: false },
                { name: 'Jane Smith', date: '02-02', phone: '+2222222222', personal: true }
            ];

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockBirthdays));

            const result = configManager.loadBirthdays();

            expect(fs.existsSync).toHaveBeenCalledWith(configManager.BIRTHDAYS_FILE);
            expect(fs.readFileSync).toHaveBeenCalledWith(configManager.BIRTHDAYS_FILE, 'utf8');
            expect(result).toEqual(mockBirthdays);
        });

        test('should return empty array and log error when JSON parsing fails', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');

            const result = configManager.loadBirthdays();

            expect(logger.error).toHaveBeenCalledWith('Error loading birthdays file', expect.any(Error));
            expect(result).toEqual([]);
        });

        test('should handle file read errors gracefully', () => {
            const readError = new Error('File read error');
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockImplementation(() => {
                throw readError;
            });

            const result = configManager.loadBirthdays();

            expect(logger.error).toHaveBeenCalledWith('Error loading birthdays file', readError);
            expect(result).toEqual([]);
        });

        test('should strip spaces from phone numbers in birthdays', () => {
            const birthdays = [
                { name: "Test", phone: "+1 234 567 890" },
                { name: "Test2", phone: "+9 876 543 210" }
            ];

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(birthdays));

            const result = configManager.loadBirthdays();

            expect(result[0].phone).toBe("+1234567890");
            expect(result[1].phone).toBe("+9876543210");
        });

        test('should handle birthdays without phone numbers', () => {
            const birthdays = [
                { name: "Test" }
            ];

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(birthdays));

            const result = configManager.loadBirthdays();

            expect(result[0].phone).toBeUndefined();
        });
    });

    describe('getConfig', () => {
        test('should call loadConfig and return fresh config', () => {
            const mockConfig = { cronSchedule: "0 9 * * *", timezone: "UTC" };
            
            // Mock loadConfig method
            const originalLoadConfig = configManager.loadConfig;
            configManager.loadConfig = jest.fn().mockReturnValue(mockConfig);

            const result = configManager.getConfig();

            expect(configManager.loadConfig).toHaveBeenCalled();
            expect(result).toEqual(mockConfig);

            // Restore original method
            configManager.loadConfig = originalLoadConfig;
        });
    });

    describe('getBirthdays', () => {
        test('should call loadBirthdays and return fresh birthdays', () => {
            const mockBirthdays = [{ name: 'Test', date: '01-01' }];
            
            // Mock loadBirthdays method
            const originalLoadBirthdays = configManager.loadBirthdays;
            configManager.loadBirthdays = jest.fn().mockReturnValue(mockBirthdays);

            const result = configManager.getBirthdays();

            expect(configManager.loadBirthdays).toHaveBeenCalled();
            expect(result).toEqual(mockBirthdays);

            // Restore original method
            configManager.loadBirthdays = originalLoadBirthdays;
        });
    });

    describe('validateConfig', () => {
        beforeEach(() => {
            // Mock getConfig method
            configManager.getConfig = jest.fn();
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

            expect(logger.warn).toHaveBeenCalledWith('OpenAI API key not configured. Add it to config.json');
            expect(logger.warn).toHaveBeenCalledWith('Your phone number is not configured. Add it to config.json for personal notifications');
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

            expect(logger.warn).toHaveBeenCalledWith('OpenAI API key not configured. Add it to config.json');
            expect(logger.warn).toHaveBeenCalledWith('Your phone number is not configured. Add it to config.json for personal notifications');
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