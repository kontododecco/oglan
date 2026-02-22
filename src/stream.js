const cheerio = require('cheerio');
const { fetchOA, BASE_URL } = require('./http');
const resolvers = require('./resolvers');

/**
 * ID formaty obsługiwane:
 *   Nowy: "oa:MAL_ID:OA_SLUG:EPISODE"   np. "oa:52991:sousou-no-frieren:5"
 *   Stary: "oa:slug:episode"              np. "oa:frieren-beyond:5"
 */
function parseStreamId(id) {
  const parts = id.split(':');
  // oa : part1 : part2 : part3
  if (parts.length === 4) {
    // Nowy format: oa:MALID:SLUG:EP
    const [, malId, slug, episode] = parts;
    if (/^\d+$/.test(malId)) return { slug, episode };
    // Może to stary format z myślnikiem w slugu np oa:slug-with:colon:5 - edge case
  }
  if (parts.length === 3) {
    // Stary format: oa:slug:episode
    const [, slug, episode] = parts;
    return { slug, episode };
  }
  return null;
}

async function getPlayerLinks(slug, episode) {
  let html;
  try {
    html = await fetchOA(`/anime/${slug}/${episode}`);
  } catch (e) {
    console.error(`[stream] Fetch failed ${slug}/${episode}: ${e.message}`);
    return [];
  }

  const $ = cheerio.load(html);

  // Sprawdź czy to nie redirect na stronę główną
  const pageTitle = $('title').text().trim();
  const hasSlugLinks = $(`a[href^="/anime/${slug}/"]`).length > 0
    || $('a[href*="watchepisode"]').length > 0
    || $('[class*="player"], [id*="player"]').length > 0;

  if (!hasSlugLinks) {
    console.warn(`[stream] Got redirect/wrong page for ${slug}/${episode}. Title: "${pageTitle}"`);
    return [];
  }

  const playerLinks = [];
  const seen = new Set();

  $('a[href*="watchepisode="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (seen.has(href)) return;
    seen.add(href);
    const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const label = $(el).text().trim() || `Player ${playerLinks.length + 1}`;
    playerLinks.push({ url: fullUrl, label });
  });

  // onclick i data atrybuty
  $('[onclick*="watchepisode"], [data-watchepisode]').each((i, el) => {
    const onclick = $(el).attr('onclick') || '';
    const epId = $(el).attr('data-watchepisode');
    const animeId = $(el).attr('data-id') || $(el).attr('data-anime-id');
    const urlM = onclick.match(/watchepisode=(\d+)/);
    const idM = onclick.match(/[&?]id=(\d+)/);
    const wId = epId || (urlM && urlM[1]);
    const aId = animeId || (idM && idM[1]);
    if (wId && aId) {
      const url = `${BASE_URL}/?action=anime&id=${aId}&watchepisode=${wId}&subaction=player`;
      if (!seen.has(url)) {
        seen.add(url);
        playerLinks.push({ url, label: $(el).text().trim() || `Player ${playerLinks.length + 1}` });
      }
    }
  });

  // Skrypty JS
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    if (!content.includes('watchepisode')) return;
    const animeIdM = content.match(/[&?]id=(\d+)/);
    const animeId = animeIdM?.[1];
    if (!animeId) return;
    for (const m of content.matchAll(/watchepisode[=:](\d+)/g)) {
      const url = `${BASE_URL}/?action=anime&id=${animeId}&watchepisode=${m[1]}&subaction=player`;
      if (!seen.has(url)) {
        seen.add(url);
        playerLinks.push({ url, label: `Player ${playerLinks.length + 1}` });
      }
    }
  });

  console.log(`[stream] Found ${playerLinks.length} players for ${slug}/${episode}`);
  return playerLinks;
}

async function getEmbedFromPlayerPage(playerUrl) {
  let html;
  try {
    html = await fetchOA(playerUrl);
  } catch (e) {
    console.error(`[stream] Player page error: ${e.message}`);
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
  if (found) return found;

  // Skrypty - szukamy URL hostingów
  const scripts = $('script').map((i, el) => $(el).html() || '').get().join('\n');
  for (const p of [
    /["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]{0,100})["']/i,
    /file\s*[=:]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
    /src\s*[=:]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
  ]) {
    const m = scripts.match(p);
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

  const { slug, episode } = parsed;
  const playerLinks = await getPlayerLinks(slug, episode);
  if (playerLinks.length === 0) return { streams: [] };

  const results = await Promise.allSettled(
    playerLinks.slice(0, 5).map(async ({ url, label }) => {
      const embedUrl = await getEmbedFromPlayerPage(url);
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
