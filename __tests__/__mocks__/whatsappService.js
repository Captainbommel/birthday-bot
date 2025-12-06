// Mock for whatsappService
const whatsappService = {
    sendMessage: jest.fn(() => Promise.resolve('Message sent successfully')),
    sendImage: jest.fn(() => Promise.resolve('Image sent successfully')),
    isReady: jest.fn(() => true),
    // Helper methods for tests
    resetMocks: () => {
        whatsappService.sendMessage.mockClear();
        whatsappService.sendImage.mockClear();
        whatsappService.isReady.mockClear();
    },
    simulateError: () => {
        whatsappService.sendMessage.mockRejectedValueOnce(new Error('WhatsApp service error'));
    }
};

module.exports = whatsappService;