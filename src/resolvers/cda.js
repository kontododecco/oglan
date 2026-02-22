const { client } = require('../http');

/**
 * CDA.pl resolver
 * CDA szyfruje linki – trzeba pobrać stronę embed i wyciągnąć oraz zdekodować URL
 */

// Funkcja dekodująca URL z CDA (odwrócona inżynieria ich JS)
function decodeCdaUrl(encodedUrl) {
  // CDA stosuje wieloetapowe szyfrowanie
  // Krok 1: replace pairs of characters
  let url = encodedUrl;

  // Zamień zakodowane sekwencje
  const replacements = [
    ['_XDDD', '//'],
    ['_CDA', ''],
    ['_ADC', '?'],
    ['_QQQ', '='],
    ['_2QQQ', '=='],
    ['_ABCDE', '.'],
  ];

  replacements.forEach(([from, to]) => {
    url = url.split(from).join(to);
  });

  // Krok 2: rot13 na hostname (tylko litery, reszta bez zmian)
  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, c => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  // Krok 3: Reverse string segments (CDA stosuje to w niektórych wersjach)
  // Spróbuj zdekodować base64 jeśli jest zakodowany
  try {
    if (/^[A-Za-z0-9+/]+=*$/.test(url) && url.length % 4 === 0) {
      const decoded = Buffer.from(url, 'base64').toString('utf8');
      if (decoded.startsWith('http')) return decoded;
    }
  } catch (e) {}

  return url;
}

async function resolveCda(url) {
  // CDA embed URL: https://ebd.cda.pl/620x368/VIDEOID
  // lub: https://www.cda.pl/video/VIDEOID lub /embed/VIDEOID

  let videoId = '';

  // Wyciągnij ID
  const patterns = [
    /ebd\.cda\.pl\/\d+x\d+\/([a-zA-Z0-9]+)/,
    /cda\.pl\/video\/([a-zA-Z0-9]+)/,
    /cda\.pl\/embed\/([a-zA-Z0-9]+)/,
  ];

  for (const p of patterns) {
    const m = url.match(p);
    if (m) { videoId = m[1]; break; }
  }

  if (!videoId) throw new Error('CDA: nie znaleziono ID wideo');

  // Pobierz stronę embed
  const embedUrl = `https://ebd.cda.pl/750x420/${videoId}`;
  const { data } = await client.get(embedUrl, {
    headers: {
      'Referer': 'https://ogladajanime.pl/',
      'Origin': 'https://ogladajanime.pl'
    }
  });

  // CDA trzyma dane w: player_data = {...}
  const playerDataMatch = data.match(/player_data\s*=\s*({[\s\S]*?});/);
  if (playerDataMatch) {
    try {
      const playerData = JSON.parse(playerDataMatch[1]);
      const video = playerData.video || {};

      // Wybierz najlepszą jakość z dostępnych
      const qualities = ['1080', '720', '480', '360'];
      for (const q of qualities) {
        const key = `file${q}`;
        if (video[key]) {
          let fileUrl = video[key];

          // CDA szyfruje URL-e
          fileUrl = decodeCdaUrl(fileUrl);

          // Usuń 'a=2' na końcu jeśli istnieje (problem z przetwarzaniem)
          fileUrl = fileUrl.replace(/\?a=2$/, '');

          if (fileUrl.startsWith('http')) {
            return {
              url: fileUrl,
              name: 'OgladajAnime',
              title: `📺 CDA ${q}p`,
              behaviorHints: { notWebReady: false }
            };
          }
        }
      }

      // Próbuj 'file' bez jakości
      if (video.file) {
        let fileUrl = decodeCdaUrl(video.file);
        if (fileUrl.startsWith('http')) {
          return {
            url: fileUrl,
            name: 'OgladajAnime',
            title: '📺 CDA',
            behaviorHints: { notWebReady: false }
          };
        }
      }
    } catch (e) {
      console.error('CDA JSON parse error:', e.message);
    }
  }

  // Fallback: szukaj bezpośrednio w HTML
  const fileMatch = data.match(/"file"\s*:\s*"([^"]+)"/);
  if (fileMatch) {
    let fileUrl = decodeCdaUrl(fileMatch[1].replace(/\\u002F/g, '/'));
    if (fileUrl.startsWith('http')) {
      return {
        url: fileUrl,
        name: 'OgladajAnime',
        title: '📺 CDA',
        behaviorHints: { notWebReady: false }
      };
    }
  }

  // Ostateczny fallback – zwróć embed jako external
  return {
    externalUrl: embedUrl,
    name: 'OgladajAnime',
    title: '▶ CDA (zewnętrzny)'
  };
}

module.exports = resolveCda;
