// Mock for qrcode-terminal
const { mock } = require('bun:test');

const qrcodeTerminal = {
    generate: mock(),
    setErrorLevel: mock(),
    resetMocks: () => {
        qrcodeTerminal.generate.mockClear();
        qrcodeTerminal.setErrorLevel.mockClear();
    }
};

module.exports = qrcodeTerminal;