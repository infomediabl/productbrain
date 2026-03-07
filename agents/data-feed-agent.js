/**
 * Agent: User Data Feed (AG-024)
 * Route: routes/data-feed.js → POST /api/containers/:id/data-feed
 * Deps: config, storage, logger, parse-json, gather-data
 * Stores: storage.data_feeds[]
 *
 * Parses uploaded CSV data, stores preview rows, and runs AI analysis
 * to extract summary, insights, and key metrics.
 */
const log = require('../logger');
const storage = require('../storage');
const config = require('../config');
const { parseJsonFromResponse } = require('../utils/parse-json');
const { gatherContainerContext } = require('../utils/gather-data');
const Anthropic = require('@anthropic-ai/sdk');

const SRC = 'DataFeedAgent';

const AGENT_META = {
  id: 'data-feed',
  name: 'User Data Feed',
  code: 'ag0024',
  description: 'Analyzes uploaded CSV data to extract insights and key metrics',
  category: 'analysis',
  model: 'AI_MODEL',
  inputs: [
    { name: 'containerId', type: 'string', required: true, from: null },
    { name: 'csv_text', type: 'string', required: true, from: null },
    { name: 'filename', type: 'string', required: false, from: null },
  ],
  consumes: [
    { agent: 'container-context', dataKey: 'container_context', description: 'Product context for analysis' },
  ],
  outputs: { storageKey: 'data_feeds', dataType: 'json', schema: 'DataFeed' },
  ui: { visible: true },
  prompt_summary: 'Parses CSV, stores preview, sends data to AI for summary/insights/metrics analysis.',
  prompt_template: `SYSTEM: You are a data analyst. Analyze CSV data and produce actionable insights.

USER:
Analyze this CSV data in the context of our marketing project.

## Product Context
[product name, description, competitors]

## CSV Data
Filename: [filename]
Columns: [column names]
Rows: [row count]

### Sample Data (first 50 rows)
[CSV rows]

## Task
Analyze this data and return JSON:
{
  "summary": "2-3 sentence overview of what this data contains and key takeaways",
  "insights": ["insight 1", "insight 2", ...],
  "key_metrics": [
    { "label": "metric name", "value": "metric value", "interpretation": "what it means" }
  ]
}`,
};

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };

  // Simple CSV parser — handles quoted fields
  function parseLine(line) {
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
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const columns = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length > 0 && fields.some(f => f)) {
      const row = {};
      columns.forEach((col, idx) => { row[col] = fields[idx] || ''; });
      rows.push(row);
    }
  }
  return { columns, rows };
}

async function analyzeDataFeed(containerId, { csv_text, filename = 'upload.csv' }) {
  const container = storage.readContainer(containerId);
  if (!container) throw new Error('Container not found');
  if (!csv_text || !csv_text.trim()) throw new Error('CSV text is required');

  const { columns, rows } = parseCsv(csv_text);
  if (columns.length === 0) throw new Error('Could not parse CSV columns');

  const previewRows = rows.slice(0, 50);

  const record = await storage.addDataFeed(containerId, {
    filename,
    row_count: rows.length,
    columns,
    preview_rows: previewRows,
  });
  if (!record) throw new Error('Failed to create data feed record');

  // Fire and forget
  (async () => {
    try {
      const product = container.my_product;
      const contextItems = gatherContainerContext(container);

      let productSection = 'No product defined.';
      if (product) {
        productSection = `Product: ${product.name || 'N/A'}`;
        if (product.website) productSection += ` (${product.website})`;
        if (product.description) productSection += `\n${product.description}`;
      }

      const contextSection = contextItems.length > 0
        ? contextItems.slice(0, 10).map(c => `- [${c.source_type}] ${(c.text_brief || '').slice(0, 100)}`).join('\n')
        : '';

      // Format sample data as table
      const sampleCsv = [columns.join(',')];
      for (const row of previewRows) {
        sampleCsv.push(columns.map(c => row[c] || '').join(','));
      }

      const prompt = `Analyze this CSV data in the context of our marketing project.

## Product Context
${productSection}
${contextSection ? `\n## Additional Context\n${contextSection}` : ''}

## CSV Data
Filename: ${filename}
Columns: ${columns.join(', ')}
Total rows: ${rows.length}

### Sample Data (first ${previewRows.length} rows)
${sampleCsv.join('\n')}

## Task
Analyze this data and produce actionable insights for our marketing strategy. Look for patterns, anomalies, and opportunities.

Return JSON:
{
  "summary": "2-3 sentence overview of what this data contains and key takeaways",
  "insights": ["actionable insight 1", "actionable insight 2", ...],
  "key_metrics": [
    { "label": "metric name", "value": "metric value", "interpretation": "what it means for our strategy" }
  ]
}

Be specific and reference actual column names and values. Provide 4-8 insights and 3-6 key metrics.`;

      const client = new Anthropic();
      const message = await client.messages.create({
        model: config.AI_MODEL,
        max_tokens: config.DEFAULT_MAX_TOKENS,
        system: 'You are a data analyst specializing in marketing data. Always respond with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = message.content[0].text;
      const parsed = parseJsonFromResponse(raw);

      if (parsed && parsed.summary) {
        parsed.prompt_sent = prompt;
        await storage.updateDataFeed(containerId, record.id, 'completed', parsed);
        log.info(SRC, 'Data feed analysis completed', { containerId, feedId: record.id, rows: rows.length });
      } else {
        await storage.updateDataFeed(containerId, record.id, 'failed', { error: 'Failed to parse AI response' });
      }
    } catch (err) {
      log.error(SRC, 'Data feed analysis failed', { containerId, feedId: record.id, err: err.message });
      await storage.updateDataFeed(containerId, record.id, 'failed', { error: err.message });
    }
  })();

  return record;
}

module.exports = { analyzeDataFeed, parseCsv, AGENT_META };
