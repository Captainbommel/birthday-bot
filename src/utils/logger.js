const moment = require('moment-timezone');
const db = require('../config/database');

class Logger {
    constructor() {
        db.run(`
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL
            )
        `);
        this._insert = db.prepare(
            'INSERT INTO logs (timestamp, level, message) VALUES (?, ?, ?)'
        );
    }

    log(message, level = 'INFO') {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        console.log(logMessage);
        
        try {
            this._insert.run(timestamp, level, message);
        } catch (error) {
            console.error('Failed to write to database:', error.message);
        }
    }

    info(message) {
        this.log(message, 'INFO');
    }

    error(message, error = null) {
        const errorMessage = error ? `${message}: ${error.message}` : message;
        this.log(errorMessage, 'ERROR');
    }

    warn(message) {
        this.log(message, 'WARN');
    }

    debug(message) {
        this.log(message, 'DEBUG');
    }
}

// Export singleton instance
module.exports = new Logger();