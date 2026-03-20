const fs = require('fs');
const path = require('path');
const db = require('./database');
const logger = require('../utils/logger');

db.run(`
    CREATE TABLE IF NOT EXISTS birthdays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        phone TEXT,
        type TEXT NOT NULL DEFAULT 'generated'
    )
`);

const _getAll    = db.prepare('SELECT name, date, phone, type FROM birthdays ORDER BY substr(date,4,2), substr(date,1,2)');
const _getByName = db.prepare('SELECT name, date, phone, type FROM birthdays WHERE lower(name) = lower(?)');
const _insert    = db.prepare('INSERT INTO birthdays (name, date, phone, type) VALUES (?, ?, ?, ?)');
const _update    = db.prepare('UPDATE birthdays SET date = ?, phone = ?, type = ? WHERE lower(name) = lower(?)');
const _delete    = db.prepare('DELETE FROM birthdays WHERE lower(name) = lower(?)');
const _upsert    = db.prepare('INSERT INTO birthdays (name, date, phone, type) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET date=excluded.date, phone=excluded.phone, type=excluded.type');

// Wrap bulk upserts in a transaction for atomicity and performance
const _bulkUpsert = db.transaction((entries) => {
    for (const b of entries) {
        const phone = b.phone ? b.phone.replace(/\s+/g, '') : null;
        _upsert.run(b.name, b.date, phone, b.type || 'generated');
    }
});

// On startup: if birthdays.json exists, seed the DB from it (upsert so restarts are idempotent)
function _loadFromFile() {
    const file = path.join(__dirname, '../../birthdays.json');
    if (!fs.existsSync(file)) return;
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const entries = Array.isArray(raw) ? raw : (raw.birthdays || []);
        if (entries.length === 0) return;
        const valid = entries.filter(b => b.name && b.date);
        _bulkUpsert(valid);
        logger.info(`Loaded ${entries.length} birthdays from birthdays.json`);
    } catch (error) {
        logger.error('Failed to load birthdays from birthdays.json', error);
    }
}

_loadFromFile();

module.exports = {
    /** Return all birthdays sorted by month/day */
    getAll() {
        return _getAll.all();
    },

    /** Return a single birthday entry by name (case-insensitive), or null */
    getByName(name) {
        return _getByName.get(name) ?? null;
    },

    /** Add a new birthday — throws if the name already exists */
    add(name, date, phone, type = 'generated') {
        const cleanPhone = phone ? phone.replace(/\s+/g, '') : null;
        _insert.run(name, date, cleanPhone, type);
    },

    /** Update an existing birthday — throws if name not found */
    update(name, date, phone, type) {
        const cleanPhone = phone ? phone.replace(/\s+/g, '') : null;
        const info = _update.run(date, cleanPhone, type, name);
        if (info.changes === 0) throw new Error(`Birthday for "${name}" not found`);
    },

    /** Remove a birthday by name — returns true if deleted, false if not found */
    remove(name) {
        const info = _delete.run(name);
        return info.changes > 0;
    },

    /**
     * Export all birthdays as a JSON string (pretty-printed).
     * Suitable for writing to a file or sending via chat.
     */
    exportJSON() {
        return JSON.stringify({ birthdays: _getAll.all() }, null, 2);
    },

    /**
     * Import birthdays from a parsed array.  Existing entries with the same
     * name are updated; new ones are inserted.
     * Returns the number of records processed.
     */
    importJSON(birthdaysArray) {
        const valid = birthdaysArray.filter(b => b.name && b.date);
        _bulkUpsert(valid);
        return valid.length;
    },
};
