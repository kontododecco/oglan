const { client } = require('../http');

/**
 * Vidoza resolver
 * Strona embeda zawiera JS z bezpośrednim linkiem do MP4
 */
async function resolveVidoza(url) {
  // Normalizuj URL do embed
  // https://vidoza.net/embed-XXXXX.html lub https://vidoza.net/XXXXX
  let embedUrl = url;
  if (!url.includes('/embed-')) {
    const idMatch = url.match(/vidoza\.net\/([a-zA-Z0-9]+)/);
    if (idMatch) {
      embedUrl = `https://vidoza.net/embed-${idMatch[1]}.html`;
    }
  }

  const { data } = await client.get(embedUrl, {
    headers: {
      'Referer': 'https://ogladajanime.pl/'
    }
  });

  // Vidoza trzyma źródło w JS: sourcesCode: [{"file":"https://...mp4","label":"1080p"}]
  const sourcesMatch = data.match(/sourcesCode\s*[:=]\s*(\[[\s\S]*?\])/);
  if (sourcesMatch) {
    try {
      const sources = JSON.parse(sourcesMatch[1]);
      if (Array.isArray(sources) && sources.length > 0) {
        // Wybierz najwyższą jakość
        const best = sources.sort((a, b) => {
          const qa = parseInt(a.label) || 0;
          const qb = parseInt(b.label) || 0;
          return qb - qa;
        })[0];

        return {
          url: best.file,
          name: 'OgladajAnime',
          title: `📺 Vidoza ${best.label || ''}`.trim(),
          behaviorHints: { notWebReady: false }
        };
      }
    } catch (e) {}
  }

  // Alternatywny wzorzec
  const fileMatch = data.match(/["']?file["']?\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*?)["']/i);
  if (fileMatch) {
    return {
      url: fileMatch[1],
      name: 'OgladajAnime',
      title: '📺 Vidoza',
      behaviorHints: { notWebReady: false }
    };
  }

  throw new Error('Vidoza: nie znaleziono źródła wideo');
}

module.exports = resolveVidoza;
