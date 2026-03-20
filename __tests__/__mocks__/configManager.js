// Mock for configManager
const { mock } = require('bun:test');

const defaultConfig = {
    cronSchedule: '0 8 * * *',
    timezone: 'Europe/Berlin',
    openaiApiKey: 'test-key',
    yourPhoneNumber: '+1234567890'
};

const mockConfig = { ...defaultConfig };

const mockBirthdays = [
    {
        name: 'John Doe',
        date: '07-10', // Today's date for testing
        phone: '+1111111111',
        type: 'generated'
    },
    {
        name: 'Jane Smith',
        date: '08-10', // Tomorrow's date
        phone: '+2222222222',
        type: 'personal'
    },
    {
        name: 'Bob Wilson',
        date: '06-10', // Yesterday's date
        phone: '+3333333333',
        type: 'generated'
    }
];

const configManager = {
    getConfig: mock(() => mockConfig),
    getBirthdays: mock(() => mockBirthdays),
    loadConfig: mock(() => mockConfig),
    loadBirthdays: mock(() => mockBirthdays),
    setCronSchedule: mock(),
    // Helper methods for tests
    setMockConfig: (newConfig) => {
        Object.assign(mockConfig, newConfig);
    },
    setMockBirthdays: (newBirthdays) => {
        mockBirthdays.length = 0;
        mockBirthdays.push(...newBirthdays);
    },
    resetMocks: () => {
        // Reset mockConfig back to defaults (remove extra keys, restore default values)
        Object.keys(mockConfig).forEach(key => delete mockConfig[key]);
        Object.assign(mockConfig, defaultConfig);
        configManager.getConfig.mockClear();
        configManager.getBirthdays.mockClear();
        configManager.loadConfig.mockClear();
        configManager.loadBirthdays.mockClear();
        configManager.setCronSchedule.mockClear();
    }
};

module.exports = configManager;