const axios = require('axios');
const cheerio = require('cheerio');
const { fetchPage, BASE_URL } = require('./http');

/**
 * KATALOG
 *
 * Problem: ogladajanime.pl zwraca 403 na requestach serwerowych do list anime
 * (np. /all_anime_list). Strona blokuje boty po User-Agencie lub IP Vercel.
 *
 * Rozwiązanie: Używamy Jikan API (oficjalne nieoficjalne MAL API, darmowe, bez klucza)
 * do pobierania katalogu i wyszukiwania. ID w formacie oa:<slug-mal-tytul> –
 * slug generujemy z tytułu anime (tak samo jak robi OA).
 *
 * Dla strony głównej OA (ogladajanime.pl/) działa scraping, bo jest to
 * publiczny render bez paginacji – tylko tę stronę używamy bezpośrednio.
 */

const JIKAN = 'https://api.jikan.moe/v4';

// Konwertuje tytuł anime na slug w stylu OA (małe litery, myślniki zamiast spacji/specjalnych)
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function makeId(slug) {
  return `oa:${slug}`;
}

// Konwertuje obiekt anime z Jikan na meta Stremio
function jikanToMeta(anime) {
  const slug = titleToSlug(anime.title_english || anime.title);
  const malId = anime.mal_id;

  return {
    id: makeId(slug),
    type: anime.type === 'Movie' ? 'movie' : 'series',
    name: anime.title_english || anime.title,
    poster: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
    posterShape: 'poster',
    description: anime.synopsis,
    genres: (anime.genres || []).map(g => g.name),
    year: anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : undefined),
    imdbRating: anime.score,
    // Trzymamy MAL ID w tle żeby meta handler mógł go użyć
    _malId: malId
  };
}

// Pobierz ostatnio emitowane anime z Jikan (sezonowe)
async function fetchLatest(skip = 0) {
  const page = Math.floor(skip / 25) + 1;
  try {
    const { data } = await axios.get(`${JIKAN}/seasons/now`, {
      params: { page, limit: 25 },
      timeout: 10000
    });
    return (data.data || []).map(jikanToMeta);
  } catch (e) {
    console.error('Jikan fetchLatest error:', e.message);
    return [];
  }
}

// Pobierz top anime z Jikan
async function fetchTop(skip = 0) {
  const page = Math.floor(skip / 25) + 1;
  try {
    const { data } = await axios.get(`${JIKAN}/top/anime`, {
      params: { page, limit: 25 },
      timeout: 10000
    });
    return (data.data || []).map(jikanToMeta);
  } catch (e) {
    console.error('Jikan fetchTop error:', e.message);
    return [];
  }
}

// Wyszukiwanie przez Jikan
async function fetchSearch(query) {
  try {
    const { data } = await axios.get(`${JIKAN}/anime`, {
      params: { q: query, limit: 20, sfw: false },
      timeout: 10000
    });
    return (data.data || []).map(jikanToMeta);
  } catch (e) {
    console.error('Jikan search error:', e.message);

    // Fallback: próbuj scraping strony głównej OA (działa bo nie jest stroną listową)
    try {
      const html = await fetchPage(`/?s=${encodeURIComponent(query)}`);
      return parseOAHomepage(html);
    } catch (e2) {
      return [];
    }
  }
}

// Parser strony głównej OA (fallback) – działa, bo główna strona nie jest blokowana
function parseOAHomepage(html) {
  const $ = cheerio.load(html);
  const metas = [];
  const seen = new Set();

  $('a[href^="/anime/"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/^\/anime\/([^\/]+)\/?$/);
    if (!match) return;

    const slug = match[1];
    if (seen.has(slug)) return;
    seen.add(slug);

    const img = $(el).find('img').first();
    let poster = img.attr('src') || img.attr('data-src') || '';
    if (poster && !poster.startsWith('http')) poster = `${BASE_URL}${poster}`;

    let name = img.attr('alt') || img.attr('title') || $(el).attr('title') || '';
    if (!name) name = $(el).find('.title, .name, h3, h2').first().text().trim();
    if (!name) return;

    metas.push({
      id: makeId(slug),
      type: 'series',
      name: name.trim(),
      poster: poster || undefined,
      posterShape: 'poster'
    });
  });

  return metas;
}

async function catalogHandler({ type, id, extra }) {
  const skip = parseInt(extra.skip) || 0;
  const search = extra.search || '';

  let metas = [];

  if (search) {
    metas = await fetchSearch(search);
  } else if (id === 'oa-top') {
    metas = await fetchTop(skip);
  } else {
    // oa-latest
    metas = await fetchLatest(skip);
  }

  return { metas };
}

module.exports = { catalogHandler, titleToSlug };
