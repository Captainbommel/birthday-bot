const fs = require('fs');
const path = require('path');
const historyService = require('../../src/services/historyService');

jest.mock('fs');
jest.mock('path');
jest.mock('../../src/utils/logger', () => require('../__mocks__/logger'));

describe('HistoryService', () => {
    const mockHistoryFile = 'mock/path/to/history.json';
    
    beforeEach(() => {
        jest.clearAllMocks();
        path.join.mockReturnValue(mockHistoryFile);
        // Reset internal state by reloading module if needed, but since it's a singleton, 
        // we might need to manually reset the history property if we could access it.
        // However, since we mock fs, we can control what loadHistory returns.
        
        // Re-instantiate or reset the service would be ideal, but it exports an instance.
        // We can rely on mocking fs methods for each test.
    });

    test('should load history from file if it exists', () => {
        const mockData = { sentMessages: [{ name: 'Test', year: 2025 }] };
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

        // We need to trigger loadHistory again or check the initial load.
        // Since it loads in constructor, we might need to re-require.
        jest.isolateModules(() => {
            const freshHistoryService = require('../../src/services/historyService');
            expect(freshHistoryService.hasSentMessage('Test', 2025)).toBe(true);
        });
    });

    test('should return empty history if file does not exist', () => {
        fs.existsSync.mockReturnValue(false);
        
        jest.isolateModules(() => {
            const freshHistoryService = require('../../src/services/historyService');
            expect(freshHistoryService.hasSentMessage('Test', 2025)).toBe(false);
        });
    });

    test('should save history when marking as sent', () => {
        fs.existsSync.mockReturnValue(false);
        
        jest.isolateModules(() => {
            const freshHistoryService = require('../../src/services/historyService');
            freshHistoryService.markAsSent('Alice', 2025, 'birthday');
            
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                mockHistoryFile,
                expect.stringContaining('"name": "Alice"')
            );
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                mockHistoryFile,
                expect.stringContaining('"year": 2025')
            );
        });
    });

    test('should correctly identify sent messages', () => {
        fs.existsSync.mockReturnValue(false);
        
        jest.isolateModules(() => {
            const freshHistoryService = require('../../src/services/historyService');
            freshHistoryService.markAsSent('Bob', 2025, 'birthday');
            
            expect(freshHistoryService.hasSentMessage('Bob', 2025)).toBe(true);
            expect(freshHistoryService.hasSentMessage('Bob', 2024)).toBe(false);
            expect(freshHistoryService.hasSentMessage('Charlie', 2025)).toBe(false);
        });
    });
});
