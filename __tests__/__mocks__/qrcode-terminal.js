// Mock for qrcode-terminal
const qrcodeTerminal = {
    generate: jest.fn(),
    setErrorLevel: jest.fn(),
    resetMocks: () => {
        qrcodeTerminal.generate.mockClear();
        qrcodeTerminal.setErrorLevel.mockClear();
    }
};

module.exports = qrcodeTerminal;