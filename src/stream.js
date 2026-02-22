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
    if (!url || url === 'about:blank' || seen.has(url)) return;
    seen.add(url);
    embeds.push({ url, label: label || 'Player' });
  };

  // 1. Główny iframe playera OA (#playerFrame) – wypełniany przez JS po kliknięciu
  const playerFrame = $('#playerFrame');
  const playerSrc = playerFrame.attr('src') || '';
  if (playerSrc && playerSrc !== 'about:blank') {
    const fullSrc = playerSrc.startsWith('//') ? 'https:' + playerSrc : playerSrc;
    addEmbed(fullSrc, 'VK Player');
  }

  // 2. Video.js player (#newPlayer) – może mieć src bezpośrednio
  const newPlayer = $('#newPlayer');
  const videoSrc = newPlayer.attr('src') || newPlayer.find('source').attr('src') || '';
  if (videoSrc) addEmbed(videoSrc, 'Direct');

  // data-setup na video.js
  const dataSetup = newPlayer.attr('data-setup') || '';
  if (dataSetup) {
    try {
      const setup = JSON.parse(dataSetup);
      const src = setup.sources?.[0]?.src || setup.src || '';
      if (src) addEmbed(src, 'Direct');
    } catch (e) {}
  }

  // 3. Wszystkie inne iframe z zewnętrznych hostingów (fallback)
  const VIDEO_HOSTS = /vk\.com|vkvideo\.ru|vidoza|ebd\.cda\.pl|cda\.pl\/video|mp4upload|sibnet|doodstream|dood\.|streamtape|voe\.sx|filemoon|youtube\.com\/embed/;
  $('iframe[src]').each((i, el) => {
    const src = $(el).attr('src') || '';
    const fullSrc = src.startsWith('//') ? 'https:' + src : src;
    if (fullSrc && VIDEO_HOSTS.test(fullSrc)) addEmbed(fullSrc, `Player ${embeds.length + 1}`);
  });

  // 4. Skrypty – szukaj VK URL i innych hostingów
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    if (!content.includes('vk.com') && !content.includes('vidoza') && !content.includes('cda') && !content.match(/\.mp4/)) return;
    const patterns = [
      /(https?:\\?\/\\?\/(?:vk\.com|vkvideo\.ru)\\?\/video_ext\.php\?[^"'\s<>\\]+)/g,
      /(https?:\/\/(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?[^"'\s<>]+)/g,
      /(https?:\/\/(?:vidoza\.net|ebd\.cda\.pl|mp4upload\.com|video\.sibnet\.ru|doodstream\.com|streamtape\.com|voe\.sx|filemoon\.sx)[^"'\s<>]+)/g,
      /(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]{0,100})/g,
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const url = m[1].replace(/\\\//g, '/');
        addEmbed(url, `Script Player`);
      }
    }
  });

  // Debug: pokaż fragmenty HTML zawierające VK lub video
  if (embeds.length === 0) {
    const rawHtml = html.replace(/\s+/g, ' ');
    const vkIdx = rawHtml.toLowerCase().indexOf('vk.com');
    const videoIdx = rawHtml.toLowerCase().indexOf('video_ext');
    const iframeIdx = rawHtml.toLowerCase().indexOf('iframe');
    console.log(`[stream] DEBUG vk.com pos: ${vkIdx}, video_ext pos: ${videoIdx}, iframe pos: ${iframeIdx}`);
    if (vkIdx > -1) console.log(`[stream] VK context: ${rawHtml.substring(Math.max(0, vkIdx-50), vkIdx+200)}`);
    if (iframeIdx > -1) console.log(`[stream] iframe context: ${rawHtml.substring(iframeIdx, iframeIdx+300)}`);

    // Pokaż skrypty zawierające słowa kluczowe związane z playerem
    $('script').each((i, el) => {
      const content = $(el).html() || '';
      if (content.includes('playerFrame') || content.includes('watchepisode') || content.includes('player') && content.includes('episode')) {
        const preview = content.replace(/\s+/g, ' ').substring(0, 500);
        console.log(`[stream] Script ${i}: ${preview}`);
      }
    });
  }

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
