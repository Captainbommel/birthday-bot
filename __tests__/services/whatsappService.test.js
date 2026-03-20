const { mock, jest, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

// Shared mutable mock state — created once, reset between tests
const mockConfig = {
    getConfig: jest.fn(() => ({ yourPhoneNumber: '+1234567890' }))
};

const mockAI = {
    generateTestMessage: jest.fn().mockResolvedValue('Test message')
};

const mockQRCode = {
    generate: jest.fn()
};

const mockClient = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getChatById: jest.fn().mockResolvedValue({
        id: { user: 'test' },
        sendMessage: jest.fn().mockResolvedValue({ id: 'msg123' })
    }),
    destroy: jest.fn(),
    on: jest.fn(),
    listenerCount: jest.fn(() => 1),
    _listeners: {},
    _addListener: function(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
    },
    _emit: function(event, ...args) {
        if (this._listeners[event]) {
            this._listeners[event].forEach(callback => callback(...args));
        }
    }
};

// Register module mocks BEFORE requiring the service under test
mock.module('whatsapp-web.js', () => ({
    Client: jest.fn(() => mockClient),
    LocalAuth: jest.fn(() => ({ clientId: 'birthday-bot' })),
    MessageMedia: {
        fromFilePath: jest.fn().mockReturnValue({ mimetype: 'image/jpeg', data: 'base64data' })
    }
}));
mock.module('qrcode-terminal', () => mockQRCode);
mock.module('../../src/config/configManager', () => mockConfig);
mock.module('../../src/services/aiMessageService', () => mockAI);

// Load the real logger so we can spy on it
const logger = require('../../src/utils/logger');

// Trigger module load at file scope so require.cache is populated (even if birthdayService's
// mock.module returns a mock here — that's fine). During test execution, delete+require
// bypasses Bun's mock.module registry and loads the real file from disk.
require('../../src/services/whatsappService');

let WhatsAppService;

describe('WhatsAppService', () => {
    beforeEach(() => {
        // Load the real service: delete cached entry then re-require.
        // At test-execution time, require() falls back to the file system rather than
        // Bun's mock.module registry, so we get the genuine implementation.
        delete require.cache[require.resolve('../../src/services/whatsappService')];
        WhatsAppService = require('../../src/services/whatsappService');

        // Activate fake timers first, then clear state
        jest.useFakeTimers();
        jest.clearAllMocks();
        jest.clearAllTimers();

        // Set up logger spies
        spyOn(logger, 'info').mockImplementation(() => {});
        spyOn(logger, 'error').mockImplementation(() => {});
        spyOn(logger, 'warn').mockImplementation(() => {});

        // Restore default implementations after clearAllMocks
        mockConfig.getConfig.mockReturnValue({ yourPhoneNumber: '+1234567890' });
        mockAI.generateTestMessage.mockResolvedValue('Test message');
        mockClient.initialize.mockResolvedValue(undefined);
        mockClient.getChatById.mockResolvedValue({
            id: { user: 'test' },
            sendMessage: jest.fn().mockResolvedValue({ id: 'msg123' })
        });
        mockClient.listenerCount.mockReturnValue(1);

        // Reset client event listeners and re-establish tracking
        mockClient._listeners = {};
        mockClient.on.mockImplementation((event, callback) => {
            mockClient._addListener(event, callback);
        });

        // Reset service state and re-initialize to register fresh event handlers
        WhatsAppService.isReady = false;
        WhatsAppService.initializeClient();
    });

    afterEach(() => {
        mock.restore();
        jest.useRealTimers();
    });

    describe('initialization', () => {
        test('should set up event handlers', () => {
            expect(mockClient.on).toHaveBeenCalledWith('qr', expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith('auth_failure', expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
        });

        test('should initialize with isReady as false', () => {
            expect(WhatsAppService.isReady).toBe(false);
        });
    });

    describe('initialize method', () => {
        test('should initialize client successfully', async () => {
            await WhatsAppService.initialize();

            expect(mockClient.initialize).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith('Initializing WhatsApp client...');
        });

        test('should handle initialization errors', async () => {
            const error = new Error('Init failed');
            mockClient.initialize.mockRejectedValueOnce(error);

            await expect(WhatsAppService.initialize()).rejects.toThrow('Init failed');
            expect(logger.error).toHaveBeenCalledWith('Failed to initialize WhatsApp client', error);
        });
    });

    describe('event handlers', () => {
        test('should handle QR code event', () => {
            const testQR = 'test-qr-123';
            
            mockClient._emit('qr', testQR);

            expect(logger.info).toHaveBeenCalledWith('QR Code received, scan with your WhatsApp:');
            expect(mockQRCode.generate).toHaveBeenCalledWith(testQR, { small: true });
        });

        test('should handle ready event', () => {
            mockClient._emit('ready');

            expect(WhatsAppService.isReady).toBe(true);
            expect(logger.info).toHaveBeenCalledWith('WhatsApp Birthday Bot is ready!');
        });

        test('should handle authentication failure', () => {
            mockClient._emit('auth_failure', 'Auth failed');

            expect(logger.error).toHaveBeenCalledWith('Authentication failure', expect.any(Error));
        });

        test('should handle disconnection', () => {
            WhatsAppService.isReady = true;
            const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
            
            mockClient._emit('disconnected', 'logout');

            expect(WhatsAppService.isReady).toBe(false);
            expect(logger.info).toHaveBeenCalledWith('Client was logged out: logout');
            expect(mockClient.destroy).toHaveBeenCalled();
            
            jest.advanceTimersByTime(1000);
            expect(mockExit).toHaveBeenCalledWith(1);
            
            mockExit.mockRestore();
        });

        test('should handle change_state event', () => {
            mockClient._emit('change_state', 'OPENING');
            expect(logger.info).toHaveBeenCalledWith('Connection state changed to: OPENING');
        });

        test('should handle client errors', () => {
            const error = new Error('Test error');
            
            mockClient._emit('error', error);

            expect(logger.error).toHaveBeenCalledWith('Client error occurred', error);
        });

        test('should handle Puppeteer evaluation errors with restart', () => {
            const error = new Error('Evaluation failed: test');
            const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
            
            mockClient._emit('error', error);

            expect(logger.info).toHaveBeenCalledWith('Puppeteer evaluation error detected. Trying to restart...');
            
            jest.advanceTimersByTime(2000);
            expect(mockExit).toHaveBeenCalledWith(1);
            
            mockExit.mockRestore();
        });
    });

    describe('getSafeChatById', () => {
        test('should get chat successfully', async () => {
            const phoneNumber = '+1234567890';
            
            const result = await WhatsAppService.getSafeChatById(phoneNumber);

            expect(mockClient.getChatById).toHaveBeenCalledWith('1234567890@c.us');
            expect(result).toBeDefined();
        });

        test('should retry on failure', async () => {
            const phoneNumber = '+1234567890';
            
            mockClient.getChatById
                .mockRejectedValueOnce(new Error('Failed'))
                .mockResolvedValueOnce({ id: { user: 'test' }, sendMessage: jest.fn() });

            // Mock setTimeout to avoid actual delays
            jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
                callback();
                return {};
            });

            const result = await WhatsAppService.getSafeChatById(phoneNumber, 2);

            expect(mockClient.getChatById).toHaveBeenCalledTimes(2);
            expect(result).toBeDefined();
        });

        test('should fail after max retries', async () => {
            const phoneNumber = '+1234567890';
            
            mockClient.getChatById.mockRejectedValue(new Error('Always fails'));

            // Mock setTimeout to avoid actual delays
            jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
                callback();
                return {};
            });

            await expect(WhatsAppService.getSafeChatById(phoneNumber, 2))
                .rejects.toThrow('Could not get chat for +1234567890 after 2 attempts');
        });
    });

    describe('sendMessage', () => {
        beforeEach(() => {
            WhatsAppService.isReady = true;
        });

        test('should send message successfully', async () => {
            const result = await WhatsAppService.sendMessage('+1234567890', 'test message');

            expect(result).toBe(true);
            expect(logger.info).toHaveBeenCalledWith('Message sent successfully to +1234567890');
        });

        test('should throw error when not ready', async () => {
            WhatsAppService.isReady = false;

            await expect(WhatsAppService.sendMessage('+1234567890', 'test'))
                .rejects.toThrow('WhatsApp client is not ready');
        });

        test('should handle send errors', async () => {
            const sendError = new Error('Send failed');
            mockClient.getChatById.mockResolvedValueOnce({
                sendMessage: jest.fn().mockRejectedValueOnce(sendError)
            });

            await expect(WhatsAppService.sendMessage('+1234567890', 'test'))
                .rejects.toThrow('Send failed');

            expect(logger.error).toHaveBeenCalledWith('Failed to send message to +1234567890', expect.any(Error));
        });
    });

    describe('sendImage', () => {
        beforeEach(() => {
            WhatsAppService.isReady = true;
        });

        test('should send image successfully', async () => {
            const phoneNumber = '+1234567890';
            const imagePath = 'path/to/image.jpg';
            
            const result = await WhatsAppService.sendImage(phoneNumber, imagePath);

            expect(result).toBe(true);
            expect(logger.info).toHaveBeenCalledWith(`Image sent successfully to ${phoneNumber}`);
        });

        test('should throw error when not ready', async () => {
            WhatsAppService.isReady = false;
            
            await expect(WhatsAppService.sendImage('+123', 'path.jpg'))
                .rejects.toThrow('WhatsApp client is not ready');
        });

        test('should handle send errors', async () => {
            const error = new Error('Send failed');
            mockClient.getChatById.mockResolvedValue({
                sendMessage: jest.fn().mockRejectedValue(error)
            });

            await expect(WhatsAppService.sendImage('+123', 'path.jpg'))
                .rejects.toThrow('Send failed');
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send image'), error);
        });
    });

    describe('sendTestMessage', () => {
        test('should send test message when configured', async () => {
            WhatsAppService.isReady = true;
            jest.spyOn(WhatsAppService, 'sendMessage').mockResolvedValueOnce(true);

            WhatsAppService.sendTestMessage();

            jest.advanceTimersByTime(5000);
            
            // Wait for promises to resolve
            await Promise.resolve();

            expect(mockAI.generateTestMessage).toHaveBeenCalledWith('Test User');
        });

        test('should skip test message when client not ready', () => {
            WhatsAppService.isReady = false;
            
            WhatsAppService.sendTestMessage();
            
            jest.advanceTimersByTime(5000);
            
            expect(logger.info).toHaveBeenCalledWith('Client not ready yet, skipping test message');
            expect(mockAI.generateTestMessage).not.toHaveBeenCalled();
        });

        test('should handle errors during test message', async () => {
            WhatsAppService.isReady = true;
            const error = new Error('Test error');
            jest.spyOn(WhatsAppService, 'sendMessage').mockRejectedValueOnce(error);

            WhatsAppService.sendTestMessage();
            
            jest.advanceTimersByTime(5000);
            
            // Wait for promises to resolve
            await Promise.resolve();
            await Promise.resolve();
            
            expect(logger.error).toHaveBeenCalledWith('Failed to send test message', error);
        });

        test('should warn when phone number not configured', () => {
            mockConfig.getConfig.mockReturnValueOnce({ yourPhoneNumber: '' });

            WhatsAppService.sendTestMessage();

            expect(logger.warn).toHaveBeenCalledWith('Cannot send test message - yourPhoneNumber not configured');
        });
    });

    describe('destroy', () => {
        test('should destroy client', () => {
            WhatsAppService.destroy();

            expect(mockClient.destroy).toHaveBeenCalled();
        });
    });

    describe('integration scenarios', () => {
        test('should handle complete initialization flow', async () => {
            await WhatsAppService.initialize();
            
            mockClient._emit('qr', 'test-qr');
            mockClient._emit('ready');

            expect(WhatsAppService.isReady).toBe(true);
            expect(mockQRCode.generate).toHaveBeenCalledWith('test-qr', { small: true });
        });

        test('should handle reconnection', () => {
            mockClient._emit('ready');
            expect(WhatsAppService.isReady).toBe(true);

            mockClient._emit('disconnected', 'connection_lost');
            expect(WhatsAppService.isReady).toBe(false);

            mockClient._emit('ready');
            expect(WhatsAppService.isReady).toBe(true);
        });
    });
});
