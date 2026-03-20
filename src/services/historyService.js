const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const db = require('../config/database');

class HistoryService {
    constructor() {
        db.run(`
            CREATE TABLE IF NOT EXISTS sent_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                year INTEGER NOT NULL,
                type TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        `);
        this._checkSent = db.prepare(
            'SELECT 1 AS found FROM sent_messages WHERE name = ? AND year = ?'
        );
        this._insertSent = db.prepare(
            'INSERT INTO sent_messages (name, year, type, timestamp) VALUES (?, ?, ?, ?)'
        );
        this._migrateFromFile();
    }

    _migrateFromFile() {
        const historyFile = path.join(__dirname, '../../history.json');
        if (!fs.existsSync(historyFile)) return;
        try {
            const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            for (const msg of data.sentMessages || []) {
                this._insertSent.run(msg.name, msg.year, msg.type, msg.timestamp);
            }
            fs.renameSync(historyFile, historyFile + '.migrated');
            logger.info('Migrated history.json to SQLite database');
        } catch (error) {
            logger.error('Failed to migrate history.json', error);
        }
    }

    hasSentMessage(name, year) {
        return this._checkSent.get(name, year) !== null;
    }

    markAsSent(name, year, type) {
        this._insertSent.run(name, year, type, new Date().toISOString());
    }
}

module.exports = new HistoryService();
