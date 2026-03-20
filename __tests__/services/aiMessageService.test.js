const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

mock.module('openai', () => require('../__mocks__/openai'));
mock.module('../../src/config/configManager', () => require('../__mocks__/configManager'));

const OpenAI = require('openai');
const logger = require('../../src/utils/logger');
const configManager = require('../../src/config/configManager');
const AIMessageService = require('../../src/services/aiMessageService');

describe('AIMessageService', () => {
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        spyOn(logger, 'info').mockImplementation(() => {});
        spyOn(logger, 'warn').mockImplementation(() => {});
        spyOn(logger, 'error').mockImplementation(() => {});
        spyOn(logger, 'debug').mockImplementation(() => {});
        configManager.resetMocks();
        // Reset singleton state so each test can re-initialize with different config
        AIMessageService.openai = null;
    });

    afterEach(() => {
        mock.restore();
    });

    describe('initialization', () => {
        test('should initialize OpenAI service when API key is provided', () => {
            const configWithKey = { openaiApiKey: 'test-api-key-123' };
            configManager.setMockConfig(configWithKey);
            
            AIMessageService.initialize();
            
            expect(AIMessageService.openai).toBeDefined();
        });

        test('should properly handle configuration without API key', () => {
            const configWithoutKey = { openaiApiKey: '' };
            configManager.setMockConfig(configWithoutKey);
            
            AIMessageService.initialize();
            
            // Since it's a singleton and may have been initialized already,
            // we test the behavior rather than the internal state
            expect(AIMessageService).toBeDefined();
            expect(logger.warn).toHaveBeenCalledWith('OpenAI not configured, will use default messages');
        });

        test('should handle undefined API key in configuration', () => {
            const configWithUndefinedKey = {};
            configManager.setMockConfig(configWithUndefinedKey);
            
            AIMessageService.initialize();
            
            // Test that the service can be initialized without crashing
            expect(AIMessageService).toBeDefined();
        });
    });

    describe('generateBirthdayMessage', () => {
        describe('with OpenAI configured', () => {
            beforeEach(() => {
                configManager.setMockConfig({ openaiApiKey: 'test-key' });
                AIMessageService.initialize();
                // Directly mock the openai instance (bypasses constructor mock interception issues)
                AIMessageService.openai = {
                    chat: {
                        completions: {
                            create: jest.fn().mockResolvedValue({
                                choices: [{ message: { content: "Wieder ein Jahr \u00e4lter und immer noch genauso ver\u00fcckt! \uD83D\uDE04" } }]
                            })
                        }
                    }
                };
            });

            test('should generate AI birthday message successfully', async () => {
                const testName = 'Max';
                const customAIResponse = 'Ein weiteres Jahr voller Abenteuer wartet auf dich!';
                
                // Mock the chat.completions.create method on the existing instance
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: customAIResponse } }]
                });

                const result = await AIMessageService.generateBirthdayMessage(testName);

                expect(result).toContain(`🎉 Alles Gute zum Geburtstag, ${testName}! 🎂`);
                expect(result).toContain(customAIResponse);
                expect(result).toContain('_gesendet von John total persönlichem Geburtstags Bot_');
            });

            test('should use configured bot owner name in signature', async () => {
                const testName = 'Max';
                const customOwner = 'CustomOwner';
                configManager.setMockConfig({ openaiApiKey: 'test-key', botOwner: customOwner });
                
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: 'Test content' } }]
                });

                const result = await AIMessageService.generateBirthdayMessage(testName);

                expect(result).toContain(`_gesendet von ${customOwner} total persönlichem Geburtstags Bot_`);
            });

            test('should call OpenAI API with correct parameters', async () => {
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: 'Test response' } }]
                });

                await AIMessageService.generateBirthdayMessage('Anna');

                expect(AIMessageService.openai.chat.completions.create).toHaveBeenCalledWith({
                    model: "gpt-3.5-turbo",
                    max_tokens: 150,
                    temperature: 0.9,
                    messages: expect.arrayContaining([
                        expect.objectContaining({ role: 'system' }),
                        expect.objectContaining({ role: 'user' })
                    ])
                });
            });

            test('should generate age-focused message with generated_age type', async () => {
                const testName = 'OldTimer';
                const ageRoastResponse = 'Herzlichen Glückwunsch zum Fossil-Status! Du bist jetzt offiziell älter als die meisten Saurier.';
                
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: ageRoastResponse } }]
                });

                const result = await AIMessageService.generateBirthdayMessage(testName, 'generated_age');

                expect(result).toContain(`🎉 Alles Gute zum Geburtstag, ${testName}! 🎂`);
                expect(result).toContain(ageRoastResponse);
                expect(logger.info).toHaveBeenCalledWith(`Generated AI message (generated_age) for ${testName}`);
            });

            test('should use age-specific prompt for generated_age type', async () => {
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: 'Test response' } }]
                });

                await AIMessageService.generateBirthdayMessage('Hans', 'generated_age');

                const callArgs = AIMessageService.openai.chat.completions.create.mock.calls[0][0];
                const systemMessage = callArgs.messages[0].content;
                const userMessage = callArgs.messages[1].content;
                
                expect(systemMessage).toContain('frecher und humorvoller');
                expect(systemMessage).toContain('Alterswitze');
                expect(userMessage).toContain('Alter lustig macht');
                expect(userMessage).toContain('Sarkasmus');
            });

            test('should default to generated type when invalid type provided', async () => {
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: 'Default response' } }]
                });

                await AIMessageService.generateBirthdayMessage('Test', 'invalid_type');

                const callArgs = AIMessageService.openai.chat.completions.create.mock.calls[0][0];
                const systemMessage = callArgs.messages[0].content;
                
                // Should use the default 'generated' prompt
                expect(systemMessage).toContain('witziger und lustiger');
            });

            test('should use German system prompt', async () => {
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: 'Test response' } }]
                });

                await AIMessageService.generateBirthdayMessage('Klaus');

                const callArgs = AIMessageService.openai.chat.completions.create.mock.calls[0][0];
                const systemMessage = callArgs.messages[0].content;
                
                expect(systemMessage).toContain('auf Deutsch');
                expect(systemMessage).toContain('witziger und lustiger');
                expect(systemMessage).toContain('niemals zu gemein oder verletzend');
            });

            test('should handle OpenAI API errors gracefully', async () => {
                const testName = 'ErrorTest';
                const apiError = new Error('OpenAI API Error');
                
                AIMessageService.openai.chat.completions.create.mockRejectedValueOnce(apiError);

                const result = await AIMessageService.generateBirthdayMessage(testName);

                expect(result).toContain(`🎉 Alles Gute zum Geburtstag, ${testName}! 🎂`);
                expect(result).toContain('Hab einen wundervollen Tag voller Freude und Lachen!');
                expect(result).toContain('_gesendet von John total persönlichem Geburtstags Bot_');
            });

            test('should trim whitespace from AI response', async () => {
                const testName = 'TrimTest';
                const aiResponseWithWhitespace = '   Wieder ein Jahr älter geworden!   \n\n  ';
                
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: aiResponseWithWhitespace } }]
                });

                const result = await AIMessageService.generateBirthdayMessage(testName);

                expect(result).toContain('Wieder ein Jahr älter geworden!');
                expect(result).not.toContain('   Wieder ein Jahr älter geworden!   ');
            });

            test('should handle empty AI response', async () => {
                const testName = 'EmptyTest';
                
                AIMessageService.openai.chat.completions.create.mockResolvedValueOnce({
                    choices: [{ message: { content: '' } }]
                });

                const result = await AIMessageService.generateBirthdayMessage(testName);

                // Should still format properly even with empty AI content
                expect(result).toContain(`🎉 Alles Gute zum Geburtstag, ${testName}! 🎂`);
                expect(result).toContain('_gesendet von John total persönlichem Geburtstags Bot_');
            });
        });

        describe('without OpenAI configured', () => {
            beforeEach(() => {
                configManager.setMockConfig({ openaiApiKey: '' });
                AIMessageService.initialize();
            });

            test('should use default message when OpenAI not configured', async () => {
                const testName = 'DefaultTest';

                const result = await AIMessageService.generateBirthdayMessage(testName);

                expect(result).toContain(`🎉 Alles Gute zum Geburtstag, ${testName}! 🎂`);
                expect(result).toContain('_gesendet von John total persönlichem Geburtstags Bot_');
                // Should contain some form of birthday message
                expect(result.length).toBeGreaterThan(100);
                expect(logger.info).toHaveBeenCalledWith('OpenAI not configured, using default message');
            });

            test('should not attempt to call OpenAI API', async () => {
                await AIMessageService.generateBirthdayMessage('NoAPITest');

                // openai should be null when no API key is configured
                expect(AIMessageService.openai).toBeNull();
            });
        });
    });

    describe('generatePersonalReminderMessage', () => {
        beforeEach(() => {
            configManager.setMockConfig({ openaiApiKey: 'test-key' });
            AIMessageService.initialize();
            // Directly mock the openai instance
            AIMessageService.openai = {
                chat: { completions: { create: jest.fn().mockResolvedValue({
                    choices: [{ message: { content: 'default response' } }]
                }) } }
            };
        });

        test('should generate personal reminder message', async () => {
            const testName = 'PersonalTest';

            const result = await AIMessageService.generatePersonalReminderMessage(testName);

            expect(result).toBe(`🎂 *Persönliche Geburtstags-Erinnerung*\n\n${testName} hat heute Geburtstag! Du wolltest das persönlich handhaben.\n\n _gesendet von John total persönlichem Geburtstags Bot_`);
        });

        test('should work with different names', async () => {
            const names = ['Maria', 'Hans', 'Petra'];

            for (const name of names) {
                const result = await AIMessageService.generatePersonalReminderMessage(name);
                expect(result).toContain(name);
                expect(result).toContain('hat heute Geburtstag!');
            }
        });

        test('should not call OpenAI API for personal reminders', async () => {
            // Personal reminders don't use the chat.completions.create endpoint
            const createMock = AIMessageService.openai.chat.completions.create;
            await AIMessageService.generatePersonalReminderMessage('TestName');
            await AIMessageService.generatePersonalReminderMessage('TestName2');
            expect(createMock).not.toHaveBeenCalled();
        });
    });

    describe('generateTestMessage', () => {
        beforeEach(() => {
            configManager.setMockConfig({ openaiApiKey: 'test-key' });
            AIMessageService.initialize();
            // Directly mock the openai instance
            AIMessageService.openai = {
                chat: { completions: { create: jest.fn().mockResolvedValue({
                    choices: [{ message: { content: 'default response' } }]
                }) } }
            };
        });

        test('should generate test message with timestamp', async () => {
            // Mock Date to have predictable output
            const mockDate = new Date('2025-10-07T14:30:00.000Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
            
            // Mock toLocaleString to return predictable German format
            mockDate.toLocaleString = jest.fn().mockReturnValue('07.10.2025, 16:30');

            const result = await AIMessageService.generateTestMessage();

            expect(result).toContain('🤖 *Bot Gestartet*');
            expect(result).toContain('Dein Geburtstags-Bot ist erfolgreich gestartet!');
            expect(result).toContain('Startzeit: 07.10.2025, 16:30');
            expect(result).toContain('_gesendet von John total persönlichem Geburtstags Bot_');

            // Verify toLocaleString was called with correct parameters
            expect(mockDate.toLocaleString).toHaveBeenCalledWith('de-DE', {
                timeZone: 'Europe/Berlin',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Restore Date
            global.Date.mockRestore();
        });

        test('should not call OpenAI API for test messages', async () => {
            // Test messages don't use the chat.completions.create endpoint
            const createMock = AIMessageService.openai.chat.completions.create;
            createMock.mockClear();

            await AIMessageService.generateTestMessage();

            expect(createMock).not.toHaveBeenCalled();
        });

        test('should use German timezone formatting', async () => {
            const mockDate = new Date();
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
            mockDate.toLocaleString = jest.fn().mockReturnValue('01.01.2025, 12:00');

            await AIMessageService.generateTestMessage();

            expect(mockDate.toLocaleString).toHaveBeenCalledWith('de-DE', expect.objectContaining({
                timeZone: 'Europe/Berlin'
            }));

            global.Date.mockRestore();
        });
    });

    describe('error handling and edge cases', () => {
        beforeEach(() => {
            configManager.setMockConfig({ openaiApiKey: '' });
            AIMessageService.initialize();
        });

        test('should handle special characters in names', async () => {
            const specialNames = ['Müller', 'José', 'François', 'Øystein'];
            // Inner beforeEach already initialized with openaiApiKey: '' (uses default messages)

            for (const name of specialNames) {
                const result = await AIMessageService.generateBirthdayMessage(name);
                expect(result).toContain(name);
                expect(result).toContain('🎉 Alles Gute zum Geburtstag');
            }
        });
    });

    describe('message format consistency', () => {
        beforeEach(() => {
            configManager.setMockConfig({ openaiApiKey: '' });
            AIMessageService.initialize();
        });

        test('all message types should end with bot signature', async () => {
            const signature = '_gesendet von John total persönlichem Geburtstags Bot_';
            
            const birthdayMsg = await AIMessageService.generateBirthdayMessage('Test');
            const personalMsg = await AIMessageService.generatePersonalReminderMessage('Test');
            const testMsg = await AIMessageService.generateTestMessage();

            expect(birthdayMsg).toContain(signature);
            expect(personalMsg).toContain(signature);
            expect(testMsg).toContain(signature);
        });

        test('birthday messages should always contain birthday greeting', async () => {
            // Inner beforeEach already initialized with openaiApiKey: ''
            const result = await AIMessageService.generateBirthdayMessage('GreetingTest');

            expect(result).toContain('🎉 Alles Gute zum Geburtstag, GreetingTest! 🎂');
        });

        test('personal reminders should contain reminder keywords', async () => {
            const result = await AIMessageService.generatePersonalReminderMessage('ReminderTest');

            expect(result).toContain('*Persönliche Geburtstags-Erinnerung*');
            expect(result).toContain('hat heute Geburtstag!');
            expect(result).toContain('persönlich handhaben');
        });
    });
});