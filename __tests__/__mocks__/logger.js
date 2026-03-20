// Mock for logger
const { mock } = require('bun:test');

const logger = {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
    // Helper methods for tests
    resetMocks: () => {
        logger.info.mockClear();
        logger.warn.mockClear();
        logger.error.mockClear();
        logger.debug.mockClear();
    }
};

module.exports = logger;