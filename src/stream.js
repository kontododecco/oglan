const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA, BASE_URL } = require('./http');
const resolvers = require('./resolvers');

/**
 * ID odcinka format: "oa:MAL_ID:OA_SLUG:EPISODE_NUMBER"
 * np. "oa:52991:sousou-no-frieren-2nd-season:5"
 *
 * Slug jest zakodowany w ID przez meta handler, więc tu nie musimy go szukać.
 */

async function getPlayerLinks(slug, episode) {
  let html;
  try {
    html = await fetchOA(`/anime/${slug}/${episode}`);
  } catch (e) {
    console.error(`[stream] Episode page fetch failed for ${slug}/${episode}: ${e.message}`);
    return [];
  }

  const $ = cheerio.load(html);

  // Sprawdź czy dostaliśmy właściwą stronę (nie redirect na główną)
  // Jeśli URL strony to "/" lub strona nie zawiera linków do tego slug – to redirect
  const hasEpisodeContent = $(`a[href^="/anime/${slug}/"], [href*="watchepisode"], .player, #player, .video`).length > 0;
  if (!hasEpisodeContent) {
    console.warn(`[stream] Page for ${slug}/${episode} looks like a redirect/404, no episode content found`);
    // Loguj fragment HTML żeby zobaczyć co dostaliśmy
    const preview = $.html().replace(/\s+/g, ' ').substring(0, 500);
    console.log(`[stream] Page preview: ${preview}`);
    return [];
  }

  const playerLinks = [];
  const seen = new Set();

  // Linki do playerów: /?action=anime&id=X&watchepisode=Y&subaction=player
  $('a[href*="watchepisode="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    if (!seen.has(href)) {
      seen.add(href);
      const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const label = $(el).text().trim() || `Player ${playerLinks.length + 1}`;
      playerLinks.push({ url: fullUrl, label });
    }
  });

  // Szukaj też w atrybutach onclick / data-*
  $('[onclick*="watchepisode"], [data-watchepisode]').each((i, el) => {
    const onclick = $(el).attr('onclick') || '';
    const epId = $(el).attr('data-watchepisode');
    const animeId = $(el).attr('data-id') || $(el).attr('data-anime-id');

    const urlMatch = onclick.match(/watchepisode=(\d+)/);
    const idMatch = onclick.match(/[&?]id=(\d+)/);

    const wId = epId || (urlMatch && urlMatch[1]);
    const aId = animeId || (idMatch && idMatch[1]);

    if (wId && aId) {
      const url = `${BASE_URL}/?action=anime&id=${aId}&watchepisode=${wId}&subaction=player`;
      if (!seen.has(url)) {
        seen.add(url);
        playerLinks.push({ url, label: $(el).text().trim() || `Player ${playerLinks.length + 1}` });
      }
    }
  });

  // Szukaj w skryptach
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    if (!content.includes('watchepisode')) return;

    // Wyciągnij pary animeId + watchepisodeId
    const animeIdMatch = content.match(/[&?]id=(\d+)/);
    const animeId = animeIdMatch ? animeIdMatch[1] : null;

    const watchMatches = content.matchAll(/watchepisode[=:](\d+)/g);
    for (const m of watchMatches) {
      if (animeId) {
        const url = `${BASE_URL}/?action=anime&id=${animeId}&watchepisode=${m[1]}&subaction=player`;
        if (!seen.has(url)) {
          seen.add(url);
          playerLinks.push({ url, label: `Player ${playerLinks.length + 1}` });
        }
      }
    }
  });

  console.log(`[stream] Found ${playerLinks.length} player links for ${slug}/${episode}`);
  if (playerLinks.length > 0) {
    console.log(`[stream] First link: ${playerLinks[0].url}`);
  }
  return playerLinks;
}

async function getEmbedFromPlayerPage(playerUrl) {
  let html;
  try {
    html = await fetchOA(playerUrl);
  } catch (e) {
    console.error(`[stream] Player page fetch failed: ${e.message}`);
    return null;
  }

  const $ = cheerio.load(html);

  // Szukamy iframe z zewnętrznym hostem
  let embedUrl = null;
  $('iframe[src]').each((i, el) => {
    if (embedUrl) return;
    const src = $(el).attr('src') || '';
    if (src && !src.includes('ogladajanime.pl') && src.startsWith('http')) {
      embedUrl = src;
    } else if (src && src.startsWith('//')) {
      embedUrl = 'https:' + src;
    }
  });
  if (embedUrl) return embedUrl;

  // Szukamy w skryptach
  const scripts = $('script').map((i, el) => $(el).html() || '').get().join('\n');
  const patterns = [
    /["'](https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]{0,100})["']/i,
    /file\s*[=:]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
    /src\s*[=:]\s*["'](https?:\/\/(?:vidoza|cda|mp4upload|sibnet|dood|streamtape|voe|filemoon)[^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = scripts.match(p);
    if (m) return m[1];
  }

  console.warn(`[stream] No embed found in player page: ${playerUrl.substring(0, 100)}`);
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
      if (result) {
        result.title = `${result.title || hosting} [${label}]`;
        return result;
      }
    } catch (e) {
      console.error(`[stream] Resolver ${hosting} failed: ${e.message}`);
    }
  }

  return { externalUrl: embedUrl, name: 'OgladajAnime', title: `▶ ${label} (${hosting})` };
}

async function streamHandler({ type, id }) {
  // id format: "oa:MAL_ID:OA_SLUG:EPISODE"
  const parts = id.split(':');
  if (parts.length < 4) {
    console.error(`[stream] Invalid ID format: ${id}`);
    return { streams: [] };
  }

  const slug = parts[2];
  const episode = parts[3];

  const playerLinks = await getPlayerLinks(slug, episode);
  if (playerLinks.length === 0) return { streams: [] };

  const streams = [];
  const results = await Promise.allSettled(
    playerLinks.slice(0, 5).map(async ({ url, label }) => {
      const embedUrl = await getEmbedFromPlayerPage(url);
      if (!embedUrl) return null;
      return resolveEmbed(embedUrl, label);
    })
  );

  results.forEach(r => { if (r.status === 'fulfilled' && r.value) streams.push(r.value); });
  console.log(`[stream] Returning ${streams.length} streams for ${slug} ep ${episode}`);
  return { streams };
}

module.exports = { streamHandler };
