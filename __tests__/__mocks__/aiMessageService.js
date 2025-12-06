// Mock for aiMessageService
const aiMessageService = {
    generateBirthdayMessage: jest.fn((name) => 
        Promise.resolve(`Happy Birthday ${name}! 🎉 Wishing you all the best on your special day!`)
    ),
    generatePersonalReminderMessage: jest.fn((name) => 
        Promise.resolve(`Reminder: It's ${name}'s birthday today! Don't forget to wish them well.`)
    ),
    // Helper methods for tests
    resetMocks: () => {
        aiMessageService.generateBirthdayMessage.mockClear();
        aiMessageService.generatePersonalReminderMessage.mockClear();
    },
    simulateError: () => {
        aiMessageService.generateBirthdayMessage.mockRejectedValueOnce(new Error('AI service error'));
        aiMessageService.generatePersonalReminderMessage.mockRejectedValueOnce(new Error('AI service error'));
    }
};

module.exports = aiMessageService;