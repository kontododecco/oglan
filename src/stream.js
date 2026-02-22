const cheerio = require('cheerio');
const { fetchOA, BASE_URL } = require('./http');
const resolvers = require('./resolvers');

function parseStreamId(id) {
  const parts = id.split(':');
  if (parts.length === 5) return { oaAnimeId: parts[2], slug: parts[3], episode: parts[4] };
  if (parts.length === 4) return { oaAnimeId: null, slug: parts[2], episode: parts[3] };
  if (parts.length === 3) return { oaAnimeId: null, slug: parts[1], episode: parts[2] };
  return null;
}

function detectHosting(url) {
  if (!url) return 'unknown';
  if (url.includes('vk.com') || url.includes('vkvideo.ru')) return 'vk';
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

/**
 * Pobierz stronę odcinka z render=true (JavaScript wykonany przez ScraperAPI).
 * Szukamy iframe z playerem lub linków watchepisode.
 */
async function getEmbedsFromEpisodePage(slug, episode) {
  let html;
  try {
    // render=true – ScraperAPI wykona JS i zwróci w pełni wyrenderowaną stronę
    html = await fetchOA(`/anime/${slug}/${episode}`, { render: true });
  } catch (e) {
    console.error(`[stream] Episode page fetch failed: ${e.message}`);
    return [];
  }

  const $ = cheerio.load(html);
  const embeds = [];
  const seen = new Set();

  const addEmbed = (url, label) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    embeds.push({ url, label: label || 'Player' });
  };

  // 1. iframe z zewnętrznym playerem (po wykonaniu JS powinny być widoczne)
  $('iframe[src]').each((i, el) => {
    const src = $(el).attr('src') || '';
    if (src && !src.includes('ogladajanime')) {
      addEmbed(src.startsWith('//') ? 'https:' + src : src, `Player ${embeds.length + 1}`);
    }
  });

  // 2. Linki watchepisode (dla fallbacku bez render)
  $('a[href*="watchepisode="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/watchepisode=(\d+)/);
    const idM = href.match(/[&?]id=(\d+)/);
    if (m && idM) {
      const playerUrl = `${BASE_URL}/?action=anime&id=${idM[1]}&watchepisode=${m[1]}&subaction=player`;
      addEmbed(playerUrl, $(el).text().trim() || `Player ${embeds.length + 1}`);
    }
  });

  // 3. data-src, data-url na elementach
  $('[data-src], [data-url], [data-file]').each((i, el) => {
    const src = $(el).attr('data-src') || $(el).attr('data-url') || $(el).attr('data-file') || '';
    if (src && src.startsWith('http')) addEmbed(src, `Player ${embeds.length + 1}`);
  });

  // 4. Szukaj URL-i hostingów bezpośrednio w skryptach
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    const patterns = [
      // VK
      /(https?:\/\/(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?[^"'\s]+)/g,
      // Inne hostingi
      /(https?:\/\/(?:vidoza|ebd\.cda|mp4upload|sibnet|doodstream|dood\.|streamtape|voe\.sx|filemoon)[^"'\s]+)/g,
      // Bezpośrednie MP4
      /(https?:\/\/[^"'\s]+\.mp4[^"'\s]{0,50})/g,
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(content)) !== null) {
        addEmbed(m[1], `Player ${embeds.length + 1}`);
      }
    }
  });

  console.log(`[stream] Found ${embeds.length} embeds for ${slug}/${episode}`);
  embeds.forEach(e => console.log(`[stream]  → ${e.url.substring(0, 100)}`));
  return embeds;
}

/**
 * Jeśli embed to URL strony playera OA (watchepisode), pobierz z niej iframe.
 */
async function resolveOAPlayerPage(playerUrl) {
  try {
    const html = await fetchOA(playerUrl, { render: false });
    const $ = cheerio.load(html);
    let found = null;
    $('iframe[src]').each((i, el) => {
      if (found) return;
      const src = $(el).attr('src') || '';
      if (src && !src.includes('ogladajanime')) {
        found = src.startsWith('//') ? 'https:' + src : src;
      }
    });
    if (found) return found;

    // Szukaj w skryptach
    const scripts = $('script').map((i, el) => $(el).html() || '').get().join('\n');
    for (const p of [
      /(https?:\/\/(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?[^"'\s]+)/,
      /(https?:\/\/[^"'\s]+\.mp4[^"'\s]{0,50})/,
    ]) {
      const m = scripts.match(p);
      if (m) return m[1];
    }
  } catch (e) {
    console.error(`[stream] Player page error: ${e.message}`);
  }
  return null;
}

async function resolveEmbed(embedUrl, label) {
  // Jeśli to URL strony OA playera (watchepisode) – najpierw pobierz rzeczywisty embed
  let finalUrl = embedUrl;
  if (embedUrl.includes('ogladajanime.pl') && embedUrl.includes('watchepisode')) {
    finalUrl = await resolveOAPlayerPage(embedUrl);
    if (!finalUrl) return { externalUrl: embedUrl, name: 'OgladajAnime', title: `▶ ${label}` };
  }

  const hosting = detectHosting(finalUrl);
  if (hosting === 'direct') {
    return { url: finalUrl, name: 'OgladajAnime', title: `📺 ${label}`, behaviorHints: { notWebReady: false } };
  }

  const resolver = resolvers[hosting];
  if (resolver) {
    try {
      const result = await resolver(finalUrl);
      if (result) { result.title = `${result.title} [${label}]`; return result; }
    } catch (e) {
      console.error(`[stream] Resolver ${hosting} failed: ${e.message}`);
    }
  }

  return { externalUrl: finalUrl, name: 'OgladajAnime', title: `▶ ${label} (${hosting})` };
}

async function streamHandler({ type, id }) {
  const parsed = parseStreamId(id);
  if (!parsed) { console.error(`[stream] Bad ID: ${id}`); return { streams: [] }; }

  const { slug, episode } = parsed;
  const embeds = await getEmbedsFromEpisodePage(slug, episode);
  if (embeds.length === 0) return { streams: [] };

  const results = await Promise.allSettled(
    embeds.slice(0, 5).map(({ url, label }) => resolveEmbed(url, label))
  );

  const streams = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  console.log(`[stream] Returning ${streams.length} streams for ${slug} ep ${episode}`);
  return { streams };
}

module.exports = { streamHandler };
