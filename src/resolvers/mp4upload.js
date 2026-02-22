const { client } = require('../http');

/**
 * mp4upload.com resolver
 */
async function resolveMp4upload(url) {
  // Konwertuj do embed URL jeśli trzeba
  let embedUrl = url;
  if (url.includes('/v/')) {
    embedUrl = url.replace('/v/', '/embed-') + '.html';
  }

  const { data } = await client.get(embedUrl, {
    headers: {
      'Referer': 'https://ogladajanime.pl/'
    }
  });

  // mp4upload trzyma źródła w jwplayer setup
  // jwplayer("playerXXX").setup({"file":"https://...mp4"...})
  const jwMatch = data.match(/jwplayer\([^)]+\)\.setup\(({[\s\S]*?})\)/);
  if (jwMatch) {
    try {
      const config = JSON.parse(jwMatch[1]);
      const file = config.file || (config.sources && config.sources[0] && config.sources[0].file);
      if (file && file.startsWith('http')) {
        return {
          url: file,
          name: 'OgladajAnime',
          title: '📺 MP4Upload',
          behaviorHints: { notWebReady: false }
        };
      }
    } catch (e) {}
  }

  // Alternatywne wzorce
  const patterns = [
    /["']?file["']?\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/i,
    /src\s*=\s*["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/i,
  ];

  for (const p of patterns) {
    const m = data.match(p);
    if (m) {
      return {
        url: m[1],
        name: 'OgladajAnime',
        title: '📺 MP4Upload',
        behaviorHints: { notWebReady: false }
      };
    }
  }

  throw new Error('MP4Upload: nie znaleziono źródła');
}

module.exports = resolveMp4upload;
