const moment = require('moment');
const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.LOG_FILE = path.join(__dirname, '../../bot.log');
    }

    log(message, level = 'INFO') {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        console.log(logMessage);
        
        // Append to log file
        try {
            fs.appendFileSync(this.LOG_FILE, logMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
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