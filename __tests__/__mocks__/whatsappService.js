// Mock for whatsappService
const whatsappService = {
    sendMessage: jest.fn(() => Promise.resolve('Message sent successfully')),
    sendImage: jest.fn(() => Promise.resolve('Image sent successfully')),
    isReady: jest.fn(() => true),
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