const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

mock.module('node-cron', () => ({ schedule: jest.fn(), validate: jest.fn() }));

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const logger = require('../../src/utils/logger');

let mockBirthdayRepository;

describe('ConfigManager', () => {
    let ConfigManager;
    let configManager;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Fresh birthday repository mock
        mockBirthdayRepository = {
            getAll: jest.fn().mockReturnValue([]),
            getByName: jest.fn().mockReturnValue(null),
            add: jest.fn(),
            update: jest.fn(),
            remove: jest.fn().mockReturnValue(false),
            exportJSON: jest.fn().mockReturnValue('{}'),
            importJSON: jest.fn().mockReturnValue(0),
        };

        // Spy on logger methods
        spyOn(logger, 'info').mockImplementation(() => {});
        spyOn(logger, 'warn').mockImplementation(() => {});
        spyOn(logger, 'error').mockImplementation(() => {});
        spyOn(logger, 'debug').mockImplementation(() => {});

        // Spy on Node built-ins before re-requiring ConfigManager
        spyOn(path, 'join');
        spyOn(fs, 'existsSync').mockReturnValue(false);
        spyOn(fs, 'readFileSync').mockReturnValue('');
        spyOn(fs, 'writeFileSync').mockImplementation(() => {});

        // Inject birthdayRepository mock so configManager doesn't open SQLite
        const repoPath = require.resolve('../../src/config/birthdayRepository');
        require.cache[repoPath] = {
            id: repoPath,
            filename: repoPath,
            loaded: true,
            exports: mockBirthdayRepository,
            children: [],
            paths: module.paths,
        };

        // Re-require the module to get a fresh instance (replaces jest.isolateModules)
        delete require.cache[require.resolve('../../src/config/configManager')];
        ConfigManager = require('../../src/config/configManager');
        configManager = ConfigManager;
    });

    afterEach(() => {
        mock.restore();
    });

    describe('constructor', () => {
        test('should set correct file paths', () => {
            expect(path.join).toHaveBeenCalledWith(expect.any(String), '../../config.json');
        });
    });

    describe('loadConfig', () => {
        const defaultConfig = {
            cronSchedule: "0 8 * * *",
            timezone: "Europe/Berlin",
            openaiApiKey: "",
            yourPhoneNumber: "",
            botOwner: "John",
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