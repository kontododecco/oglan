const axios = require('axios');
const cheerio = require('cheerio');
const { fetchPage, BASE_URL } = require('./http');

const JIKAN = 'https://api.jikan.moe/v4';

// Slug → tytuł do wyszukiwania w Jikan
function slugToQuery(slug) {
  return slug.replace(/-/g, ' ').replace(/\d+$/, '').trim();
}

// Pobierz dane anime z Jikan po tytule
async function jikanSearch(query) {
  try {
    const { data } = await axios.get(`${JIKAN}/anime`, {
      params: { q: query, limit: 1, sfw: false },
      timeout: 8000
    });
    return data.data?.[0] || null;
  } catch (e) {
    return null;
  }
}

// Pobierz listę odcinków z OA – próbujemy z przeglądarkowymi nagłówkami
async function fetchEpisodesFromOA(slug) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pl-PL,pl;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  };

  try {
    const { data } = await axios.get(`https://ogladajanime.pl/anime/${slug}`, {
      headers,
      timeout: 12000
    });

    const $ = cheerio.load(data);
    const epNumbers = new Set();

    $(`a[href^="/anime/${slug}/"]`).each((i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/anime\/.+?\/(\d+)$/);
      if (m) epNumbers.add(parseInt(m[1]));
    });

    // Alternatywnie szukaj numerów odcinków w treści strony
    if (epNumbers.size === 0) {
      const allLinks = $('a[href*="/anime/"]');
      allLinks.each((i, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/(\d+)(?:\?|$)/);
        if (m && parseInt(m[1]) > 0 && parseInt(m[1]) < 5000) {
          epNumbers.add(parseInt(m[1]));
        }
      });
    }

    return Array.from(epNumbers).sort((a, b) => a - b);
  } catch (e) {
    console.error(`OA episode fetch failed for ${slug}: ${e.message}`);
    return [];
  }
}

// Jeśli OA blokuje, generujemy odcinki z Jikan (episodes count)
async function getEpisodeCountFromJikan(malId) {
  try {
    const { data } = await axios.get(`${JIKAN}/anime/${malId}`, { timeout: 8000 });
    return data.data?.episodes || 0;
  } catch (e) {
    return 0;
  }
}

async function metaHandler({ type, id }) {
  const slug = id.replace('oa:', '');
  const query = slugToQuery(slug);

  // 1. Pobierz metadane z Jikan
  const anime = await jikanSearch(query);

  // 2. Pobierz odcinki z OA
  let epNumbers = await fetchEpisodesFromOA(slug);

  // 3. Fallback: jeśli OA zablokował, użyj liczby odcinków z Jikan
  if (epNumbers.length === 0 && anime?.episodes && anime.episodes > 0) {
    epNumbers = Array.from({ length: anime.episodes }, (_, i) => i + 1);
  }

  // 4. Jeśli nadal brak – minimum 1 odcinek (żeby coś pokazać)
  if (epNumbers.length === 0) {
    epNumbers = [1];
  }

  // 5. Buduj videos (odcinki)
  const videos = epNumbers.map(ep => ({
    id: `${id}:${ep}`,
    title: `Odcinek ${ep}`,
    season: 1,
    episode: ep,
    released: anime?.aired?.from
      ? new Date(anime.aired.from).toISOString()
      : new Date().toISOString()
  }));

  // 6. Buduj meta z danych Jikan (lub fallback bez nich)
  const meta = {
    id,
    type: videos.length === 1 ? 'movie' : 'series',
    name: anime?.title_english || anime?.title || query.replace(/-/g, ' '),
    poster: anime?.images?.jpg?.large_image_url,
    background: anime?.images?.jpg?.large_image_url,
    description: anime?.synopsis,
    genres: (anime?.genres || []).map(g => g.name),
    year: anime?.year || (anime?.aired?.from ? new Date(anime.aired.from).getFullYear() : undefined),
    imdbRating: anime?.score,
    videos
  };

  // Usuń undefined pola
  Object.keys(meta).forEach(k => (meta[k] === undefined || meta[k] === null) && delete meta[k]);

  return { meta };
}

module.exports = { metaHandler };

