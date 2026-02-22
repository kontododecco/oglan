const cheerio = require('cheerio');
const { fetchPage, BASE_URL } = require('./http');

async function metaHandler({ type, id }) {
  // id = "oa:some-anime-slug"
  const slug = id.replace('oa:', '');
  const html = await fetchPage(`/anime/${slug}`);
  const $ = cheerio.load(html);

  // ── Dane podstawowe ────────────────────────────────────────────────────────
  const name = $('h1, .anime-title').first().text().trim()
    || $('title').text().split(' - ')[0].trim();

  // Poster – szukamy pierwszego dużego obrazka
  let poster = '';
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    poster = ogImage;
  } else {
    const img = $('.anime-poster img, .cover img, .poster img').first();
    poster = img.attr('src') || img.attr('data-src') || '';
    if (poster && !poster.startsWith('http')) poster = `${BASE_URL}${poster}`;
  }

  // Fallback do CDN (wiemy że obrazki są w formacie /images/anime_new/{id}/0.webp)
  if (!poster) {
    const imgAny = $('img[src*="anime_new"]').first();
    poster = imgAny.attr('src') || '';
  }

  // ── Opis ───────────────────────────────────────────────────────────────────
  let description = '';
  // szukamy bloku opisu – OA używa różnych klas
  const descCandidates = [
    '.description', '.synopsis', '.anime-description',
    '[itemprop="description"]', '.anime-desc', '.desc'
  ];
  for (const sel of descCandidates) {
    const text = $(sel).first().text().trim();
    if (text && text.length > 30) {
      description = text;
      break;
    }
  }

  // ── Gatunek / tags ─────────────────────────────────────────────────────────
  const genres = [];
  $('a[href*="/genre/"], a[href*="gatunek"], .genre a, .genres a').each((i, el) => {
    const g = $(el).text().trim();
    if (g) genres.push(g);
  });

  // ── Rok / status ───────────────────────────────────────────────────────────
  let year;
  const yearMatch = html.match(/Start emisji:\s*(\d{4})/);
  if (yearMatch) year = parseInt(yearMatch[1]);

  // ── Odcinki ────────────────────────────────────────────────────────────────
  const videos = [];
  // Numeracja odcinków w linkach: /anime/{slug}/1, /anime/{slug}/2 ...
  // OA renderuje listę odcinków jako liczby w przyciskach/linkach
  const epNumbers = new Set();

  $(`a[href^="/anime/${slug}/"]`).each((i, el) => {
    const href = $(el).attr('href') || '';
    const epMatch = href.match(/\/anime\/.+?\/(\d+)$/);
    if (epMatch) {
      epNumbers.add(parseInt(epMatch[1]));
    }
  });

  // Jeśli strona nie załadowała odcinków przez JS (rzadkie) – parsujemy tekst
  if (epNumbers.size === 0) {
    // Szukamy tekstów "Odcinek X" lub liczb w liście
    $('a, button, span').each((i, el) => {
      const text = $(el).text().trim();
      if (/^\d+$/.test(text)) {
        const num = parseInt(text);
        if (num > 0 && num < 5000) epNumbers.add(num);
      }
    });
  }

  const sortedEps = Array.from(epNumbers).sort((a, b) => a - b);
  sortedEps.forEach(ep => {
    videos.push({
      id: `${id}:${ep}`,
      title: `Odcinek ${ep}`,
      season: 1,
      episode: ep,
      released: new Date().toISOString() // brak daty per odcinek na stronie
    });
  });

  const meta = {
    id,
    type: videos.length === 1 ? 'movie' : 'series',
    name,
    poster,
    background: poster,
    description,
    genres,
    year,
    videos: videos.length > 0 ? videos : undefined
  };

  // Usuń undefined pola
  Object.keys(meta).forEach(k => meta[k] === undefined && delete meta[k]);

  return { meta };
}

module.exports = { metaHandler };
