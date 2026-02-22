const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA } = require('./http');
const { findOASlug } = require('./slug-resolver');

const JIKAN = 'https://api.jikan.moe/v4';

function parseId(id) {
  const raw = id.replace('oa:', '');
  if (/^\d+$/.test(raw)) return { type: 'mal', malId: raw };
  return { type: 'slug', slug: raw };
}

// Wyciągnij wewnętrzne ID anime OA ze strony (np. 16959 z obrazka anime_new/16959/)
function extractOAAnimeId(html) {
  const m = html.match(/anime_new\/(\d+)\//);
  return m ? m[1] : null;
}

async function metaHandler({ type, id }) {
  const parsed = parseId(id);
  let anime = null;
  let malId = null;

  if (parsed.type === 'mal') {
    malId = parsed.malId;
    try {
      const { data } = await axios.get(`${JIKAN}/anime/${malId}`, { timeout: 10000 });
      anime = data.data;
    } catch (e) {
      console.error(`Jikan fetch failed for MAL ${malId}: ${e.message}`);
    }
  } else {
    const titleQuery = parsed.slug.replace(/-/g, ' ');
    try {
      const { data } = await axios.get(`${JIKAN}/anime`, {
        params: { q: titleQuery, limit: 1, sfw: false }, timeout: 10000
      });
      anime = data.data?.[0] || null;
      malId = anime?.mal_id ? String(anime.mal_id) : parsed.slug;
    } catch (e) {
      malId = parsed.slug;
    }
  }

  const titleJp = anime?.title || '';
  const titleEn = anime?.title_english || '';
  const displayName = titleEn || titleJp || `Anime ${malId}`;

  const slug = await findOASlug(malId, titleJp, titleEn);

  // Pobierz stronę anime żeby wyciągnąć OA anime ID i listę odcinków
  let oaAnimeId = null;
  let epNumbers = [];

  try {
    const html = await fetchOA(`/anime/${slug}`);
    const $ = cheerio.load(html);

    // Wyciągnij OA anime ID z URL obrazka
    oaAnimeId = extractOAAnimeId(html);
    console.log(`[meta] OA anime ID: ${oaAnimeId} for slug "${slug}"`);

    // Odcinki są w <li> jako liczby – OA listuje je jako elementy numerowane
    // Struktura: <ul> z <li> gdzie tekst zaczyna się od numeru odcinka
    // Szukamy też linków /anime/{slug}/{n}
    const seen = new Set();

    // Metoda 1: bezpośrednie linki (rzadkie)
    $(`a[href^="/anime/${slug}/"]`).each((i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/anime\/.+?\/(\d+)$/);
      if (m) seen.add(parseInt(m[1]));
    });

    // Metoda 2: li z numerami odcinków (główna metoda OA)
    // OA renderuje listę: "* 0\n  Zapowiedź\n* 1\n  Koniec przygody..."
    // Każde <li> ma numer i tytuł
    $('li').each((i, el) => {
      const text = $(el).text().trim();
      const firstLine = text.split('\n')[0].trim();
      if (/^\d+$/.test(firstLine)) {
        const num = parseInt(firstLine);
        if (num >= 0 && num < 5000) seen.add(num);
      }
    });

    // Metoda 3: szukaj w JS – OA może mieć listę odcinków w skrypcie
    $('script').each((i, el) => {
      const content = $(el).html() || '';
      // Szukamy tablic z numerami odcinków lub obiektów episode
      const epListMatch = content.match(/episodes?\s*[=:]\s*(\[[\s\S]{0,2000}?\])/);
      if (epListMatch) {
        try {
          const arr = JSON.parse(epListMatch[1]);
          arr.forEach(ep => {
            const n = typeof ep === 'number' ? ep : (ep.number || ep.num || ep.episode);
            if (n && !isNaN(n)) seen.add(parseInt(n));
          });
        } catch (e) {}
      }
    });

    epNumbers = Array.from(seen).sort((a, b) => a - b);
    console.log(`[meta] Found ${epNumbers.length} episodes for "${slug}"`);
  } catch (e) {
    console.error(`[meta] OA fetch failed for "${slug}": ${e.message}`);
  }

  // Fallback z Jikan
  if (epNumbers.length === 0 && anime?.episodes > 0) {
    epNumbers = Array.from({ length: anime.episodes }, (_, i) => i + 1);
  }
  if (epNumbers.length === 0) epNumbers = [1];

  // ID odcinka zawiera OA anime ID i slug: oa:MALID:OAANIMEID:SLUG:EP
  const oaIdPart = oaAnimeId || '0';
  const videos = epNumbers.map(ep => ({
    id: `oa:${malId}:${oaIdPart}:${slug}:${ep}`,
    title: `Odcinek ${ep}`,
    season: 1,
    episode: ep,
    released: anime?.aired?.from
      ? new Date(anime.aired.from).toISOString()
      : new Date().toISOString()
  }));

  const meta = {
    id,
    type: anime?.type === 'Movie' ? 'movie' : 'series',
    name: displayName,
    poster: anime?.images?.jpg?.large_image_url,
    background: anime?.images?.jpg?.large_image_url,
    description: anime?.synopsis,
    genres: (anime?.genres || []).map(g => g.name),
    year: anime?.year || (anime?.aired?.from ? new Date(anime.aired.from).getFullYear() : undefined),
    imdbRating: anime?.score,
    videos
  };

  Object.keys(meta).forEach(k => (meta[k] === undefined || meta[k] === null) && delete meta[k]);
  return { meta };
}

module.exports = { metaHandler };
