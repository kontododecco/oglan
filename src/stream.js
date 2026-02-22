const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA, BASE_URL, BROWSER_HEADERS } = require('./http');
const resolvers = require('./resolvers');

/**
 * Jak działa ogladajanime.pl:
 *
 * 1. Strona anime: /anime/{slug}
 *    - Zawiera listę odcinków jako linki /anime/{slug}/{ep}
 *    - Zawiera wewnętrzne ID anime (np. data-id lub w JS)
 *
 * 2. Strona odcinka: /anime/{slug}/{ep}
 *    - Zawiera listę playerów z ID odcinka w linkach:
 *      /?action=anime&id={animeId}&watchepisode={episodeId}&subaction=player
 *    - Każdy player to osobny link (różne hostingi)
 *
 * 3. Strona playera: /?action=anime&id=X&watchepisode=Y&subaction=player
 *    - Zwraca iframe lub bezpośredni link do hostingu
 */

// Pobierz stronę odcinka i wyciągnij linki do playerów
async function getPlayerLinks(slug, episode) {
  let html;
  try {
    html = await fetchOA(`/anime/${slug}/${episode}`);
  } catch (e) {
    console.error(`Episode page fetch failed: ${e.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const playerLinks = [];
  const seen = new Set();

  // Szukamy linków w formacie /?action=anime&id=X&watchepisode=Y&subaction=player
  $('a[href*="watchepisode="], a[href*="action=anime"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('watchepisode=') && !seen.has(href)) {
      seen.add(href);
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      const label = $(el).text().trim() || $(el).attr('title') || 'Player';
      playerLinks.push({ url: fullUrl, label });
    }
  });

  // Szukamy też w atrybutach data-*
  $('[data-watchepisode], [data-episode-id]').each((i, el) => {
    const epId = $(el).attr('data-watchepisode') || $(el).attr('data-episode-id');
    const animeId = $(el).attr('data-anime-id') || $(el).attr('data-id');
    if (epId && animeId) {
      const url = `${BASE_URL}/?action=anime&id=${animeId}&watchepisode=${epId}&subaction=player`;
      if (!seen.has(url)) {
        seen.add(url);
        playerLinks.push({ url, label: $(el).text().trim() || 'Player' });
      }
    }
  });

  // Szukaj w skryptach – OA może trzymać listę playerów w JS
  $('script').each((i, el) => {
    const content = $(el).html() || '';

    // Pattern: watchepisode=12345 w dowolnym kontekście
    const watchPattern = /watchepisode[=:](\d+)/g;
    const animeIdPattern = /(?:anime_id|animeId|&id=)[\s:='"]*(\d+)/;

    const animeIdMatch = content.match(animeIdPattern);
    const animeId = animeIdMatch ? animeIdMatch[1] : null;

    if (animeId) {
      let m;
      while ((m = watchPattern.exec(content)) !== null) {
        const epId = m[1];
        const url = `${BASE_URL}/?action=anime&id=${animeId}&watchepisode=${epId}&subaction=player`;
        if (!seen.has(url)) {
          seen.add(url);
          playerLinks.push({ url, label: 'Player' });
        }
      }
    }

    // Szukaj też tablicy playerów / JSON
    const jsonPatterns = [
      /players\s*=\s*(\[[\s\S]*?\]);/,
      /episodes\s*=\s*(\[[\s\S]*?\]);/,
      /var\s+\w+\s*=\s*(\[[\s\S]*?watchepisode[\s\S]*?\]);/,
    ];
    for (const pattern of jsonPatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const arr = JSON.parse(match[1]);
          arr.forEach(item => {
            const epId = item.watchepisode || item.episode_id || item.id;
            const aId = item.anime_id || item.animeId || animeId;
            if (epId && aId) {
              const url = `${BASE_URL}/?action=anime&id=${aId}&watchepisode=${epId}&subaction=player`;
              if (!seen.has(url)) {
                seen.add(url);
                playerLinks.push({ url, label: item.name || item.label || 'Player' });
              }
            }
          });
        } catch (e) {}
      }
    }
  });

  console.log(`Found ${playerLinks.length} player links for ${slug}/${episode}`);
  return playerLinks;
}

// Pobierz embed URL ze strony playera OA
async function getEmbedFromPlayerPage(playerUrl) {
  let html;
  try {
    html = await fetchOA(playerUrl);
  } catch (e) {
    console.error(`Player page fetch failed: ${e.message}`);
    return null;
  }

  const $ = cheerio.load(html);

  // Szukamy iframe z zewnętrznym hostem
  const iframe = $('iframe[src]').filter((i, el) => {
    const src = $(el).attr('src') || '';
    return src && !src.includes('ogladajanime.pl');
  }).first();

  if (iframe.length) {
    let src = iframe.attr('src') || '';
    if (src.startsWith('//')) src = 'https:' + src;
    return src;
  }

  // Szukamy bezpośrednich URL-i do plików wideo w skryptach
  const scripts = $('script').map((i, el) => $(el).html() || '').get().join('\n');

  const videoPatterns = [
    /["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)["']/i,
    /file\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
    /src\s*[:=]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
  ];

  for (const pattern of videoPatterns) {
    const m = scripts.match(pattern);
    if (m) return m[1];
  }

  return null;
}

function detectHosting(url) {
  if (!url) return 'unknown';
  if (url.includes('vidoza')) return 'vidoza';
  if (url.includes('cda.pl') || url.includes('ebd.cda.pl')) return 'cda';
  if (url.includes('mp4upload')) return 'mp4upload';
  if (url.includes('sibnet')) return 'sibnet';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('doodstream') || url.includes('dood.')) return 'dood';
  if (url.includes('streamtape')) return 'streamtape';
  if (url.includes('voe.sx') || url.includes('voe.')) return 'voe';
  if (url.includes('filemoon')) return 'filemoon';
  if (url.match(/\.mp4(\?|$)/i)) return 'direct';
  return 'unknown';
}

async function resolveEmbed(embedUrl, label) {
  const hosting = detectHosting(embedUrl);

  if (hosting === 'direct') {
    return { url: embedUrl, name: 'OgladajAnime', title: `📺 ${label || 'Direct'}`, behaviorHints: { notWebReady: false } };
  }

  const resolver = resolvers[hosting];
  if (resolver) {
    try {
      const result = await resolver(embedUrl);
      if (result) {
        result.title = `${result.title || ''} [${label}]`.trim();
        return result;
      }
    } catch (e) {
      console.error(`Resolver ${hosting} failed: ${e.message}`);
    }
  }

  // Fallback: zwróć embed jako external URL
  return {
    externalUrl: embedUrl,
    name: 'OgladajAnime',
    title: `▶ ${label || hosting.toUpperCase()}`,
  };
}

async function streamHandler({ type, id }) {
  // id format: "oa:anime-slug:episode-number"
  const parts = id.split(':');
  if (parts.length < 3) return { streams: [] };

  const slug = parts[1];
  const episode = parts[2];

  // Krok 1: pobierz linki do playerów ze strony odcinka
  const playerLinks = await getPlayerLinks(slug, episode);

  if (playerLinks.length === 0) {
    console.log(`No player links found for ${slug} ep ${episode}`);
    return { streams: [] };
  }

  // Krok 2: dla każdego playera pobierz embed URL (równolegle, max 5)
  const limited = playerLinks.slice(0, 5);
  const embedResults = await Promise.allSettled(
    limited.map(async ({ url, label }) => {
      const embedUrl = await getEmbedFromPlayerPage(url);
      return { embedUrl, label };
    })
  );

  // Krok 3: resolwuj każdy embed
  const streams = [];
  await Promise.allSettled(
    embedResults.map(async (result) => {
      if (result.status !== 'fulfilled' || !result.value.embedUrl) return;
      const { embedUrl, label } = result.value;
      const stream = await resolveEmbed(embedUrl, label);
      if (stream) streams.push(stream);
    })
  );

  console.log(`Returning ${streams.length} streams for ${slug} ep ${episode}`);
  return { streams };
}

module.exports = { streamHandler };
