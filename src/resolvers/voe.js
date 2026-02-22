const { client } = require('../http');

/**
 * VOE.sx resolver
 */
async function resolveVoe(url) {
  const { data } = await client.get(url, {
    headers: { 'Referer': 'https://ogladajanime.pl/' }
  });

  // VOE: sources = {'mp4': 'https://...', 'hls': 'https://...m3u8'}
  const sourcesMatch = data.match(/sources\s*=\s*({[^}]+})/);
  if (sourcesMatch) {
    try {
      // Konwertuj obiekt JS do JSON (single → double quotes)
      const jsonStr = sourcesMatch[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
      const sources = JSON.parse(jsonStr);

      // Preferuj HLS
      if (sources.hls) {
        return {
          url: sources.hls,
          name: 'OgladajAnime',
          title: '📺 VOE (HLS)',
          behaviorHints: { notWebReady: false }
        };
      }
      if (sources.mp4) {
        return {
          url: sources.mp4,
          name: 'OgladajAnime',
          title: '📺 VOE',
          behaviorHints: { notWebReady: false }
        };
      }
    } catch (e) {}
  }

  // Fallback
  const mp4Match = data.match(/["']https?:\/\/[^"']+\.mp4[^"']*["']/);
  if (mp4Match) {
    const u = mp4Match[0].replace(/["']/g, '');
    return {
      url: u,
      name: 'OgladajAnime',
      title: '📺 VOE',
      behaviorHints: { notWebReady: false }
    };
  }

  throw new Error('VOE: nie znaleziono źródła');
}

module.exports = resolveVoe;
