/**
 * Changelog Utility
 * Reads git log, tracks commits, and writes changelog to data/changelog.json.
 * Called at server startup to capture new commits since last run.
 *
 * Exports: updateChangelog(), getChangelog()
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHANGELOG_PATH = path.join(__dirname, '..', 'data', 'changelog.json');
const DATA_DIR = path.dirname(CHANGELOG_PATH);

function readChangelog() {
  try {
    if (!fs.existsSync(CHANGELOG_PATH)) return { entries: [], last_hash: null };
    const raw = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.entries)) return { entries: [], last_hash: null };
    return data;
  } catch {
    return { entries: [], last_hash: null };
  }
}

function writeChangelog(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function readGitCommits() {
  try {
    // Get last 200 commits in a parseable format
    const raw = execSync(
      'git log --pretty=format:"%H||%aI||%s||%an" -200',
      { encoding: 'utf8', timeout: 10000 }
    );
    if (!raw.trim()) return [];
    return raw.trim().split('\n').map(line => {
      const [hash, date, message, author] = line.split('||');
      return { type: 'commit', hash, date, message, author };
    });
  } catch {
    return [];
  }
}

function updateChangelog() {
  const changelog = readChangelog();
  const commits = readGitCommits();

  if (commits.length === 0) {
    // No git repo or no commits — just log an app_start
    changelog.entries.unshift({
      type: 'app_start',
      timestamp: new Date().toISOString(),
      new_commits: 0
    });
    writeChangelog(changelog);
    return 0;
  }

  // Save newest hash before any mutation
  const newestHash = commits[0].hash;

  // Find new commits since last_hash
  const newCommits = [];
  if (changelog.last_hash) {
    for (const c of commits) {
      if (c.hash === changelog.last_hash) break;
      newCommits.push(c);
    }
  } else {
    // First run — take all commits
    newCommits.push(...commits);
  }

  // Prepend app_start event, then new commits (newest first)
  const appStart = {
    type: 'app_start',
    timestamp: new Date().toISOString(),
    new_commits: newCommits.length
  };

  changelog.entries.unshift(...newCommits);
  changelog.entries.unshift(appStart);

  // Update last_hash to the most recent commit
  changelog.last_hash = newestHash;

  writeChangelog(changelog);
  return newCommits.length;
}

function getChangelog() {
  return readChangelog();
}

module.exports = { updateChangelog, getChangelog };
