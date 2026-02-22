const { client } = require('../http');

/**
 * StreamTape resolver
 */
async function resolveStreamtape(url) {
  const idMatch = url.match(/streamtape\.com\/(?:v|e|play)\/([a-zA-Z0-9]+)/);
  if (!idMatch) throw new Error('StreamTape: nie znaleziono ID');

  const embedUrl = `https://streamtape.com/e/${idMatch[1]}`;
  const { data } = await client.get(embedUrl, {
    headers: { 'Referer': 'https://ogladajanime.pl/' }
  });

  // StreamTape obfuskuje link przez JS concat
  // Pattern: document.getElementById('ideoooolink').innerHTML = "//streamtape.com/get_video?id=...&expires=...&ip=...&token=...".substring(0)+'SUFFIX'
  const robotMatch = data.match(/getElementById\('ideoooolink'\)[^\n]*?"([^"]+)"\s*\+\s*'([^']+)'/);
  if (robotMatch) {
    const base = robotMatch[1];
    const suffix = robotMatch[2];
    const videoUrl = 'https:' + base.substring(2) + suffix;

    return {
      url: videoUrl,
      name: 'OgladajAnime',
      title: '📺 StreamTape',
      behaviorHints: { notWebReady: false }
    };
  }

  // Alternatywny pattern
  const altMatch = data.match(/get_video\?id=([^&"'\s]+)[^"']*["'].*?["']\s*\+\s*["']([^"']+)/);
  if (altMatch) {
    return {
      url: `https://streamtape.com/get_video?id=${altMatch[1]}${altMatch[2]}`,
      name: 'OgladajAnime',
      title: '📺 StreamTape',
      behaviorHints: { notWebReady: false }
    };
  }

  throw new Error('StreamTape: nie znaleziono źródła');
}

module.exports = resolveStreamtape;
