const axios = require('axios');
const cheerio = require('cheerio');
const { fetchOA } = require('./http');

const JIKAN = 'https://api.jikan.moe/v4';

function slugToQuery(slug) {
  return slug.replace(/-/g, ' ').replace(/\d+$/, '').trim();
}

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

async function fetchEpisodesFromOA(slug) {
  try {
    const html = await fetchOA(`/anime/${slug}`);
    const $ = cheerio.load(html);
    const epNumbers = new Set();

    $(`a[href^="/anime/${slug}/"]`).each((i, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/anime\/.+?\/(\d+)$/);
      if (m) epNumbers.add(parseInt(m[1]));
    });

    if (epNumbers.size === 0) {
      $('a[href*="/anime/"]').each((i, el) => {
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

async function metaHandler({ type, id }) {
  const slug = id.replace('oa:', '');
  const query = slugToQuery(slug);

  const [anime, epNumbers] = await Promise.all([
    jikanSearch(query),
    fetchEpisodesFromOA(slug)
  ]);

  let finalEps = epNumbers;
  if (finalEps.length === 0 && anime?.episodes > 0) {
    finalEps = Array.from({ length: anime.episodes }, (_, i) => i + 1);
  }
  if (finalEps.length === 0) finalEps = [1];

  const videos = finalEps.map(ep => ({
    id: `${id}:${ep}`,
    title: `Odcinek ${ep}`,
    season: 1,
    episode: ep,
    released: anime?.aired?.from
      ? new Date(anime.aired.from).toISOString()
      : new Date().toISOString()
  }));

  const meta = {
    id,
    type: finalEps.length <= 1 && anime?.type === 'Movie' ? 'movie' : 'series',
    name: anime?.title_english || anime?.title || query,
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
