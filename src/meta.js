const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA } = require('./http');
const { findOASlug } = require('./slug-resolver');

const JIKAN = 'https://api.jikan.moe/v4';

// Rozpoznaj czy ID to MAL number czy stary slug
function parseid(id) {
  const raw = id.replace('oa:', '');
  // Nowy format: liczba (MAL ID)
  if (/^\d+$/.test(raw)) return { type: 'mal', malId: raw };
  // Stary format: slug (np. "frieren-beyond-journeys-end")
  return { type: 'slug', slug: raw };
}

async function metaHandler({ type, id }) {
  const parsed = parseid(id);
  let anime = null;
  let malId = null;

  if (parsed.type === 'mal') {
    // Nowy format – pobierz z Jikan po MAL ID
    malId = parsed.malId;
    try {
      const { data } = await axios.get(`${JIKAN}/anime/${malId}`, { timeout: 10000 });
      anime = data.data;
    } catch (e) {
      console.error(`Jikan fetch failed for MAL ${malId}: ${e.message}`);
    }
  } else {
    // Stary format (slug) – wyszukaj w Jikan po tytule
    const titleQuery = parsed.slug.replace(/-/g, ' ');
    try {
      const { data } = await axios.get(`${JIKAN}/anime`, {
        params: { q: titleQuery, limit: 1, sfw: false },
        timeout: 10000
      });
      anime = data.data?.[0] || null;
      malId = anime?.mal_id ? String(anime.mal_id) : parsed.slug;
    } catch (e) {
      console.error(`Jikan search failed for "${titleQuery}": ${e.message}`);
      malId = parsed.slug;
    }
  }

  const title = anime?.title_english || anime?.title || parsed.slug?.replace(/-/g, ' ') || `Anime ${malId}`;

  // Znajdź slug OA
  const slug = await findOASlug(malId, title);

  // Pobierz listę odcinków ze strony OA
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
    epNumbers = Array.from(seen).sort((a, b) => a - b);
    console.log(`[meta] Found ${epNumbers.length} episodes for slug "${slug}"`);
  } catch (e) {
    console.error(`[meta] OA episode fetch failed for "${slug}": ${e.message}`);
  }

  // Fallback z Jikan
  if (epNumbers.length === 0 && anime?.episodes > 0) {
    epNumbers = Array.from({ length: anime.episodes }, (_, i) => i + 1);
    console.log(`[meta] Using Jikan episode count: ${anime.episodes}`);
  }
  if (epNumbers.length === 0) epNumbers = [1];

  // ID odcinka: oa:MALID:SLUG:EP
  const videos = epNumbers.map(ep => ({
    id: `oa:${malId}:${slug}:${ep}`,
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
