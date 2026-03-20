// Mock for whatsappService
const { mock } = require('bun:test');

const whatsappService = {
    sendMessage: mock(() => Promise.resolve('Message sent successfully')),
    sendImage: mock(() => Promise.resolve('Image sent successfully')),
    isReady: mock(() => true),
    // Helper methods for tests
    resetMocks: () => {
        whatsappService.sendMessage.mockReset();
        whatsappService.sendMessage.mockResolvedValue('Message sent successfully');
        whatsappService.sendImage.mockReset();
        whatsappService.sendImage.mockResolvedValue('Image sent successfully');
        whatsappService.isReady.mockReset();
        whatsappService.isReady.mockReturnValue(true);
    },
    simulateError: () => {
        whatsappService.sendMessage.mockRejectedValueOnce(new Error('WhatsApp service error'));
    }
};

module.exports = whatsappService;