/**
 * Google Ads OAuth Helper
 *
 * Generates a refresh token for the Google Ads API.
 * Run with: node google-auth-helper.js
 */

const http = require('http');
const { URL } = require('url');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nMissing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in .env\n');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error: ${error}</h2><p>Try again.</p>`);
    server.close();
    process.exit(1);
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>No authorization code received</h2>');
    return;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('\nToken exchange failed:', tokenData.error, tokenData.error_description);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error: ${tokenData.error}</h2><p>${tokenData.error_description || ''}</p>`);
      server.close();
      process.exit(1);
      return;
    }

    const refreshToken = tokenData.refresh_token;

    console.log('\n========================================');
    console.log('  SUCCESS! Here is your refresh token:');
    console.log('========================================\n');
    console.log(refreshToken);
    console.log('\nAdd this to your .env file:');
    console.log(`GOOGLE_ADS_REFRESH_TOKEN=${refreshToken}\n`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:20px;">
        <h2 style="color:green;">Success!</h2>
        <p>Your refresh token has been printed in the terminal.</p>
        <p>You can close this tab now.</p>
      </body></html>
    `);

    server.close();
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    console.error('\nFailed to exchange token:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error exchanging token</h2><p>${err.message}</p>`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  Google Ads OAuth Helper');
  console.log('========================================\n');
  console.log('Step 1: First, add this redirect URI in Google Cloud Console:');
  console.log(`        APIs & Services > Credentials > your OAuth Client > Authorized redirect URIs`);
  console.log(`        ${REDIRECT_URI}\n`);
  console.log('Step 2: Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nWaiting for Google callback...\n');
});
