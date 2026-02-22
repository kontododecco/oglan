const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA } = require('./http');
const { findOASlug } = require('./slug-resolver');

const JIKAN = 'https://api.jikan.moe/v4';

async function metaHandler({ type, id }) {
  // id format: "oa:MAL_ID"  np. "oa:52991"
  const malId = id.replace('oa:', '');

  // 1. Pobierz pełne dane z Jikan
  let anime = null;
  try {
    const { data } = await axios.get(`${JIKAN}/anime/${malId}`, { timeout: 10000 });
    anime = data.data;
  } catch (e) {
    console.error(`Jikan fetch failed for MAL ${malId}: ${e.message}`);
  }

  const title = anime?.title_english || anime?.title || `Anime ${malId}`;

  // 2. Znajdź slug OA przez wyszukiwarkę
  const slug = await findOASlug(malId, title);

  // 3. Pobierz listę odcinków ze strony anime na OA
  let epNumbers = [];
  try {
    const html = await fetchOA(`/anime/${slug}`);
    const $ = cheerio.load(html);

    const seen = new Set();
    $(`a[href^="/anime/${slug}/"]`).each((i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/anime\/.+?\/(\d+)$/);
      if (m) seen.add(parseInt(m[1]));
    });

    // Sprawdź czy strona rzeczywiście zawiera dane anime (nie redirect na główną)
    // Jeśli brak linków do odcinków ale strona ma "Ładowanie..." to może być redirect
    if (seen.size === 0) {
      // Sprawdź czy tytuł na stronie pasuje
      const pageTitle = $('h1, .anime-title, title').first().text().toLowerCase();
      if (!pageTitle.includes(slug.split('-')[0])) {
        console.warn(`[meta] Possible redirect for slug "${slug}", got page: "${pageTitle.substring(0, 50)}"`);
      }
    }

    epNumbers = Array.from(seen).sort((a, b) => a - b);
  } catch (e) {
    console.error(`OA episode fetch failed for slug "${slug}": ${e.message}`);
  }

  // Fallback: użyj liczby odcinków z Jikan
  if (epNumbers.length === 0 && anime?.episodes > 0) {
    epNumbers = Array.from({ length: anime.episodes }, (_, i) => i + 1);
  }
  if (epNumbers.length === 0) epNumbers = [1];

  // Zapisz slug w ID odcinka: oa:MAL_ID:SLUG:EP
  const videos = epNumbers.map(ep => ({
    id: `${id}:${slug}:${ep}`,
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
    name: title,
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
