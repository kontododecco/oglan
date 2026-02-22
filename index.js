const express = require('express');
const cors = require('cors');
const { getManifest } = require('../src/manifest');
const { catalogHandler } = require('../src/catalog');
const { metaHandler } = require('../src/meta');
const { streamHandler } = require('../src/stream');

const app = express();
app.use(cors());
app.use(express.json());

// ── Manifest ──────────────────────────────────────────────────────────────────
app.get('/manifest.json', (req, res) => {
  res.json(getManifest());
});

// ── Catalog ───────────────────────────────────────────────────────────────────
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    const extra = req.query.extra ? JSON.parse(decodeURIComponent(req.query.extra)) : {};
    const result = await catalogHandler({ type, id, extra });
    res.json(result);
  } catch (e) {
    console.error('Catalog error:', e.message);
    res.json({ metas: [] });
  }
});

// ── Meta ──────────────────────────────────────────────────────────────────────
app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    const result = await metaHandler({ type, id });
    res.json(result);
  } catch (e) {
    console.error('Meta error:', e.message);
    res.json({ meta: null });
  }
});

// ── Stream ────────────────────────────────────────────────────────────────────
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params;
    const result = await streamHandler({ type, id });
    res.json(result);
  } catch (e) {
    console.error('Stream error:', e.message);
    res.json({ streams: [] });
  }
});

// ── Instalacja przez przeglądarkę ─────────────────────────────────────────────
app.get('/', (req, res) => {
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const addonUrl = `${protocol}://${host}/manifest.json`;
  const stremioUrl = `stremio://${host}/manifest.json`;

  res.send(`
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OgladajAnime.pl – Stremio Addon</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #0f0f1a;
      color: #e0e0f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid #2a2a4e;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    }
    h1 { font-size: 2rem; color: #a78bfa; margin-bottom: 8px; }
    .subtitle { color: #888; margin-bottom: 36px; font-size: 0.95rem; }
    .btn {
      display: block;
      width: 100%;
      padding: 14px 24px;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      margin-bottom: 14px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: #7c3aed; color: #fff; }
    .btn-secondary { background: #2a2a4e; color: #a78bfa; border: 1px solid #4a4a8e; }
    .url-box {
      background: #0f0f1a;
      border: 1px solid #2a2a4e;
      border-radius: 8px;
      padding: 10px 14px;
      font-family: monospace;
      font-size: 0.82rem;
      color: #888;
      word-break: break-all;
      margin-top: 24px;
      text-align: left;
    }
    .label { font-size: 0.75rem; color: #555; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎌 OgladajAnime</h1>
    <p class="subtitle">Nieoficjalny addon Stremio dla ogladajanime.pl</p>

    <a class="btn btn-primary" href="${stremioUrl}">
      ▶ Zainstaluj w Stremio
    </a>
    <a class="btn btn-secondary" href="${addonUrl}" target="_blank">
      📄 Pokaż manifest.json
    </a>

    <div class="url-box">
      <div class="label">URL do ręcznej instalacji:</div>
      ${addonUrl}
    </div>
  </div>
</body>
</html>
  `);
});

// ── Start lokalny ─────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 7000;
  app.listen(PORT, () => {
    console.log(`OgladajAnime Stremio Addon działa na http://localhost:${PORT}`);
    console.log(`Zainstaluj: stremio://localhost:${PORT}/manifest.json`);
  });
}

module.exports = app;
