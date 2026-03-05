#!/usr/bin/env node
/**
 * One-time script to seed Vercel Postgres from local data/*.json files.
 *
 * Usage:
 *   1. Set POSTGRES_URL in .env (or export it)
 *   2. Run: node scripts/seed-postgres.js
 *
 * Container files → `containers` table
 * web-research.json, desire-spring.json → `global_data` table
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

if (!process.env.POSTGRES_URL) {
  console.error('Error: POSTGRES_URL environment variable is not set.');
  console.error('Set it in .env or export it before running this script.');
  process.exit(1);
}

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

const DATA_DIR = path.join(__dirname, '..', 'data');
const GLOBAL_FILES = ['web-research', 'desire-spring'];
const SKIP_FILES = ['last_analysis.json', 'changelog.json'];

async function seed() {
  // Create tables
  await sql`CREATE TABLE IF NOT EXISTS containers (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS global_data (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  console.log('Tables ensured.');

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  let containerCount = 0;
  let globalCount = 0;

  for (const file of files) {
    if (SKIP_FILES.includes(file)) continue;

    const filePath = path.join(DATA_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.warn(`Skipping ${file}: invalid JSON`);
      continue;
    }

    const baseName = file.replace('.json', '');

    // Check if it's a global file
    if (GLOBAL_FILES.includes(baseName)) {
      await sql`INSERT INTO global_data (key, data, updated_at) VALUES (${baseName}, ${JSON.stringify(data)}, NOW()) ON CONFLICT (key) DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = NOW()`;
      globalCount++;
      console.log(`  Global: ${baseName}`);
    } else {
      // It's a container file
      const id = data.id || baseName;
      await sql`INSERT INTO containers (id, data, updated_at) VALUES (${id}, ${JSON.stringify(data)}, NOW()) ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(data)}, updated_at = NOW()`;
      containerCount++;
      console.log(`  Container: ${data.name || id}`);
    }
  }

  console.log(`\nDone! Seeded ${containerCount} containers + ${globalCount} global files.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
