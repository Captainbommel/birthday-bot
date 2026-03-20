const { Database } = require('bun:sqlite');
const path = require('path');

module.exports = new Database(path.join(__dirname, '../../bot.db'));
