const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

// Create moment mock at module scope
const moment = jest.fn();

// Patch require.cache directly so CJS require('moment') gets the mock function
// (mock.module creates an ESM namespace which CJS sees as Module object, not callable)
require('moment');
require.cache[require.resolve('moment')].exports = moment;

const fs = require('fs');
const path = require('path');

describe('Logger', () => {
    let Logger;
    let logger;
    
    const mockLogPath = '/mock/path/bot.log';
    const mockTimestamp = '2025-10-07 12:30:45';

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Spy on Node built-ins (mock.module does not intercept them)
        spyOn(path, 'join').mockReturnValue(mockLogPath);
        spyOn(fs, 'appendFileSync').mockImplementation(() => {});
        
        // Mock moment to return consistent timestamp
        const mockMoment = {
            format: jest.fn().mockReturnValue(mockTimestamp)
        };
        moment.mockReturnValue(mockMoment);

        // Mock console methods to avoid cluttering test output
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        
        // Re-require the module to get a fresh instance
        delete require.cache[require.resolve('../../src/utils/logger')];
        Logger = require('../../src/utils/logger');
        logger = Logger;
    });

    afterEach(() => {
        // Restore all spies (console, path, fs)
        mock.restore();
    });

    describe('constructor', () => {
        test('should set correct log file path', () => {
            expect(path.join).toHaveBeenCalledWith(expect.any(String), '../../bot.log');
        });
    });

    describe('log method', () => {
        test('should log message with default INFO level', () => {
            const testMessage = 'Test message';
            
            logger.log(testMessage);
            
            expect(moment).toHaveBeenCalled();
            expect(moment().format).toHaveBeenCalledWith('YYYY-MM-DD HH:mm:ss');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] ${testMessage}`);
            expect(fs.appendFileSync).toHaveBeenCalledWith(mockLogPath, `[${mockTimestamp}] [INFO] ${testMessage}\n`);
        });

        test('should log message with custom level', () => {
            const testMessage = 'Custom level message';
            const customLevel = 'CUSTOM';
            
            logger.log(testMessage, customLevel);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [${customLevel}] ${testMessage}`);
            expect(fs.appendFileSync).toHaveBeenCalledWith(mockLogPath, `[${mockTimestamp}] [${customLevel}] ${testMessage}\n`);
        });

        test('should handle file write errors gracefully', () => {
            const testMessage = 'Test message';
            const writeError = new Error('Write permission denied');
            
            fs.appendFileSync.mockImplementation(() => {
                throw writeError;
            });
            
            logger.log(testMessage);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] ${testMessage}`);
            expect(console.error).toHaveBeenCalledWith('Failed to write to log file:', writeError.message);
        });

        test('should format timestamp correctly', () => {
            const testMessage = 'Timestamp test';
            
            logger.log(testMessage);
            
            expect(moment).toHaveBeenCalled();
            expect(moment().format).toHaveBeenCalledWith('YYYY-MM-DD HH:mm:ss');
        });

        test('should append newline to log file entry', () => {
            const testMessage = 'Newline test';
            
            logger.log(testMessage);
            
            const expectedLogEntry = `[${mockTimestamp}] [INFO] ${testMessage}\n`;
            expect(fs.appendFileSync).toHaveBeenCalledWith(mockLogPath, expectedLogEntry);
        });
    });

    describe('info method', () => {
        test('should log message with INFO level', () => {
            const testMessage = 'Info message';
            
            // Spy on the log method to verify it's called correctly
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.info(testMessage);
            
            expect(logSpy).toHaveBeenCalledWith(testMessage, 'INFO');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] ${testMessage}`);
        });

        test('should handle empty message', () => {
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.info('');
            
            expect(logSpy).toHaveBeenCalledWith('', 'INFO');
        });

        test('should handle undefined message', () => {
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.info(undefined);
            
            expect(logSpy).toHaveBeenCalledWith(undefined, 'INFO');
        });
    });

    describe('warn method', () => {
        test('should log message with WARN level', () => {
            const testMessage = 'Warning message';
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.warn(testMessage);
            
            expect(logSpy).toHaveBeenCalledWith(testMessage, 'WARN');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [WARN] ${testMessage}`);
        });

        test('should handle special characters in warning message', () => {
            const testMessage = 'Warning: Special chars áéíóú & symbols!@#$%';
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.warn(testMessage);
            
            expect(logSpy).toHaveBeenCalledWith(testMessage, 'WARN');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [WARN] ${testMessage}`);
        });
    });

    describe('debug method', () => {
        test('should log message with DEBUG level', () => {
            const testMessage = 'Debug message';
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.debug(testMessage);
            
            expect(logSpy).toHaveBeenCalledWith(testMessage, 'DEBUG');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [DEBUG] ${testMessage}`);
        });

        test('should handle long debug messages', () => {
            const longMessage = 'Debug: ' + 'x'.repeat(1000);
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.debug(longMessage);
            
            expect(logSpy).toHaveBeenCalledWith(longMessage, 'DEBUG');
        });
    });

    describe('error method', () => {
        test('should log message with ERROR level when no error object provided', () => {
            const testMessage = 'Error message';
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.error(testMessage);
            
            expect(logSpy).toHaveBeenCalledWith(testMessage, 'ERROR');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [ERROR] ${testMessage}`);
        });

        test('should log message with error details when error object provided', () => {
            const testMessage = 'Operation failed';
            const errorObj = new Error('Connection timeout');
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.error(testMessage, errorObj);
            
            const expectedMessage = `${testMessage}: ${errorObj.message}`;
            expect(logSpy).toHaveBeenCalledWith(expectedMessage, 'ERROR');
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [ERROR] ${expectedMessage}`);
        });

        test('should handle error object with null error parameter explicitly passed', () => {
            const testMessage = 'Null error test';
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.error(testMessage, null);
            
            expect(logSpy).toHaveBeenCalledWith(testMessage, 'ERROR');
        });

        test('should handle error object without message property', () => {
            const testMessage = 'Error without message';
            const errorObj = { name: 'CustomError', code: 500 };
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.error(testMessage, errorObj);
            
            const expectedMessage = `${testMessage}: undefined`;
            expect(logSpy).toHaveBeenCalledWith(expectedMessage, 'ERROR');
        });

        test('should handle Error object with custom properties', () => {
            const testMessage = 'Custom error';
            const errorObj = new Error('Base error');
            errorObj.code = 'CUSTOM_CODE';
            errorObj.details = 'Additional details';
            
            const logSpy = jest.spyOn(logger, 'log');
            
            logger.error(testMessage, errorObj);
            
            const expectedMessage = `${testMessage}: ${errorObj.message}`;
            expect(logSpy).toHaveBeenCalledWith(expectedMessage, 'ERROR');
        });
    });

    describe('file operations', () => {
        test('should use correct log file path', () => {
            logger.log('Test');
            
            expect(fs.appendFileSync).toHaveBeenCalledWith(mockLogPath, expect.any(String));
        });

        test('should continue logging to console even when file write fails', () => {
            const testMessage = 'Test message';
            fs.appendFileSync.mockImplementation(() => {
                throw new Error('Disk full');
            });
            
            logger.log(testMessage);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] ${testMessage}`);
            expect(console.error).toHaveBeenCalledWith('Failed to write to log file:', 'Disk full');
        });

        test('should handle different types of file write errors', () => {
            const testCases = [
                { error: new Error('Permission denied'), expected: 'Permission denied' },
                { error: new Error('No space left on device'), expected: 'No space left on device' },
                { error: new Error(''), expected: '' },
                { error: { message: 'Custom error object' }, expected: 'Custom error object' }
            ];

            testCases.forEach(({ error, expected }) => {
                jest.clearAllMocks();
                fs.appendFileSync.mockImplementation(() => {
                    throw error;
                });
                
                logger.log('Test');
                
                expect(console.error).toHaveBeenCalledWith('Failed to write to log file:', expected);
            });
        });
    });

    describe('integration tests', () => {
        test('should log different levels in sequence', () => {
            const messages = [
                { method: 'info', message: 'Info test', level: 'INFO' },
                { method: 'warn', message: 'Warn test', level: 'WARN' },
                { method: 'error', message: 'Error test', level: 'ERROR' },
                { method: 'debug', message: 'Debug test', level: 'DEBUG' }
            ];

            messages.forEach(({ method, message, level }) => {
                logger[method](message);
                expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [${level}] ${message}`);
            });

            expect(console.log).toHaveBeenCalledTimes(4);
            expect(fs.appendFileSync).toHaveBeenCalledTimes(4);
        });

        test('should handle rapid successive logging calls', () => {
            const rapidCalls = Array.from({ length: 10 }, (_, i) => `Message ${i + 1}`);
            
            rapidCalls.forEach(message => {
                logger.info(message);
            });
            
            expect(console.log).toHaveBeenCalledTimes(10);
            expect(fs.appendFileSync).toHaveBeenCalledTimes(10);
            
            rapidCalls.forEach((message, index) => {
                expect(console.log).toHaveBeenNthCalledWith(
                    index + 1,
                    `[${mockTimestamp}] [INFO] ${message}`
                );
            });
        });
    });

    describe('module export', () => {
        test('should export a singleton instance', () => {
            // Re-require to test singleton behavior
            const instance1 = require('../../src/utils/logger');
            const instance2 = require('../../src/utils/logger');
            
            expect(instance1).toBe(instance2);
        });

        test('should have all required methods', () => {
            expect(typeof logger.log).toBe('function');
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.error).toBe('function');
            expect(typeof logger.debug).toBe('function');
        });
    });

    describe('edge cases', () => {
        test('should handle null message', () => {
            logger.info(null);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] null`);
        });

        test('should handle numeric message', () => {
            const numericMessage = 12345;
            logger.info(numericMessage);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] ${numericMessage}`);
        });

        test('should handle boolean message', () => {
            logger.info(true);
            logger.warn(false);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] true`);
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [WARN] false`);
        });

        test('should handle object message', () => {
            const objMessage = { key: 'value', nested: { data: 'test' } };
            logger.info(objMessage);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [INFO] [object Object]`);
        });

        test('should handle array message', () => {
            const arrayMessage = ['item1', 'item2', 'item3'];
            logger.debug(arrayMessage);
            
            expect(console.log).toHaveBeenCalledWith(`[${mockTimestamp}] [DEBUG] item1,item2,item3`);
        });
    });
});