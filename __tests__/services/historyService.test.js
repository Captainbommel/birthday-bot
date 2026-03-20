const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

const fs = require('fs');

describe('HistoryService', () => {
    let mockCheckGet;
    let mockInsertRun;
    let mockDb;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCheckGet = jest.fn().mockReturnValue(null);
        mockInsertRun = jest.fn();
        mockDb = {
            run: jest.fn(),
            prepare: jest.fn().mockImplementation((sql) => {
                if (sql.toUpperCase().startsWith('SELECT')) {
                    return { get: mockCheckGet };
                }
                return { run: mockInsertRun };
            }),
        };

        // Inject mock logger to avoid it creating its own DB connection
        const loggerPath = require.resolve('../../src/utils/logger');
        require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }, children: [], paths: module.paths };

        // Inject mock db
        const dbPath = require.resolve('../../src/config/database');
        require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb, children: [], paths: module.paths };

        spyOn(fs, 'existsSync').mockReturnValue(false);
        spyOn(fs, 'readFileSync').mockReturnValue('{"sentMessages":[]}');
        spyOn(fs, 'renameSync').mockImplementation(() => {});
    });

    afterEach(() => {
        mock.restore();
    });

    function freshService() {
        delete require.cache[require.resolve('../../src/services/historyService')];
        return require('../../src/services/historyService');
    }

    test('should return false when no matching record exists in database', () => {
        const svc = freshService();
        mockCheckGet.mockReturnValue(null);

        expect(svc.hasSentMessage('Test', 2025)).toBe(false);
    });

    test('should return true when a matching record exists in database', () => {
        const svc = freshService();
        mockCheckGet.mockReturnValue({ found: 1 });

        expect(svc.hasSentMessage('Test', 2025)).toBe(true);
    });

    test('should query database with correct name and year', () => {
        const svc = freshService();
        svc.hasSentMessage('Alice', 2025);

        expect(mockCheckGet).toHaveBeenCalledWith('Alice', 2025);
    });

    test('should insert into database when marking as sent', () => {
        const svc = freshService();
        svc.markAsSent('Alice', 2025, 'birthday');

        expect(mockInsertRun).toHaveBeenCalledWith(
            'Alice',
            2025,
            'birthday',
            expect.any(String)
        );
    });

    test('timestamp passed to markAsSent should be a valid ISO string', () => {
        const svc = freshService();
        svc.markAsSent('Bob', 2026, 'birthday_message');

        const [, , , timestamp] = mockInsertRun.mock.calls[0];
        expect(() => new Date(timestamp)).not.toThrow();
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    test('should correctly identify sent and unsent messages', () => {
        const svc = freshService();

        mockCheckGet.mockReturnValue(null);
        expect(svc.hasSentMessage('Bob', 2025)).toBe(false);

        mockCheckGet.mockReturnValue({ found: 1 });
        expect(svc.hasSentMessage('Bob', 2025)).toBe(true);

        mockCheckGet.mockReturnValue(null);
        expect(svc.hasSentMessage('Bob', 2024)).toBe(false);
        expect(svc.hasSentMessage('Charlie', 2025)).toBe(false);
    });

    describe('migration from history.json', () => {
        test('should not migrate when history.json does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            freshService();

            expect(fs.readFileSync).not.toHaveBeenCalled();
            expect(mockInsertRun).not.toHaveBeenCalled();
        });

        test('should import records from history.json on first run', () => {
            const mockData = {
                sentMessages: [
                    { name: 'Lars', year: 2025, type: 'birthday_message', timestamp: '2025-12-06T13:13:30.126Z' },
                    { name: 'Louis', year: 2025, type: 'birthday_message', timestamp: '2025-12-06T13:24:00.249Z' },
                ]
            };
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

            freshService();

            expect(mockInsertRun).toHaveBeenCalledTimes(2);
            expect(mockInsertRun).toHaveBeenCalledWith('Lars', 2025, 'birthday_message', '2025-12-06T13:13:30.126Z');
            expect(mockInsertRun).toHaveBeenCalledWith('Louis', 2025, 'birthday_message', '2025-12-06T13:24:00.249Z');
        });

        test('should rename history.json after successful migration', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('{"sentMessages":[]}');

            freshService();

            expect(fs.renameSync).toHaveBeenCalledWith(
                expect.stringContaining('history.json'),
                expect.stringContaining('history.json.migrated')
            );
        });

        test('should handle malformed history.json gracefully', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('not valid json');

            expect(() => freshService()).not.toThrow();
        });
    });
});

