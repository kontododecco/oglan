const { client } = require('../http');

/**
 * DoodStream resolver
 * Dood stosuje token-based URL generowanie
 */
async function resolveDood(url) {
  // Normalizuj URL do /e/ embed
  let embedUrl = url;
  const idMatch = url.match(/dood(?:stream)?[^/]*\/(?:e|d|f|v|play)\/([a-zA-Z0-9]+)/);
  if (idMatch) {
    // Spróbuj różne domeny Dood
    const domains = ['dood.to', 'doodstream.com', 'dood.watch', 'dood.pm'];
    embedUrl = `https://${domains[0]}/e/${idMatch[1]}`;
  }

  const { data } = await client.get(embedUrl, {
    headers: { 'Referer': 'https://ogladajanime.pl/' }
  });

  // Dood: pass_md5 URL + token
  const passMd5Match = data.match(/\/pass_md5\/([^'"]+)/);
  const tokenMatch = data.match(/\?token=([a-zA-Z0-9]+)/);

  if (passMd5Match) {
    const passMd5 = passMd5Match[1];
    const token = tokenMatch ? tokenMatch[1] : '';

    // Pobierz token do MD5 URL
    const { data: tokenData } = await client.get(
      `https://dood.to/pass_md5/${passMd5}`,
      {
        headers: {
          'Referer': embedUrl
        }
      }
    );

    if (tokenData && tokenData.startsWith('http')) {
      const expiry = Date.now();
      const finalUrl = `${tokenData.trim()}${token}?token=${token}&expiry=${expiry}`;
      return {
        url: finalUrl,
        name: 'OgladajAnime',
        title: '📺 DoodStream',
        behaviorHints: { notWebReady: false }
      };
    }
  }

  throw new Error('DoodStream: nie znaleziono źródła');
}

module.exports = resolveDood;
