const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname);
fs.mkdirSync(DB_DIR, { recursive: true }); // ensures folder exists

const db = new Database(path.join(DB_DIR, 'dungeon.db')); // ✅ absolute path

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
