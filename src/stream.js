const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA, BASE_URL, BROWSER_HEADERS } = require('./http');
const resolvers = require('./resolvers');

/**
 * ID odcinka format: "oa:MALID:OAANIMEID:SLUG:EPISODE"
 * np.              "oa:52991:16959:sousou-no-frieren:1"
 *
 * Kompatybilność wsteczna:
 *   "oa:MALID:SLUG:EPISODE"  (stary format bez OA ID)
 *   "oa:SLUG:EPISODE"        (bardzo stary format)
 */
function parseStreamId(id) {
  const parts = id.split(':');
  // oa : MALID : OAANIMEID : SLUG : EP  => 5 części
  if (parts.length === 5) {
    const [, malId, oaAnimeId, slug, episode] = parts;
    return { malId, oaAnimeId, slug, episode };
  }
  // oa : MALID : SLUG : EP  => 4 części
  if (parts.length === 4) {
    const [, malId, slug, episode] = parts;
    return { malId, oaAnimeId: null, slug, episode };
  }
  // oa : SLUG : EP  => 3 części (stary format)
  if (parts.length === 3) {
    const [, slug, episode] = parts;
    return { malId: null, oaAnimeId: null, slug, episode };
  }
  return null;
}

/**
 * OA ładuje listę playerów przez AJAX endpoint:
 * POST /?action=anime lub GET /?action=ajax&task=get_players&id=ANIMEID&episode=EP
 *
 * Jeśli nie mamy OA anime ID, próbujemy pobrać stronę odcinka i znaleźć ID tam.
 */
async function getOAAnimeId(slug) {
  try {
    const html = await fetchOA(`/anime/${slug}`);
    const m = html.match(/anime_new\/(\d+)\//);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

/**
 * Pobierz listę watchepisode ID dla danego anime i numeru odcinka.
 * OA ma endpoint AJAX który zwraca listę playerów.
 */
async function getWatchEpisodeIds(oaAnimeId, episodeNumber, slug) {
  const scraperKey = process.env.SCRAPER_API_KEY;
  const epNum = parseInt(episodeNumber);

  // Endpoint 1: strona odcinka – szukamy linków watchepisode w HTML
  // (działa gdy odcinki są renderowane server-side dla niezalogowanych)
  try {
    const html = await fetchOA(`/anime/${slug}/${epNum}`);
    const $ = cheerio.load(html);
    const ids = [];

    $('a[href*="watchepisode="]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/watchepisode=(\d+)/);
      const idM = href.match(/[&?]id=(\d+)/);
      if (m) ids.push({ watchId: m[1], animeId: idM?.[1] || oaAnimeId, label: $(el).text().trim() || `Player ${ids.length+1}` });
    });

    if (ids.length > 0) {
      console.log(`[stream] Found ${ids.length} watchepisode IDs from episode page`);
      return ids;
    }
  } catch (e) {
    console.error(`[stream] Episode page fetch failed: ${e.message}`);
  }

  // Endpoint 2: AJAX z OA anime ID i numerem odcinka
  // Format URL: /?action=ajax&task=get_episode_players&anime_id=X&episode=Y
  if (oaAnimeId) {
    const ajaxUrls = [
      `${BASE_URL}/?action=ajax&task=get_episode_players&anime_id=${oaAnimeId}&episode=${epNum}`,
      `${BASE_URL}/?action=ajax&task=get_players&id=${oaAnimeId}&episode=${epNum}`,
      `${BASE_URL}/api/anime/${oaAnimeId}/episode/${epNum}`,
    ];

    for (const ajaxUrl of ajaxUrls) {
      try {
        let responseData;
        if (scraperKey) {
          const scraperUrl = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(ajaxUrl)}`;
          const { data } = await axios.get(scraperUrl, { timeout: 15000 });
          responseData = data;
        } else {
          const { data } = await axios.get(ajaxUrl, { headers: BROWSER_HEADERS, timeout: 10000 });
          responseData = data;
        }

        // Próbuj parsować jako JSON
        if (typeof responseData === 'object' && responseData !== null) {
          const players = responseData.players || responseData.data || responseData;
          if (Array.isArray(players) && players.length > 0) {
            return players.map((p, i) => ({
              watchId: p.watchepisode || p.id || p.episode_id,
              animeId: p.anime_id || oaAnimeId,
              label: p.name || p.label || `Player ${i+1}`
            })).filter(p => p.watchId);
          }
        }
      } catch (e) {
        // Spróbuj następny URL
      }
    }
  }

  return [];
}

async function getEmbedFromPlayerPage(watchId, animeId) {
  const playerUrl = `${BASE_URL}/?action=anime&id=${animeId}&watchepisode=${watchId}&subaction=player`;
  console.log(`[stream] Fetching player: ${playerUrl}`);

  let html;
  try {
    html = await fetchOA(playerUrl);
  } catch (e) {
    console.error(`[stream] Player fetch failed: ${e.message}`);
    return null;
  }

  const $ = cheerio.load(html);

  // iframe zewnętrzny
  let found = null;
  $('iframe[src]').each((i, el) => {
    if (found) return;
    const src = $(el).attr('src') || '';
    if (src && !src.includes('ogladajanime')) {
      found = src.startsWith('//') ? 'https:' + src : src;
    }
  });
  if (found) { console.log(`[stream] Found embed: ${found}`); return found; }

  // Skrypty
  const scripts = $('script').map((i, el) => $(el).html() || '').get().join('\n');
  for (const p of [
    /["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]{0,100})["']/i,
    /file\s*[=:]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
    /src\s*[=:]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
  ]) {
    const m = scripts.match(p);
    if (m) { console.log(`[stream] Found embed in script: ${m[1]}`); return m[1]; }
  }

  console.warn(`[stream] No embed found in player page ${watchId}`);
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
    return { url: embedUrl, name: 'OgladajAnime', title: `📺 ${label}`, behaviorHints: { notWebReady: false } };
  }
  const resolver = resolvers[hosting];
  if (resolver) {
    try {
      const result = await resolver(embedUrl);
      if (result) { result.title = `${result.title || hosting} [${label}]`; return result; }
    } catch (e) {
      console.error(`[stream] Resolver ${hosting} failed: ${e.message}`);
    }
  }
  return { externalUrl: embedUrl, name: 'OgladajAnime', title: `▶ ${label} (${hosting})` };
}

async function streamHandler({ type, id }) {
  const parsed = parseStreamId(id);
  if (!parsed) {
    console.error(`[stream] Cannot parse ID: ${id}`);
    return { streams: [] };
  }

  let { malId, oaAnimeId, slug, episode } = parsed;
  console.log(`[stream] Request: slug=${slug} oaId=${oaAnimeId} ep=${episode}`);

  // Jeśli brak OA anime ID, spróbuj pobrać ze strony
  if (!oaAnimeId || oaAnimeId === '0') {
    oaAnimeId = await getOAAnimeId(slug);
    console.log(`[stream] Fetched OA anime ID: ${oaAnimeId}`);
  }

  // Pobierz watchepisode IDs
  const watchIds = await getWatchEpisodeIds(oaAnimeId, episode, slug);

  if (watchIds.length === 0) {
    console.log(`[stream] No watchepisode IDs found for ${slug} ep ${episode}`);
    return { streams: [] };
  }

  console.log(`[stream] Processing ${watchIds.length} players`);

  // Pobierz embeddy i resolwuj
  const results = await Promise.allSettled(
    watchIds.slice(0, 5).map(async ({ watchId, animeId, label }) => {
      const embedUrl = await getEmbedFromPlayerPage(watchId, animeId || oaAnimeId);
      if (!embedUrl) return null;
      return resolveEmbed(embedUrl, label);
    })
  );

  const streams = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  console.log(`[stream] Returning ${streams.length} streams for ${slug} ep ${episode}`);
  return { streams };
}

module.exports = { streamHandler };
