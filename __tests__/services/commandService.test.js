const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

mock.module('../../src/config/configManager', () => require('../__mocks__/configManager'));
mock.module('fs', () => ({ existsSync: jest.fn(), readFileSync: jest.fn(), writeFileSync: jest.fn() }));
mock.module('node-cron', () => ({ schedule: jest.fn(), validate: jest.fn() }));

const fs = require('fs');
const cron = require('node-cron');
const CommandService = require('../../src/services/commandService');
const logger = require('../../src/utils/logger');
const configManager = require('../../src/config/configManager');

describe('CommandService', () => {
    let commandService;
    let mockWhatsappService;
    let mockBirthdayService;
    let mockChatId;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        spyOn(logger, 'info').mockImplementation(() => {});
        spyOn(logger, 'warn').mockImplementation(() => {});
        spyOn(logger, 'error').mockImplementation(() => {});
        spyOn(logger, 'debug').mockImplementation(() => {});
        configManager.resetMocks();

        mockChatId = '+1234567890';

        // Mock WhatsApp service
        mockWhatsappService = {
            sendMessage: jest.fn().mockResolvedValue(true),
            getLatestMessage: jest.fn().mockResolvedValue(null)
        };

        // Mock Birthday service
        mockBirthdayService = {
            startBirthdayChecker: jest.fn(),
            stopBirthdayChecker: jest.fn()
        };

        // Mock fs
        fs.readFileSync = jest.fn();
        fs.writeFileSync = jest.fn();
        fs.existsSync = jest.fn().mockReturnValue(true);

        // Mock cron
        cron.validate = jest.fn().mockReturnValue(true);

        commandService = new CommandService(mockWhatsappService, mockBirthdayService);
    });

    afterEach(() => {
        mock.restore();
    });

    describe('Constructor', () => {
        test('should initialize with correct defaults', () => {
            expect(commandService.whatsappService).toBe(mockWhatsappService);
            expect(commandService.birthdayService).toBe(mockBirthdayService);
            expect(commandService.commandPrefix).toBe('$:');
            expect(commandService.botActive).toBe(true);
            expect(commandService.lastCheckedMessageId).toBe(null);
        });
    });

    describe('handleHelp', () => {
        test('should send help text with all commands', async () => {
            await commandService.handleHelp(mockChatId);

            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Birthday Bot Commands')
            );
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('addBday')
            );
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('editBday')
            );
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('removeBday')
            );
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('triggerBday')
            );
        });
    });

    describe('handleAddOrEditBirthday', () => {
        test('should add a new birthday successfully', async () => {
            const mockBirthdays = [];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'John', '-d', '15-03', '-ph', '+4912345', '-t', 'generated'];
            await commandService.handleAddOrEditBirthday('addBday', args, mockChatId);

            expect(fs.writeFileSync).toHaveBeenCalled();
            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.birthdays).toEqual([
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ]);
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Birthday added successfully')
            );
        });

        test('should use default type when not specified', async () => {
            const mockBirthdays = [];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'Jane', '-d', '20-06', '-ph', '+4999999'];
            await commandService.handleAddOrEditBirthday('addBday', args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.birthdays[0].type).toBe('generated');
        });

        test('should prevent adding duplicate birthday', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'John', '-d', '20-03', '-ph', '+4999999'];
            await commandService.handleAddOrEditBirthday('addBday', args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('already exists')
            );
        });

        test('should edit existing birthday successfully', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'John', '-d', '20-03', '-ph', '+4999999', '-t', 'personal'];
            await commandService.handleAddOrEditBirthday('editBday', args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.birthdays).toEqual([
                { name: 'John', date: '20-03', phone: '+4999999', type: 'personal' }
            ]);
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Birthday updated successfully')
            );
        });

        test('should fail to edit non-existent birthday', async () => {
            const mockBirthdays = [];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'John', '-d', '20-03', '-ph', '+4999999'];
            await commandService.handleAddOrEditBirthday('editBday', args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('not found')
            );
        });

        test('should preserve existing config fields when adding a birthday', async () => {
            const existingConfig = {
                cronSchedule: '0 9 * * *',
                timezone: 'UTC',
                openaiApiKey: 'my-key',
                birthdays: []
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));

            const args = ['--n', 'John', '-d', '15-03', '-ph', '+4912345', '-t', 'generated'];
            await commandService.handleAddOrEditBirthday('addBday', args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.cronSchedule).toBe('0 9 * * *');
            expect(savedConfig.timezone).toBe('UTC');
            expect(savedConfig.openaiApiKey).toBe('my-key');
        });

        test('should handle missing birthdays key in existing config', async () => {
            // Simulate an old config.json that predates the merge
            const legacyConfig = { cronSchedule: '0 8 * * *' };
            fs.readFileSync.mockReturnValue(JSON.stringify(legacyConfig));

            const args = ['--n', 'John', '-d', '15-03', '-ph', '+4912345'];
            await commandService.handleAddOrEditBirthday('addBday', args, mockChatId);

            expect(fs.writeFileSync).toHaveBeenCalled();
            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.birthdays).toHaveLength(1);
            expect(savedConfig.cronSchedule).toBe('0 8 * * *');
        });

        test('should validate date format', async () => {
            const args = ['--n', 'John', '-d', '2023-03-15', '-ph', '+4912345'];
            await commandService.handleAddOrEditBirthday('addBirthday', args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Invalid date format')
            );
        });

        test('should require name and date', async () => {
            const args = ['--n', 'John'];
            await commandService.handleAddOrEditBirthday('addBirthday', args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Usage:')
            );
        });
    });

    describe('handleRemoveBirthday', () => {
        test('should remove birthday successfully', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' },
                { name: 'Jane', date: '20-06', phone: '+4999999', type: 'personal' }
            ];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'John'];
            await commandService.handleRemoveBirthday(args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.birthdays).toHaveLength(1);
            expect(savedConfig.birthdays[0].name).toBe('Jane');
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Birthday removed successfully')
            );
        });

        test('should handle case-insensitive name matching', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ];
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: mockBirthdays }));

            const args = ['--n', 'JOHN'];
            await commandService.handleRemoveBirthday(args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.birthdays).toHaveLength(0);
        });

        test('should preserve existing config fields when removing a birthday', async () => {
            const existingConfig = {
                cronSchedule: '0 9 * * *',
                timezone: 'UTC',
                birthdays: [
                    { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
                ]
            };
            fs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));

            const args = ['--n', 'John'];
            await commandService.handleRemoveBirthday(args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.cronSchedule).toBe('0 9 * * *');
            expect(savedConfig.timezone).toBe('UTC');
            expect(savedConfig.birthdays).toHaveLength(0);
        });

        test('should fail when birthday not found', async () => {
            const mockBirthdays = [
                { name: 'Jane', date: '20-06', phone: '+4999999', type: 'personal' }
            ];
            fs.readFileSync.mockReturnValue(JSON.stringify(mockBirthdays));

            const args = ['--n', 'John'];
            await commandService.handleRemoveBirthday(args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('not found')
            );
        });

        test('should require name parameter', async () => {
            const args = [];
            await commandService.handleRemoveBirthday(args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Usage:')
            );
        });
    });

    describe('handleListBirthdays', () => {
        test('should list all birthdays sorted by date', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' },
                { name: 'Jane', date: '10-01', phone: '+4999999', type: 'personal' },
                { name: 'Bob', date: '20-12', phone: '+4988888', type: 'generated_topic_age' }
            ];
            configManager.setMockBirthdays(mockBirthdays);

            await commandService.handleListBirthdays(mockChatId);

            const message = mockWhatsappService.sendMessage.mock.calls[0][1];
            expect(message).toContain('Saved Birthdays (3)');
            expect(message).toContain('Jane');
            expect(message).toContain('10-01');
            expect(message).toContain('John');
            expect(message).toContain('15-03');
            expect(message).toContain('Bob');
            expect(message).toContain('20-12');
            
            // Check order (Jane should be before John)
            const janeIndex = message.indexOf('Jane');
            const johnIndex = message.indexOf('John');
            expect(janeIndex).toBeLessThan(johnIndex);
        });

        test('should handle empty birthdays list', async () => {
            configManager.setMockBirthdays([]);

            await commandService.handleListBirthdays(mockChatId);

            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('No birthdays saved yet')
            );
        });

        test('should display N/A for missing phone numbers', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', type: 'generated' }
            ];
            configManager.setMockBirthdays(mockBirthdays);

            await commandService.handleListBirthdays(mockChatId);

            const message = mockWhatsappService.sendMessage.mock.calls[0][1];
            expect(message).toContain('N/A');
        });
    });

    describe('handleSetCron', () => {
        test('should update cron schedule successfully', async () => {
            const mockConfig = { cronSchedule: '0 8 * * *' };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

            const args = ['--schedule', '0 12 * * *'];
            await commandService.handleSetCron(args, mockChatId);

            expect(cron.validate).toHaveBeenCalledWith('0 12 * * *');
            expect(fs.writeFileSync).toHaveBeenCalled();
            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.cronSchedule).toBe('0 12 * * *');
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Cron schedule updated')
            );
        });

        test('should handle quoted schedule strings', async () => {
            const mockConfig = { cronSchedule: '0 8 * * *' };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

            const args = ['--schedule', '"0', '12', '*', '*', '*"'];
            await commandService.handleSetCron(args, mockChatId);

            const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
            expect(savedConfig.cronSchedule).toBe('0 12 * * *');
        });

        test('should validate cron expression', async () => {
            cron.validate.mockReturnValue(false);

            const args = ['--schedule', 'invalid'];
            await commandService.handleSetCron(args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Invalid cron schedule')
            );
        });

        test('should require schedule parameter', async () => {
            const args = [];
            await commandService.handleSetCron(args, mockChatId);

            expect(fs.writeFileSync).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Usage:')
            );
        });
    });

    describe('handleActivate', () => {
        test('should activate birthday checker successfully', async () => {
            commandService.botActive = false;

            await commandService.handleActivate(mockChatId);

            expect(mockBirthdayService.startBirthdayChecker).toHaveBeenCalled();
            expect(commandService.botActive).toBe(true);
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('activated successfully')
            );
            expect(logger.info).toHaveBeenCalledWith('Birthday checker activated via command');
        });

        test('should handle already active bot', async () => {
            commandService.botActive = true;

            await commandService.handleActivate(mockChatId);

            expect(mockBirthdayService.startBirthdayChecker).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('already active')
            );
        });

        test('should handle activation error', async () => {
            commandService.botActive = false;
            mockBirthdayService.startBirthdayChecker.mockImplementation(() => {
                throw new Error('Activation failed');
            });

            await commandService.handleActivate(mockChatId);

            expect(commandService.botActive).toBe(false);
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Failed to activate bot')
            );
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('handleDeactivate', () => {
        test('should deactivate birthday checker successfully', async () => {
            commandService.botActive = true;

            await commandService.handleDeactivate(mockChatId);

            expect(mockBirthdayService.stopBirthdayChecker).toHaveBeenCalled();
            expect(commandService.botActive).toBe(false);
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('deactivated successfully')
            );
            expect(logger.info).toHaveBeenCalledWith('Birthday checker deactivated via command');
        });

        test('should handle already inactive bot', async () => {
            commandService.botActive = false;

            await commandService.handleDeactivate(mockChatId);

            expect(mockBirthdayService.stopBirthdayChecker).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('already inactive')
            );
        });
    });

    describe('handleStatus', () => {
        test('should display correct status information', async () => {
            commandService.botActive = true;
            const mockConfig = {
                cronSchedule: '0 8 * * *',
                timezone: 'Europe/Berlin',
                yourPhoneNumber: '+1234567890',
                botOwner: 'TestOwner',
                openaiApiKey: 'test-key'
            };
            configManager.setMockConfig(mockConfig);

            await commandService.handleStatus(mockChatId);

            const message = mockWhatsappService.sendMessage.mock.calls[0][1];
            expect(message).toContain('Bot Status');
            expect(message).toContain('Active');
            expect(message).toContain('0 8 * * *');
            expect(message).toContain('Europe/Berlin');
            expect(message).toContain('+1234567890');
            expect(message).toContain('TestOwner');
            expect(message).toContain('Configured');
        });

        test('should show inactive status', async () => {
            commandService.botActive = false;

            await commandService.handleStatus(mockChatId);

            const message = mockWhatsappService.sendMessage.mock.calls[0][1];
            expect(message).toContain('Inactive');
        });

        test('should handle missing configuration values', async () => {
            const emptyConfig = {
                cronSchedule: '',
                timezone: '',
                yourPhoneNumber: '',
                botOwner: '',
                openaiApiKey: ''
            };
            configManager.setMockConfig(emptyConfig);
            configManager.setMockBirthdays([]);

            await commandService.handleStatus(mockChatId);

            const message = mockWhatsappService.sendMessage.mock.calls[0][1];
            expect(message).toContain('Not set');
            expect(message).toContain('Not configured');
        });
    });

    describe('handleTriggerBirthday', () => {
        test('should trigger birthday message successfully', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ];
            configManager.setMockBirthdays(mockBirthdays);
            mockBirthdayService.handleBirthday = jest.fn().mockResolvedValue();

            const args = ['--n', 'John'];
            await commandService.handleTriggerBirthday(args, mockChatId);

            expect(mockBirthdayService.handleBirthday).toHaveBeenCalledWith(
                mockBirthdays[0],
                expect.any(Object),
                expect.any(Number)
            );
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Birthday message triggered successfully')
            );
            expect(logger.info).toHaveBeenCalledWith('Manually triggered birthday message for John');
        });

        test('should handle case-insensitive name matching', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ];
            configManager.setMockBirthdays(mockBirthdays);
            mockBirthdayService.handleBirthday = jest.fn().mockResolvedValue();

            const args = ['--n', 'JOHN'];
            await commandService.handleTriggerBirthday(args, mockChatId);

            expect(mockBirthdayService.handleBirthday).toHaveBeenCalled();
        });

        test('should fail when person not found', async () => {
            const mockBirthdays = [
                { name: 'Jane', date: '20-06', phone: '+4999999', type: 'personal' }
            ];
            configManager.setMockBirthdays(mockBirthdays);
            mockBirthdayService.handleBirthday = jest.fn();

            const args = ['--n', 'John'];
            await commandService.handleTriggerBirthday(args, mockChatId);

            expect(mockBirthdayService.handleBirthday).not.toHaveBeenCalled();
            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('not found')
            );
        });

        test('should require name parameter', async () => {
            const args = [];
            await commandService.handleTriggerBirthday(args, mockChatId);

            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Usage:')
            );
        });

        test('should handle errors from handleBirthday when not defined', async () => {
            configManager.setMockBirthdays([
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ]);
            // handleBirthday not defined on mockBirthdayService — triggers error

            const args = ['--n', 'John'];
            await commandService.handleTriggerBirthday(args, mockChatId);

            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Failed to send birthday message')
            );
            expect(logger.error).toHaveBeenCalled();
        });

        test('should handle birthday sending errors', async () => {
            const mockBirthdays = [
                { name: 'John', date: '15-03', phone: '+4912345', type: 'generated' }
            ];
            configManager.setMockBirthdays(mockBirthdays);
            mockBirthdayService.handleBirthday = jest.fn().mockRejectedValue(new Error('Send error'));

            const args = ['--n', 'John'];
            await commandService.handleTriggerBirthday(args, mockChatId);

            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Failed to send birthday message')
            );
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('handleCommand', () => {
        test('should route to correct handler for each command', async () => {
            const commandTests = [
                ['help', 'handleHelp', []],
                ['addBday', 'handleAddOrEditBirthday', ['addBday', []]],
                ['editBday', 'handleAddOrEditBirthday', ['editBday', []]],
                ['removeBday', 'handleRemoveBirthday', [[]]],
                ['listBdays', 'handleListBirthdays', []],
                ['setCron', 'handleSetCron', [[]]],
                ['activate', 'handleActivate', []],
                ['deactivate', 'handleDeactivate', []],
                ['status', 'handleStatus', []],
                ['triggerBday', 'handleTriggerBirthday', [[]]]
            ];

            for (const [cmd, handler, expectedArgs] of commandTests) {
                jest.clearAllMocks();
                const spy = jest.spyOn(commandService, handler).mockResolvedValue();
                
                await commandService.handleCommand(cmd, mockChatId);
                
                expect(spy).toHaveBeenCalled();
                spy.mockRestore();
            }
        });

        test('should handle unknown command', async () => {
            await commandService.handleCommand('unknownCommand', mockChatId);

            expect(mockWhatsappService.sendMessage).toHaveBeenCalledWith(
                mockChatId,
                expect.stringContaining('Unknown command')
            );
        });
    });
});
