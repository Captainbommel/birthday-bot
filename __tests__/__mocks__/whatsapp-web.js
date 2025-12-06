// Mock for whatsapp-web.js
const EventEmitter = require('events');

class MockClient extends EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.isReady = false;
        this.initialized = false;
        
        // Store reference to last instance for tests
        MockClient.lastInstance = this;
    }

    async initialize() {
        this.initialized = true;
        // Simulate async initialization
        await new Promise(resolve => setTimeout(resolve, 10));
        return Promise.resolve();
    }

    async getChatById(chatId) {
        // Simulate getting a chat
        if (chatId.includes('invalid')) {
            throw new Error('Chat not found');
        }
        return {
            id: { user: chatId.split('@')[0] },
            sendMessage: jest.fn().mockResolvedValue({ id: 'msg123' })
        };
    }

    destroy() {
        this.isReady = false;
        this.initialized = false;
        this.emit('disconnected', 'manual');
    }

    // Helper methods for testing
    simulateQRCode(qr = 'mock-qr-code') {
        this.emit('qr', qr);
    }

    simulateReady() {
        this.isReady = true;
        this.emit('ready');
    }

    simulateAuthFailure(msg = 'Authentication failed') {
        this.emit('auth_failure', msg);
    }

    simulateDisconnected(reason = 'logout') {
        this.isReady = false;
        this.emit('disconnected', reason);
    }

    simulateError(error = new Error('Test error')) {
        this.emit('error', error);
    }
}

class MockLocalAuth {
    constructor(options) {
        this.options = options;
    }
}

// Reset lastInstance for each test
MockClient.lastInstance = null;

const ClientConstructor = jest.fn().mockImplementation((options) => new MockClient(options));
const LocalAuthConstructor = jest.fn().mockImplementation((options) => new MockLocalAuth(options));

module.exports = {
    Client: ClientConstructor,
    LocalAuth: LocalAuthConstructor
};