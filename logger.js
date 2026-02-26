/**
 * Logger (SHARED — do not edit from multiple sessions)
 * Used by: server.js, storage.js, ALL route files, ALL agent files
 * Exports: info(), warn(), error(), debug(), getLogPath()
 *
 * Writes JSON lines to data/scraper.log. Errors also go to console.error.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(LOG_DIR, 'scraper.log');

function log(level, source, message, data) {
  const ts = new Date().toISOString();
  const entry = { ts, level, source, message };
  if (data !== undefined) entry.data = data;
  const line = JSON.stringify(entry);
  fs.appendFileSync(LOG_FILE, line + '\n');
  if (level === 'error') {
    console.error(`[${source}] ${message}`, data || '');
  } else {
    console.log(`[${source}] ${message}`);
  }
}

module.exports = {
  info: (source, msg, data) => log('info', source, msg, data),
  warn: (source, msg, data) => log('warn', source, msg, data),
  error: (source, msg, data) => log('error', source, msg, data),
  debug: (source, msg, data) => log('debug', source, msg, data),
  getLogPath: () => LOG_FILE,
};
