const { client } = require('../http');

/**
 * FileMoon resolver
 */
async function resolveFilemoon(url) {
  const { data } = await client.get(url, {
    headers: { 'Referer': 'https://ogladajanime.pl/' }
  });

  // FileMoon: jwplayer setup lub sources array
  const jwMatch = data.match(/jwplayer\([^)]+\)\.setup\(({[\s\S]*?})\)/);
  if (jwMatch) {
    try {
      const config = JSON.parse(jwMatch[1]);
      const sources = config.sources || [];
      const best = sources.find(s => s.file && (s.file.includes('.m3u8') || s.file.includes('.mp4')));
      if (best) {
        return {
          url: best.file,
          name: 'OgladajAnime',
          title: `📺 FileMoon ${best.label || ''}`.trim(),
          behaviorHints: { notWebReady: false }
        };
      }
    } catch (e) {}
  }

  // Alternatywny wzorzec – sources bezpośrednio
  const sourcesMatch = data.match(/sources\s*:\s*\[([\s\S]*?)\]/);
  if (sourcesMatch) {
    const fileMatch = sourcesMatch[1].match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/);
    if (fileMatch) {
      return {
        url: fileMatch[1],
        name: 'OgladajAnime',
        title: '📺 FileMoon',
        behaviorHints: { notWebReady: false }
      };
    }
  }

  throw new Error('FileMoon: nie znaleziono źródła');
}

module.exports = resolveFilemoon;
