const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class HistoryService {
    constructor() {
        this.HISTORY_FILE = path.join(__dirname, '../../history.json');
        this.history = this.loadHistory();
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.HISTORY_FILE)) {
                const data = fs.readFileSync(this.HISTORY_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error('Error loading history file', error);
        }
        return { sentMessages: [] };
    }

    saveHistory() {
        try {
            fs.writeFileSync(this.HISTORY_FILE, JSON.stringify(this.history, null, 2));
        } catch (error) {
            logger.error('Error saving history file', error);
        }
    }

    hasSentMessage(name, year) {
        return this.history.sentMessages.some(
            msg => msg.name === name && msg.year === year
        );
    }

    markAsSent(name, year, type) {
        this.history.sentMessages.push({
            name,
            year,
            type,
            timestamp: new Date().toISOString()
        });
        this.saveHistory();
    }
}

module.exports = new HistoryService();
