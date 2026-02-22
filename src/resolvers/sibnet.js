const { client } = require('../http');

/**
 * Sibnet.ru resolver
 * Sibnet wymaga prawidłowego nagłówka Referer i User-Agent
 */
async function resolveSibnet(url) {
  const { data } = await client.get(url, {
    headers: {
      'Referer': 'https://ogladajanime.pl/',
      'Origin': 'https://ogladajanime.pl'
    }
  });

  // Sibnet: Player.add({"fileid":"12345",...})
  // lub: player.src([{src: "https://...mp4"}])
  const patterns = [
    /Player\.add\(({[\s\S]*?})\)/,
    /sibnet\.ru\/shell\.php\?videoid=(\d+)/,
    /["']src["']\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/i,
    /["']file["']\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/i,
  ];

  // Szukamy video ID w URL
  const videoIdMatch = url.match(/video\/(\d+)/);
  if (videoIdMatch) {
    const videoId = videoIdMatch[1];
    // Sibnet API do pobierania URLa
    try {
      const { data: apiData } = await client.get(
        `https://video.sibnet.ru/shell.php?videoid=${videoId}`,
        {
          headers: {
            'Referer': url,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          maxRedirects: 0,
          validateStatus: s => s < 400
        }
      );

      // Sibnet zwraca redirect do pliku MP4
      if (apiData && apiData.includes('.mp4')) {
        const mp4Match = apiData.match(/https?:\/\/[^"'\s]+\.mp4/);
        if (mp4Match) {
          return {
            url: mp4Match[0],
            name: 'OgladajAnime',
            title: '📺 Sibnet',
            behaviorHints: { notWebReady: false }
          };
        }
      }
    } catch (redirectErr) {
      // Sprawdź redirect location
      if (redirectErr.response && redirectErr.response.headers.location) {
        const loc = redirectErr.response.headers.location;
        if (loc.includes('.mp4')) {
          return {
            url: loc.startsWith('http') ? loc : `https://video.sibnet.ru${loc}`,
            name: 'OgladajAnime',
            title: '📺 Sibnet',
            behaviorHints: { notWebReady: false }
          };
        }
      }
    }
  }

  // Fallback – parsuj HTML
  for (const p of patterns) {
    const m = data.match(p);
    if (m && m[1] && m[1].startsWith('http')) {
      return {
        url: m[1],
        name: 'OgladajAnime',
        title: '📺 Sibnet',
        behaviorHints: { notWebReady: false }
      };
    }
  }

  throw new Error('Sibnet: nie znaleziono źródła');
}

module.exports = resolveSibnet;
