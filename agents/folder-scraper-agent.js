/**
 * Agent: Folder Ad Importer
 * Route: routes/folder-scraper.js → POST /api/containers/:id/folder-scrape
 * Deps: config, storage, logger, fs, path
 * Stores: storage.scrape_results[] (reuses existing CRUD)
 *
 * Scans data/uploads/<containerId>/ for image files and optional ads.csv.
 * Builds ad objects matching scrape_result schema with source: 'folder'.
 */
const log = require('../logger');
const storage = require('../storage');
const path = require('path');
const fs = require('fs');

const SRC = 'FolderScraper';

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const AGENT_META = {
  id: 'folder-scraper',
  name: 'Folder Ad Importer',
  code: 'ag0021',
  description: 'Imports ad images from a local folder with optional CSV metadata',
  category: 'collection',
  model: 'none',
  inputs: [{ name: 'containerId', type: 'string', required: true, from: null }],
  consumes: [],
  outputs: { storageKey: 'scrape_results', dataType: 'json', schema: 'ScrapeResult' },
  ui: { visible: true },
  prompt_summary: 'No AI prompt — scans data/uploads/<containerId>/ for image files and optional ads.csv. Builds ad objects matching scrape schema with source folder.',
};

/**
 * Check upload folder status
 */
function checkFolderStatus(containerId) {
  const folderPath = path.join(UPLOADS_DIR, containerId);
  if (!fs.existsSync(folderPath)) {
    return { exists: false, file_count: 0, files: [], has_csv: false };
  }

  const allFiles = fs.readdirSync(folderPath);
  const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  const hasCsv = allFiles.some(f => f.toLowerCase() === 'ads.csv');

  return {
    exists: true,
    file_count: imageFiles.length,
    files: imageFiles,
    has_csv: hasCsv,
  };
}

/**
 * Parse ads.csv — simple CSV parser handling quoted fields
 */
function parseCsv(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Import ads from folder
 */
async function importFromFolder(containerId) {
  const folderPath = path.join(UPLOADS_DIR, containerId);
  if (!fs.existsSync(folderPath)) {
    throw new Error('Upload folder does not exist: ' + folderPath);
  }

  const allFiles = fs.readdirSync(folderPath);
  const imageFiles = allFiles.filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  if (imageFiles.length === 0) {
    throw new Error('No image files found in upload folder');
  }

  // Parse CSV if present
  const csvPath = path.join(folderPath, 'ads.csv');
  let csvRows = [];
  if (fs.existsSync(csvPath)) {
    csvRows = parseCsv(csvPath);
    log.info(SRC, `Parsed ads.csv: ${csvRows.length} rows`);
  }

  // Build CSV lookup by filename
  const csvByFile = {};
  for (const row of csvRows) {
    if (row.filename) {
      csvByFile[row.filename.toLowerCase()] = row;
    }
  }

  // Read container to get my_product name as fallback
  const container = storage.readContainer(containerId);
  const defaultCompetitorName = container?.my_product?.name || 'Unknown';

  // Create scrape result
  const scrape = storage.createScrapeResult(containerId, { trigger: 'folder' });
  if (!scrape) throw new Error('Failed to create scrape result');

  log.info(SRC, `Created scrape ${scrape.id} for folder import`, { files: imageFiles.length });

  // Build ads grouped by competitor_name
  const adsByEntry = {}; // entryKey -> ads[]

  for (const file of imageFiles) {
    const csvRow = csvByFile[file.toLowerCase()] || {};
    const competitorName = csvRow.competitor_name || defaultCompetitorName;

    // Determine entry key — match to container entries
    let entryKey = 'my_product';
    if (container?.competitors) {
      const match = container.competitors.find(c =>
        c.name && c.name.toLowerCase() === competitorName.toLowerCase()
      );
      if (match) {
        entryKey = match.id || match.name;
      } else if (competitorName !== defaultCompetitorName) {
        entryKey = competitorName;
      }
    }

    if (!adsByEntry[entryKey]) adsByEntry[entryKey] = [];

    const ad = {
      advertiser_name: competitorName,
      ad_text: csvRow.description || null,
      headline: csvRow.title || null,
      cta_text: csvRow.cta || null,
      media_url: `/data/uploads/${containerId}/${file}`,
      media_type: 'image',
      destination_url: csvRow.url || null,
      started_running: null,
      screenshot_path: `/data/uploads/${containerId}/${file}`,
      local_media_path: `/data/uploads/${containerId}/${file}`,
      platform: null,
      raw_html: null,
      extra_data: {
        source: 'folder',
        original_filename: file,
      },
    };

    adsByEntry[entryKey].push(ad);
  }

  // Add ads to scrape result using existing storage functions
  let totalAds = 0;
  for (const [entryKey, ads] of Object.entries(adsByEntry)) {
    storage.addScrapeData(containerId, scrape.id, entryKey, 'facebook', ads);
    totalAds += ads.length;
    log.info(SRC, `Added ${ads.length} ads for entry "${entryKey}"`);
  }

  // Mark completed
  storage.updateScrapeStatus(containerId, scrape.id, 'completed');
  log.info(SRC, `Folder import complete: ${totalAds} ads from ${imageFiles.length} files`);

  return { scrape_id: scrape.id, total_ads: totalAds };
}

module.exports = { importFromFolder, checkFolderStatus, AGENT_META };
