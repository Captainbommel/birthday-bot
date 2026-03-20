const { jest, mock, spyOn, describe, test, expect, beforeEach, afterEach } = require('bun:test');

const fs = require('fs');

describe('BirthdayRepository', () => {
    let mockStmts;
    let mockDb;

    beforeEach(() => {
        jest.clearAllMocks();

        mockStmts = {
            getAll:   { all: jest.fn().mockReturnValue([]) },
            getByName: { get: jest.fn().mockReturnValue(null) },
            insert:   { run: jest.fn() },
            update:   { run: jest.fn().mockReturnValue({ changes: 0 }) },
            delete:   { run: jest.fn().mockReturnValue({ changes: 0 }) },
            upsert:   { run: jest.fn() },
        };

        mockDb = {
            run: jest.fn(),
            prepare: jest.fn().mockImplementation((sql) => {
                if (sql.trim().startsWith('UPDATE')) return mockStmts.update;
                if (sql.trim().startsWith('DELETE')) return mockStmts.delete;
                if (sql.includes('ORDER BY'))        return mockStmts.getAll;
                if (sql.includes('ON CONFLICT'))     return mockStmts.upsert;
                if (sql.includes('WHERE lower'))     return mockStmts.getByName;
                return mockStmts.insert;
            }),
        };

        // Inject mock logger
        const loggerPath = require.resolve('../../src/utils/logger');
        require.cache[loggerPath] = {
            id: loggerPath, filename: loggerPath, loaded: true,
            exports: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
            children: [], paths: module.paths,
        };

        // Inject mock db
        const dbPath = require.resolve('../../src/config/database');
        require.cache[dbPath] = {
            id: dbPath, filename: dbPath, loaded: true,
            exports: mockDb,
            children: [], paths: module.paths,
        };

        // Default: no config.json → migration skips
        spyOn(fs, 'existsSync').mockReturnValue(false);
        spyOn(fs, 'readFileSync').mockReturnValue('');
        spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    });

    afterEach(() => {
        mock.restore();
    });

    function freshRepo() {
        delete require.cache[require.resolve('../../src/config/birthdayRepository')];
        return require('../../src/config/birthdayRepository');
    }

    describe('initialization', () => {
        test('should create birthdays table on load', () => {
            freshRepo();
            expect(mockDb.run).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS birthdays'));
        });

        test('should prepare all required statements', () => {
            freshRepo();
            // 6 statements: getAll, getByName, insert, update, delete, upsert
            expect(mockDb.prepare).toHaveBeenCalledTimes(6);
        });
    });

    describe('getAll', () => {
        test('should return all rows from the database', () => {
            const rows = [
                { name: 'Alice', date: '01-01', phone: '+111', type: 'personal' },
                { name: 'Bob',   date: '15-06', phone: '+222', type: 'generated' },
            ];
            mockStmts.getAll.all.mockReturnValue(rows);

            const repo = freshRepo();
            const result = repo.getAll();

            expect(mockStmts.getAll.all).toHaveBeenCalled();
            expect(result).toEqual(rows);
        });

        test('should return empty array when no birthdays exist', () => {
            const repo = freshRepo();
            expect(repo.getAll()).toEqual([]);
        });
    });

    describe('getByName', () => {
        test('should return matching row for known name', () => {
            const row = { name: 'Alice', date: '01-01', phone: '+111', type: 'personal' };
            mockStmts.getByName.get.mockReturnValue(row);

            const repo = freshRepo();
            const result = repo.getByName('Alice');

            expect(mockStmts.getByName.get).toHaveBeenCalledWith('Alice');
            expect(result).toEqual(row);
        });

        test('should return null when name not found', () => {
            const repo = freshRepo();
            expect(repo.getByName('Unknown')).toBeNull();
        });
    });

    describe('add', () => {
        test('should insert a new birthday', () => {
            const repo = freshRepo();
            repo.add('Alice', '01-01', '+111', 'personal');

            expect(mockStmts.insert.run).toHaveBeenCalledWith('Alice', '01-01', '+111', 'personal');
        });

        test('should default type to generated when not specified', () => {
            const repo = freshRepo();
            repo.add('Bob', '15-06', '+222');

            expect(mockStmts.insert.run).toHaveBeenCalledWith('Bob', '15-06', '+222', 'generated');
        });

        test('should strip spaces from phone number', () => {
            const repo = freshRepo();
            repo.add('Charlie', '20-03', '+49 123 456', 'generated');

            expect(mockStmts.insert.run).toHaveBeenCalledWith('Charlie', '20-03', '+49123456', 'generated');
        });

        test('should allow null phone number', () => {
            const repo = freshRepo();
            repo.add('Dave', '10-10', null, 'generated');

            expect(mockStmts.insert.run).toHaveBeenCalledWith('Dave', '10-10', null, 'generated');
        });
    });

    describe('update', () => {
        test('should update existing birthday', () => {
            mockStmts.update.run.mockReturnValue({ changes: 1 });

            const repo = freshRepo();
            repo.update('Alice', '02-02', '+999', 'personal');

            expect(mockStmts.update.run).toHaveBeenCalledWith('02-02', '+999', 'personal', 'Alice');
        });

        test('should strip spaces from phone number on update', () => {
            mockStmts.update.run.mockReturnValue({ changes: 1 });

            const repo = freshRepo();
            repo.update('Alice', '02-02', '+49 999 000', 'personal');

            expect(mockStmts.update.run).toHaveBeenCalledWith('02-02', '+49999000', 'personal', 'Alice');
        });

        test('should throw when birthday not found', () => {
            mockStmts.update.run.mockReturnValue({ changes: 0 });

            const repo = freshRepo();
            expect(() => repo.update('Unknown', '01-01', null, 'generated')).toThrow('not found');
        });
    });

    describe('remove', () => {
        test('should return true when birthday is deleted', () => {
            mockStmts.delete.run.mockReturnValue({ changes: 1 });

            const repo = freshRepo();
            expect(repo.remove('Alice')).toBe(true);
            expect(mockStmts.delete.run).toHaveBeenCalledWith('Alice');
        });

        test('should return false when birthday does not exist', () => {
            const repo = freshRepo();
            expect(repo.remove('NotHere')).toBe(false);
        });
    });

    describe('exportJSON', () => {
        test('should return pretty-printed JSON with birthdays array', () => {
            const rows = [{ name: 'Alice', date: '01-01', phone: '+111', type: 'personal' }];
            mockStmts.getAll.all.mockReturnValue(rows);

            const repo = freshRepo();
            const result = repo.exportJSON();
            const parsed = JSON.parse(result);

            expect(parsed).toHaveProperty('birthdays');
            expect(parsed.birthdays).toEqual(rows);
        });

        test('should return empty birthdays array when no entries', () => {
            const repo = freshRepo();
            const parsed = JSON.parse(repo.exportJSON());
            expect(parsed.birthdays).toEqual([]);
        });
    });

    describe('importJSON', () => {
        test('should upsert all valid entries and return count', () => {
            const entries = [
                { name: 'Alice', date: '01-01', phone: '+111', type: 'personal' },
                { name: 'Bob',   date: '15-06', phone: '+222', type: 'generated' },
            ];

            const repo = freshRepo();
            const count = repo.importJSON(entries);

            expect(mockStmts.upsert.run).toHaveBeenCalledTimes(2);
            expect(count).toBe(2);
        });

        test('should skip entries missing name or date', () => {
            const entries = [
                { name: 'Alice', date: '01-01', phone: '+111', type: 'personal' },
                { phone: '+222' },           // missing name
                { name: 'Charlie' },         // missing date
            ];

            const repo = freshRepo();
            const count = repo.importJSON(entries);

            expect(mockStmts.upsert.run).toHaveBeenCalledTimes(1);
            expect(count).toBe(1);
        });

        test('should strip spaces from phone numbers during import', () => {
            const entries = [{ name: 'Alice', date: '01-01', phone: '+49 123 456', type: 'generated' }];

            const repo = freshRepo();
            repo.importJSON(entries);

            expect(mockStmts.upsert.run).toHaveBeenCalledWith('Alice', '01-01', '+49123456', 'generated');
        });

        test('should default type to generated when missing', () => {
            const entries = [{ name: 'Alice', date: '01-01', phone: '+111' }];

            const repo = freshRepo();
            repo.importJSON(entries);

            expect(mockStmts.upsert.run).toHaveBeenCalledWith('Alice', '01-01', '+111', 'generated');
        });

        test('should return 0 for empty array', () => {
            const repo = freshRepo();
            expect(repo.importJSON([])).toBe(0);
        });
    });

    describe('_loadFromFile', () => {
        test('should skip when birthdays.json does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            freshRepo();

            expect(fs.readFileSync).not.toHaveBeenCalled();
            expect(mockStmts.upsert.run).not.toHaveBeenCalled();
        });

        test('should skip when birthdays array is empty', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify({ birthdays: [] }));

            freshRepo();

            expect(mockStmts.upsert.run).not.toHaveBeenCalled();
        });

        test('should upsert all entries from birthdays.json on startup', () => {
            const data = {
                birthdays: [
                    { name: 'Alice', date: '01-01', phone: '+49 111', type: 'personal' },
                    { name: 'Bob',   date: '15-06', phone: '+222',    type: 'generated' },
                ],
            };
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(data));

            freshRepo();

            expect(mockStmts.upsert.run).toHaveBeenCalledTimes(2);
            expect(mockStmts.upsert.run).toHaveBeenCalledWith('Alice', '01-01', '+49111', 'personal');
            expect(mockStmts.upsert.run).toHaveBeenCalledWith('Bob',   '15-06', '+222',   'generated');
        });

        test('should handle plain array format (not wrapped in { birthdays })', () => {
            const data = [
                { name: 'Alice', date: '01-01', phone: '+111', type: 'personal' },
            ];
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(data));

            freshRepo();

            expect(mockStmts.upsert.run).toHaveBeenCalledWith('Alice', '01-01', '+111', 'personal');
        });

        test('should handle missing phone gracefully', () => {
            const data = { birthdays: [{ name: 'Alice', date: '01-01', type: 'personal' }] };
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(data));

            freshRepo();

            expect(mockStmts.upsert.run).toHaveBeenCalledWith('Alice', '01-01', null, 'personal');
        });

        test('should log and not throw on parse errors', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');

            expect(() => freshRepo()).not.toThrow();

            const loggerExports = require.cache[require.resolve('../../src/utils/logger')].exports;
            expect(loggerExports.error).toHaveBeenCalled();
        });
    });
});
