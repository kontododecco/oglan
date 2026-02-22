const cheerio = require('cheerio');
const { fetchPage, client, BASE_URL } = require('./http');
const resolvers = require('./resolvers');

// Wyciąga wszystkie embeddy z strony odcinka OA
async function getEmbeds(slug, episode) {
  const url = `/anime/${slug}/${episode}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const embeds = [];

  // OA pokazuje playery jako iframe lub linki do playerów
  // Struktura: przyciski z nazwą hostingu, kliknięcie ładuje iframe

  // 1. Szukamy bezpośrednich iframe
  $('iframe[src]').each((i, el) => {
    const src = $(el).attr('src') || '';
    if (src && !src.includes('ogladajanime.pl')) {
      embeds.push({ url: src.startsWith('//') ? 'https:' + src : src });
    }
  });

  // 2. Szukamy linków do playerów w atrybutach data-*
  $('[data-src], [data-url], [data-player]').each((i, el) => {
    const src = $(el).attr('data-src') || $(el).attr('data-url') || $(el).attr('data-player') || '';
    if (src && src.includes('http')) {
      embeds.push({ url: src });
    }
  });

  // 3. Szukamy JSON z listą playerów zakodowanym w skrypcie
  // OA często trzyma dane playerów w <script> jako JSON lub JS object
  $('script').each((i, el) => {
    const content = $(el).html() || '';

    // Szukamy URL-i hostingów w skryptach
    const urlPatterns = [
      /["']https?:\/\/(www\.)?(vidoza|cda|mp4upload|sibnet|youtube|youtu\.be|dood|streamtape|voe|filemoon)[^"'\s]+["']/gi,
      /src\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
      /url\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
    ];

    urlPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let foundUrl = match[1] || match[0].replace(/["']/g, '');
        if (foundUrl && !embeds.find(e => e.url === foundUrl)) {
          embeds.push({ url: foundUrl });
        }
      }
    });

    // Szukamy tablicy playerów np. var players = [{...}]
    const playersMatch = content.match(/(?:players|films|sources)\s*=\s*(\[[\s\S]*?\])/);
    if (playersMatch) {
      try {
        const players = JSON.parse(playersMatch[1]);
        if (Array.isArray(players)) {
          players.forEach(p => {
            const u = p.url || p.src || p.file || p.link || '';
            if (u && u.startsWith('http')) embeds.push({ url: u });
          });
        }
      } catch (e) {}
    }
  });

  // 4. Próbujemy też bezpośrednio stronę playera przez URL watchepisode
  // Wyciągamy episode IDs z linków na stronie
  const epIds = [];
  $('a[href*="watchepisode="]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/watchepisode=(\d+)/);
    if (m) epIds.push(m[1]);
  });

  // Jeśli znaleziono episode ID, pobieramy stronę playera
  if (epIds.length > 0 && embeds.length === 0) {
    for (const epId of epIds.slice(0, 3)) {
      try {
        const playerHtml = await fetchPage(`/?action=anime&watchepisode=${epId}&subaction=player`);
        const $p = cheerio.load(playerHtml);

        $p('iframe[src]').each((i, el) => {
          const src = $p(el).attr('src') || '';
          if (src && !src.includes('ogladajanime')) {
            embeds.push({ url: src.startsWith('//') ? 'https:' + src : src });
          }
        });

        $p('script').each((i, el) => {
          const content = $p(el).html() || '';
          const fileMatch = content.match(/file\s*[:=]\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
          if (fileMatch) embeds.push({ url: fileMatch[1] });
        });
      } catch (e) {}
    }
  }

  // Deduplifikacja
  const seen = new Set();
  return embeds.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

// Wykrywa typ hostingu na podstawie URL
function detectHosting(url) {
  if (url.includes('vidoza')) return 'vidoza';
  if (url.includes('cda.pl') || url.includes('ebd.cda.pl')) return 'cda';
  if (url.includes('mp4upload')) return 'mp4upload';
  if (url.includes('sibnet')) return 'sibnet';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('doodstream') || url.includes('dood.')) return 'dood';
  if (url.includes('streamtape')) return 'streamtape';
  if (url.includes('voe.sx') || url.includes('voe.')) return 'voe';
  if (url.includes('filemoon')) return 'filemoon';
  if (url.includes('streamlare')) return 'streamlare';
  if (url.match(/\.mp4(\?|$)/i)) return 'direct';
  return 'unknown';
}

async function streamHandler({ type, id }) {
  // id format: "oa:anime-slug:episode-number"
  const parts = id.split(':');
  if (parts.length < 3) return { streams: [] };

  const slug = parts[1];
  const episode = parts[2];

  // Pobierz embeddy ze strony
  const embeds = await getEmbeds(slug, episode);
  console.log(`Found ${embeds.length} embeds for ${slug} ep ${episode}`);

  // Resolwuj każdy embed równolegle
  const streams = [];
  const resolvePromises = embeds.map(async (embed) => {
    const hosting = detectHosting(embed.url);

    // Direct MP4 – od razu dodaj
    if (hosting === 'direct') {
      return {
        url: embed.url,
        name: 'OgladajAnime',
        title: '📺 Direct MP4',
        behaviorHints: { notWebReady: false }
      };
    }

    // Nieznany hosting - spróbuj jako embed
    if (hosting === 'unknown') {
      return {
        externalUrl: embed.url,
        name: 'OgladajAnime',
        title: '🔗 Zewnętrzny player'
      };
    }

    // Resolwer
    const resolver = resolvers[hosting];
    if (!resolver) {
      // Brak resolwera – podaj jako external URL do otwarcia w przeglądarce
      return {
        externalUrl: embed.url,
        name: 'OgladajAnime',
        title: `▶ ${hosting.toUpperCase()}`
      };
    }

    try {
      const resolved = await resolver(embed.url);
      if (resolved) return resolved;
    } catch (e) {
      console.error(`Resolver ${hosting} failed for ${embed.url}:`, e.message);
      // Fallback do external URL
      return {
        externalUrl: embed.url,
        name: 'OgladajAnime',
        title: `▶ ${hosting.toUpperCase()} (zewnętrzny)`
      };
    }
  });

  const results = await Promise.allSettled(resolvePromises);
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) streams.push(r.value);
  });

  return { streams };
}

module.exports = { streamHandler };
