const cheerio = require('cheerio');
const { fetchWithBrowser } = require('./browser');
const resolvers = require('./resolvers');

function parseStreamId(id) {
  const parts = id.split(':');
  if (parts.length === 5) return { slug: parts[3], episode: parts[4] };
  if (parts.length === 4) return { slug: parts[2], episode: parts[3] };
  if (parts.length === 3) return { slug: parts[1], episode: parts[2] };
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

const VIDEO_HOSTS = /vk\.com|vkvideo\.ru|vidoza|ebd\.cda\.pl|cda\.pl\/video|mp4upload|sibnet|doodstream|dood\.|streamtape|voe\.sx|filemoon|youtube\.com\/embed/;

function extractEmbedsFromHtml(html) {
  const $ = cheerio.load(html);
  const embeds = [];
  const seen = new Set();

  const add = (url, label) => {
    if (!url || url === 'about:blank' || seen.has(url)) return;
    if (url.includes('cdn.ogladajanime.pl')) return;
    seen.add(url);
    embeds.push({ url, label });
  };

  // 1. Główny iframe #playerFrame
  const pfSrc = $('#playerFrame').attr('src') || '';
  if (pfSrc && pfSrc !== 'about:blank') {
    add(pfSrc.startsWith('//') ? 'https:' + pfSrc : pfSrc, 'Player 1');
  }

  // 2. Wszystkie iframe z hostingów wideo
  $('iframe[src]').each((i, el) => {
    const src = $(el).attr('src') || '';
    const full = src.startsWith('//') ? 'https:' + src : src;
    if (VIDEO_HOSTS.test(full)) add(full, `Player ${embeds.length + 1}`);
  });

  // 3. Video.js #newPlayer
  const vSrc = $('#newPlayer').attr('src') || $('#newPlayer source').attr('src') || '';
  if (vSrc) add(vSrc, 'Direct');

  // 4. Skrypty – VK URL-e
  $('script').each((i, el) => {
    const c = $(el).html() || '';
    if (!c.includes('vk.com') && !c.includes('vidoza') && !c.includes('cda') && !c.match(/\.mp4/)) return;
    const patterns = [
      /(https?:\\?\/\\?\/(?:vk\.com|vkvideo\.ru)\\?\/video_ext\.php\?[^"'\s<>\\]+)/g,
      /(https?:\/\/(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?[^"'\s<>]+)/g,
      /(https?:\/\/(?:vidoza\.net|ebd\.cda\.pl|mp4upload\.com|video\.sibnet\.ru|doodstream\.com|streamtape\.com|voe\.sx|filemoon\.sx)[^"'\s<>]+)/g,
    ];
    for (const p of patterns) {
      let m;
      while ((m = p.exec(c)) !== null) {
        add(m[1].replace(/\\\//g, '/'), `Player ${embeds.length + 1}`);
      }
    }
  });

  return embeds;
}

async function getEpisodeEmbeds(slug, episode) {
  const url = `https://ogladajanime.pl/anime/${slug}/${episode}`;

  // Kliknij w pierwszy odcinek na liście żeby załadować player
  const { html, xhrRequests } = await fetchWithBrowser(url, {
    // Kliknij w aktywny odcinek (li.active lub pierwszy przycisk playera)
    clickSelector: '.episode-list li.active, .episode-list li:first-child, [data-episode], li.ep-active',
    waitFor: '#playerFrame[src]:not([src=""]), #newPlayer[src]',
  });

  let embeds = extractEmbedsFromHtml(html);

  // Fallback: sprawdź czy któryś XHR request to bezpośrednio URL embeda
  if (embeds.length === 0 && xhrRequests.length > 0) {
    console.log(`[stream] Sprawdzam ${xhrRequests.length} XHR requestów...`);
    for (const xhrUrl of xhrRequests) {
      if (VIDEO_HOSTS.test(xhrUrl)) {
        embeds.push({ url: xhrUrl, label: 'XHR Player' });
      }
    }
  }

  console.log(`[stream] ${embeds.length} embeds dla ${slug}/${episode}`);
  embeds.forEach(e => console.log(`[stream]  → ${e.url.substring(0, 100)}`));
  return embeds;
}

async function resolveEmbed({ url, label }) {
  const hosting = detectHosting(url);
  if (hosting === 'direct') {
    return { url, name: 'OgladajAnime', title: `📺 ${label}` };
  }
  const resolver = resolvers[hosting];
  if (resolver) {
    try {
      const result = await resolver(url);
      if (result) { result.title = `${result.title} [${label}]`; return result; }
    } catch (e) {
      console.error(`[stream] Resolver ${hosting} błąd: ${e.message}`);
    }
  }
  // Zwróć jako externalUrl żeby Stremio otworzyło w zewnętrznej przeglądarce
  return { externalUrl: url, name: 'OgladajAnime', title: `▶ ${label} (${hosting})` };
}

async function streamHandler({ type, id }) {
  const parsed = parseStreamId(id);
  if (!parsed) return { streams: [] };

  const { slug, episode } = parsed;
  console.log(`[stream] Request: ${slug} ep ${episode}`);

  const embeds = await getEpisodeEmbeds(slug, episode);
  if (embeds.length === 0) return { streams: [] };

  const results = await Promise.allSettled(
    embeds.slice(0, 5).map(e => resolveEmbed(e))
  );

  const streams = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  console.log(`[stream] Zwracam ${streams.length} streamów`);
  return { streams };
}

module.exports = { streamHandler };
