const moment = require('moment-timezone');

// Mock external modules
jest.mock('moment-timezone');
jest.mock('node-cron');
jest.mock('cron-parser');
jest.mock('fs');

// Mock our internal services using the mock files
jest.mock('../../src/utils/logger', () => require('../__mocks__/logger'));
jest.mock('../../src/config/configManager', () => require('../__mocks__/configManager'));
jest.mock('../../src/services/whatsappService', () => require('../__mocks__/whatsappService'));
jest.mock('../../src/services/aiMessageService', () => require('../__mocks__/aiMessageService'));
jest.mock('../../src/services/historyService', () => ({
    hasSentMessage: jest.fn().mockReturnValue(false),
    markAsSent: jest.fn(),
    loadHistory: jest.fn(),
    saveHistory: jest.fn()
}));

const cron = require('node-cron');
const parser = require('cron-parser');
const fs = require('fs');
const logger = require('../../src/utils/logger');
const configManager = require('../../src/config/configManager');
const whatsappService = require('../../src/services/whatsappService');
const aiMessageService = require('../../src/services/aiMessageService');
const historyService = require('../../src/services/historyService');

// Import the service after mocking dependencies
const BirthdayService = require('../../src/services/birthdayService');

describe('BirthdayService', () => {
    let mockCronJob;
    let mockMoment;
    let mockInterval;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        logger.resetMocks();
        configManager.resetMocks();
        whatsappService.resetMocks();
        aiMessageService.resetMocks();
        
        // Reset historyService mock implementation
        historyService.hasSentMessage.mockReturnValue(false);

        // Reset service state
        BirthdayService.stopBirthdayChecker();

        // Setup moment mock with proper cloning behavior
        mockMoment = {
            tz: jest.fn().mockReturnThis(),
            date: jest.fn().mockReturnValue(7),
            month: jest.fn().mockReturnValue(9), // October (0-based)
            year: jest.fn().mockReturnValue(2025),
            format: jest.fn((format) => {
                if (format === 'DD-MM') return '07-10';
                if (format === 'YYYY-MM-DD') return '2025-10-07';
                if (format === 'dddd, MMMM Do YYYY, h:mm A') return 'Tuesday, October 8th 2025, 8:00 AM';
                return '2025-10-07';
            }),
            clone: jest.fn(() => {
                // Return a new mock object for clone to allow independent manipulation
                const cloned = {
                    ...mockMoment,
                    add: jest.fn().mockReturnThis(),
                    date: jest.fn().mockReturnValue(8), // Next day for testing
                    month: jest.fn().mockReturnValue(9),
                    format: jest.fn((format) => {
                        if (format === 'DD-MM') return '08-10';
                        if (format === 'YYYY-MM-DD') return '2025-10-08';
                        return '2025-10-08';
                    })
                };
                return cloned;
            }),
            add: jest.fn().mockReturnThis(),
            hour: jest.fn().mockReturnThis(),
            minute: jest.fn().mockReturnThis(),
            second: jest.fn().mockReturnThis(),
            isSameOrBefore: jest.fn().mockReturnValue(false)
        };

        moment.mockReturnValue(mockMoment);
        moment.tz = jest.fn().mockReturnValue(mockMoment);

        // Setup cron mock
        mockCronJob = {
            stop: jest.fn(),
            destroy: jest.fn()
        };
        cron.schedule = jest.fn().mockReturnValue(mockCronJob);

        // Setup parser mock
        const mockParserInterval = {
            next: jest.fn().mockReturnValue({
                toDate: jest.fn().mockReturnValue(new Date('2025-10-08T08:00:00Z'))
            })
        };
        parser.CronExpressionParser = {
            parse: jest.fn().mockReturnValue(mockParserInterval)
        };

        // Setup interval mock
        mockInterval = {};
        global.setInterval = jest.fn().mockReturnValue(mockInterval);
        global.clearInterval = jest.fn();
    });

    afterEach(() => {
        BirthdayService.stopBirthdayChecker();
    });

    describe('startBirthdayChecker', () => {
        test('should start the birthday checker with default config', () => {
            BirthdayService.startBirthdayChecker();

            expect(cron.schedule).toHaveBeenCalledWith(
                '0 8 * * *',
                expect.any(Function),
                {
                    scheduled: true,
                    timezone: 'Europe/Berlin'
                }
            );
            expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
            expect(logger.info).toHaveBeenCalledWith('Birthday checker started with dynamic config reloading');
        });

        test('should use custom config when provided', () => {
            const customConfig = {
                cronSchedule: '0 10 * * *',
                timezone: 'America/New_York'
            };
            configManager.setMockConfig(customConfig);

            BirthdayService.startBirthdayChecker();

            expect(cron.schedule).toHaveBeenCalledWith(
                '0 10 * * *',
                expect.any(Function),
                {
                    scheduled: true,
                    timezone: 'America/New_York'
                }
            );
        });

        test('should warn about empty or malformed birthdays.json', () => {
            configManager.setMockBirthdays([]);
            
            BirthdayService.startBirthdayChecker();
            
            // Trigger the interval function
            const intervalCallback = global.setInterval.mock.calls[0][0];
            intervalCallback();

            expect(logger.warn).toHaveBeenCalledWith('Please check birthdays.json, it is either malformed or empty.');
        });
    });

    describe('stopBirthdayChecker', () => {
        test('should stop cron job and clear interval', () => {
            BirthdayService.startBirthdayChecker();
            BirthdayService.stopBirthdayChecker();

            expect(mockCronJob.stop).toHaveBeenCalled();
            expect(mockCronJob.destroy).toHaveBeenCalled();
            expect(global.clearInterval).toHaveBeenCalledWith(mockInterval);
            expect(logger.info).toHaveBeenCalledWith('Birthday checker stopped');
        });

        test('should handle stopping when no job exists', () => {
            BirthdayService.stopBirthdayChecker();
            expect(logger.info).toHaveBeenCalledWith('Birthday checker stopped');
        });
    });

    describe('updateCronSchedule', () => {
        test('should create new cron job with updated schedule', () => {
            const newConfig = {
                cronSchedule: '0 9 * * *',
                timezone: 'UTC'
            };
            configManager.setMockConfig(newConfig);

            BirthdayService.updateCronSchedule();

            expect(cron.schedule).toHaveBeenCalledWith(
                '0 9 * * *',
                expect.any(Function),
                {
                    scheduled: true,
                    timezone: 'UTC'
                }
            );
        });

        test('should stop existing job before creating new one', () => {
            BirthdayService.startBirthdayChecker();
            
            const newConfig = {
                cronSchedule: '0 12 * * *',
                timezone: 'UTC'
            };
            configManager.setMockConfig(newConfig);

            BirthdayService.updateCronSchedule();

            expect(mockCronJob.stop).toHaveBeenCalled();
            expect(mockCronJob.destroy).toHaveBeenCalled();
            expect(cron.schedule).toHaveBeenCalledTimes(2); // Once for start, once for update
        });
    });

    describe('checkForScheduleChanges', () => {
        test('should update schedule when changed', () => {
            // Reset config to default first
            configManager.setMockConfig({ cronSchedule: '0 8 * * *', timezone: 'Europe/Berlin' });
            BirthdayService.startBirthdayChecker();
            
            // Clear previous calls to logger
            logger.resetMocks();
            
            // Change the config
            configManager.setMockConfig({ cronSchedule: '0 10 * * *', timezone: 'Europe/Berlin' });
            
            BirthdayService.checkForScheduleChanges();

            expect(logger.info).toHaveBeenCalledWith(
                'Cron schedule changed from "0 8 * * *" to "0 10 * * *". Updating...'
            );
        });

        test('should not update when schedule unchanged', () => {
            BirthdayService.startBirthdayChecker();
            const initialCallCount = cron.schedule.mock.calls.length;
            
            BirthdayService.checkForScheduleChanges();

            expect(cron.schedule).toHaveBeenCalledTimes(initialCallCount);
        });
    });

    describe('checkForBirthdays', () => {
        test('should find and handle birthday on correct date', async () => {
            const birthdayPerson = {
                name: 'John Doe',
                date: '07-10',
                phone: '+1111111111',
                personal: false
            };
            configManager.setMockBirthdays([birthdayPerson]);
            // Ensure the config has the correct timezone
            configManager.setMockConfig({ timezone: 'Europe/Berlin' });

            await BirthdayService.checkForBirthdays();

            expect(logger.info).toHaveBeenCalledWith('Checking for birthdays on 07-10 (Europe/Berlin)...');
            expect(logger.info).toHaveBeenCalledWith('Found birthday: John Doe');
            expect(aiMessageService.generateBirthdayMessage).toHaveBeenCalledWith('John Doe');
            expect(whatsappService.sendMessage).toHaveBeenCalledWith('+1111111111', expect.any(String));
            expect(historyService.markAsSent).toHaveBeenCalledWith('John Doe', 2025, 'birthday_message');
        });

        test('should skip if message already sent for this year', async () => {
            const birthdayPerson = {
                name: 'John Doe',
                date: '07-10',
                phone: '+1111111111',
                personal: false
            };
            configManager.setMockBirthdays([birthdayPerson]);
            historyService.hasSentMessage.mockReturnValue(true);
            
            await BirthdayService.checkForBirthdays();

            expect(logger.info).toHaveBeenCalledWith('Already sent birthday message to John Doe for year 2025. Skipping.');
            expect(aiMessageService.generateBirthdayMessage).not.toHaveBeenCalled();
            expect(whatsappService.sendMessage).not.toHaveBeenCalled();
        });

        test('should handle personal birthdays correctly', async () => {
            const personalBirthday = {
                name: 'Jane Smith',
                date: '07-10',
                phone: '+2222222222',
                personal: true
            };
            configManager.setMockBirthdays([personalBirthday]);

            await BirthdayService.checkForBirthdays();

            expect(aiMessageService.generatePersonalReminderMessage).toHaveBeenCalledWith('Jane Smith');
            expect(whatsappService.sendMessage).toHaveBeenCalledWith('+1234567890', expect.any(String));
            expect(historyService.markAsSent).toHaveBeenCalledWith('Jane Smith', 2025, 'personal_reminder');
        });

        test('should skip birthdays not matching today', async () => {
            const tomorrowBirthday = {
                name: 'Tomorrow Person',
                date: '08-10',
                phone: '+3333333333',
                personal: false
            };
            configManager.setMockBirthdays([tomorrowBirthday]);

            await BirthdayService.checkForBirthdays();

            expect(logger.info).not.toHaveBeenCalledWith('Found birthday: Tomorrow Person');
            expect(aiMessageService.generateBirthdayMessage).not.toHaveBeenCalled();
            expect(whatsappService.sendMessage).not.toHaveBeenCalled();
        });

        test('should handle errors during birthday processing', async () => {
            const birthdayPerson = {
                name: 'Error Person',
                date: '07-10',
                phone: '+4444444444',
                personal: false
            };
            configManager.setMockBirthdays([birthdayPerson]);
            whatsappService.simulateError();

            await BirthdayService.checkForBirthdays();

            expect(logger.error).toHaveBeenCalledWith(
                'Error handling birthday for Error Person',
                expect.any(Error)
            );
            expect(logger.info).toHaveBeenCalledWith(
                "Make sure Error Person's number (+4444444444) is saved in your WhatsApp contacts"
            );
        });

        test('should warn when personal birthday has no yourPhoneNumber configured', async () => {
            const personalBirthday = {
                name: 'Personal No Phone',
                date: '07-10',
                phone: '+5555555555',
                personal: true
            };
            configManager.setMockBirthdays([personalBirthday]);
            configManager.setMockConfig({ yourPhoneNumber: '' });

            await BirthdayService.checkForBirthdays();

            expect(logger.warn).toHaveBeenCalledWith(
                'Personal birthday for Personal No Phone but yourPhoneNumber not configured'
            );
        });

        test('should warn when person has no phone number', async () => {
            const noPhonePerson = {
                name: 'No Phone Person',
                date: '07-10',
                personal: false
            };
            configManager.setMockBirthdays([noPhonePerson]);

            await BirthdayService.checkForBirthdays();

            expect(logger.warn).toHaveBeenCalledWith(
                'No phone number for No Phone Person, cannot send message'
            );
        });
    });

    describe('handleBirthday', () => {
        const mockConfig = {
            yourPhoneNumber: '+1234567890'
        };

        test('should handle personal birthday correctly', async () => {
            const person = { name: 'Jane', personal: true };
            const year = 2025;
            
            await BirthdayService.handleBirthday(person, mockConfig, year);

            expect(aiMessageService.generatePersonalReminderMessage).toHaveBeenCalledWith('Jane');
            expect(whatsappService.sendMessage).toHaveBeenCalledWith(
                '+1234567890',
                "Reminder: It's Jane's birthday today! Don't forget to wish them well."
            );
            expect(logger.info).toHaveBeenCalledWith('Sent personal reminder for Jane to you');
            expect(historyService.markAsSent).toHaveBeenCalledWith('Jane', 2025, 'personal_reminder');
        });

        test('should handle regular birthday correctly', async () => {
            const person = { name: 'John', phone: '+1111111111', personal: false };
            const year = 2025;
            
            await BirthdayService.handleBirthday(person, mockConfig, year);

            expect(aiMessageService.generateBirthdayMessage).toHaveBeenCalledWith('John');
            expect(whatsappService.sendMessage).toHaveBeenCalledWith(
                '+1111111111',
                'Happy Birthday John! 🎉 Wishing you all the best on your special day!'
            );
            expect(logger.info).toHaveBeenCalledWith('Sent AI birthday message to John at +1111111111');
            expect(historyService.markAsSent).toHaveBeenCalledWith('John', 2025, 'birthday_message');
        });

        test('should send minion image when available', async () => {
            const person = { name: 'Minion Fan', phone: '+12345', personal: false };
            const year = 2025;
            
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['minion1.jpg', 'minion2.png', 'not-image.txt']);
            
            await BirthdayService.handleBirthday(person, mockConfig, year);
            
            expect(whatsappService.sendImage).toHaveBeenCalledWith(
                '+12345',
                expect.stringMatching(/minions.(minion1\.jpg|minion2\.png)$/)
            );
            expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Sent minion image/));
        });

        test('should warn when minions folder is empty', async () => {
            const person = { name: 'No Minion Fan', phone: '+12345', personal: false };
            const year = 2025;
            
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['not-image.txt']);
            
            await BirthdayService.handleBirthday(person, mockConfig, year);
            
            expect(whatsappService.sendImage).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith('No images found in minions folder');
        });

        test('should warn when minions folder does not exist', async () => {
            const person = { name: 'No Folder Fan', phone: '+12345', personal: false };
            const year = 2025;
            
            fs.existsSync.mockReturnValue(false);
            
            await BirthdayService.handleBirthday(person, mockConfig, year);
            
            expect(whatsappService.sendImage).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith('Minions folder not found');
        });
    });

    describe('getUpcomingBirthdays', () => {
        test('should return upcoming birthdays within specified days', () => {
            const birthdays = [
                { name: 'Today Person', date: '07-10' },
                { name: 'Tomorrow Person', date: '08-10' },
                { name: 'Day After Person', date: '09-10' },
                { name: 'Next Week Person', date: '14-10' }
            ];
            configManager.setMockBirthdays(birthdays);

            // Mock moment to return different dates for each iteration
            let dayCounter = 0;
            const originalMoment = moment;
            moment.mockImplementation(() => ({
                tz: function() { return this; },
                clone: () => ({
                    add: (days) => ({
                        date: () => 7 + days,
                        month: () => 9, // October (0-based)
                        format: (format) => {
                            const day = 7 + days;
                            if (format === 'DD-MM') return `${day.toString().padStart(2, '0')}-10`;
                            if (format === 'YYYY-MM-DD') return `2025-10-${day.toString().padStart(2, '0')}`;
                            return `2025-10-${day.toString().padStart(2, '0')}`;
                        }
                    })
                })
            }));

            const upcoming = BirthdayService.getUpcomingBirthdays(3);

            expect(upcoming).toHaveLength(3);
            expect(upcoming[0].people).toEqual([{ name: 'Today Person', date: '07-10' }]);
            expect(upcoming[1].people).toEqual([{ name: 'Tomorrow Person', date: '08-10' }]);
            expect(upcoming[2].people).toEqual([{ name: 'Day After Person', date: '09-10' }]);
        });

        test('should return empty array when no upcoming birthdays', () => {
            configManager.setMockBirthdays([
                { name: 'Next Month Person', date: '07-11' }
            ]);

            // Mock moment for this test
            moment.mockImplementation(() => ({
                tz: function() { return this; },
                clone: () => ({
                    add: (days) => ({
                        date: () => 7 + days,
                        month: () => 9, // October (0-based)
                        format: (format) => {
                            const day = 7 + days;
                            if (format === 'DD-MM') return `${day.toString().padStart(2, '0')}-10`;
                            return `2025-10-${day.toString().padStart(2, '0')}`;
                        }
                    })
                })
            }));

            const upcoming = BirthdayService.getUpcomingBirthdays(7);

            expect(upcoming).toHaveLength(0);
        });

        test('should handle multiple people on same day', () => {
            const birthdays = [
                { name: 'Person A', date: '08-10' },
                { name: 'Person B', date: '08-10' }
            ];
            configManager.setMockBirthdays(birthdays);

            // Mock moment for this test
            moment.mockImplementation(() => ({
                tz: function() { return this; },
                clone: () => ({
                    add: (days) => ({
                        date: () => 7 + days,
                        month: () => 9, // October (0-based)
                        format: (format) => {
                            const day = 7 + days;
                            if (format === 'DD-MM') return `${day.toString().padStart(2, '0')}-10`;
                            if (format === 'YYYY-MM-DD') return `2025-10-${day.toString().padStart(2, '0')}`;
                            return `2025-10-${day.toString().padStart(2, '0')}`;
                        }
                    })
                })
            }));

            const upcoming = BirthdayService.getUpcomingBirthdays(7);

            expect(upcoming).toHaveLength(1);
            expect(upcoming[0].people).toHaveLength(2);
            expect(upcoming[0].people.map(p => p.name)).toContain('Person A');
            expect(upcoming[0].people.map(p => p.name)).toContain('Person B');
        });
    });

    describe('addBirthday', () => {
        test('should add birthday to the list', () => {
            const initialBirthdays = configManager.getBirthdays();
            const initialCount = initialBirthdays.length;

            BirthdayService.addBirthday('New Person', '15-10', '+9999999999', false);

            expect(logger.info).toHaveBeenCalledWith('Added birthday for New Person on 15-10');
            // Note: The actual adding to persistent storage would need configManager.save method
        });

        test('should add personal birthday', () => {
            BirthdayService.addBirthday('Personal Friend', '20-10', '+8888888888', true);

            expect(logger.info).toHaveBeenCalledWith('Added birthday for Personal Friend on 20-10');
        });
    });

    describe('logNextExecution', () => {
        test('should log next execution time for valid cron schedule', () => {
            BirthdayService.logNextExecution('0 8 * * *', 'Europe/Berlin');

            expect(parser.CronExpressionParser.parse).toHaveBeenCalledWith('0 8 * * *', { tz: 'Europe/Berlin' });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Birthday checker scheduled. Next check:'));
        });

        test('should log error when parser fails', () => {
            parser.CronExpressionParser.parse.mockImplementation(() => {
                throw new Error('Parser error');
            });

            BirthdayService.logNextExecution('invalid-cron', 'Europe/Berlin');

            expect(logger.info).toHaveBeenCalledWith(
                'Birthday checker scheduled with cron: invalid-cron (Europe/Berlin). Error: Parser error'
            );
        });
    });
});