// Mock for configManager
const mockConfig = {
    cronSchedule: '0 8 * * *',
    timezone: 'Europe/Berlin',
    openaiApiKey: 'test-key',
    yourPhoneNumber: '+1234567890'
};

const mockBirthdays = [
    {
        name: 'John Doe',
        date: '07-10', // Today's date for testing
        phone: '+1111111111',
        personal: false
    },
    {
        name: 'Jane Smith',
        date: '08-10', // Tomorrow's date
        phone: '+2222222222',
        personal: true
    },
    {
        name: 'Bob Wilson',
        date: '06-10', // Yesterday's date
        phone: '+3333333333',
        personal: false
    }
];

const configManager = {
    getConfig: jest.fn(() => mockConfig),
    getBirthdays: jest.fn(() => mockBirthdays),
    loadConfig: jest.fn(() => mockConfig),
    loadBirthdays: jest.fn(() => mockBirthdays),
    // Helper methods for tests
    setMockConfig: (newConfig) => {
        Object.assign(mockConfig, newConfig);
    },
    setMockBirthdays: (newBirthdays) => {
        mockBirthdays.length = 0;
        mockBirthdays.push(...newBirthdays);
    },
    resetMocks: () => {
        configManager.getConfig.mockClear();
        configManager.getBirthdays.mockClear();
        configManager.loadConfig.mockClear();
        configManager.loadBirthdays.mockClear();
    }
};

module.exports = configManager;