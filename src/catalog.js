const axios = require('axios');
const { fetchOA, BASE_URL } = require('./http');
const cheerio = require('cheerio');

const JIKAN = 'https://api.jikan.moe/v4';

// ID format: oa:MAL_ID  (np. oa:52991)
function makeId(malId) {
  return `oa:${malId}`;
}

function jikanToMeta(anime) {
  return {
    id: makeId(anime.mal_id),
    type: anime.type === 'Movie' ? 'movie' : 'series',
    name: anime.title_english || anime.title,
    poster: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
    posterShape: 'poster',
    description: anime.synopsis,
    genres: (anime.genres || []).map(g => g.name),
    year: anime.year || (anime.aired?.from ? new Date(anime.aired.from).getFullYear() : undefined),
    imdbRating: anime.score,
  };
}

async function fetchLatest(skip = 0) {
  const page = Math.floor(skip / 25) + 1;
  try {
    const { data } = await axios.get(`${JIKAN}/seasons/now`, { params: { page, limit: 25 }, timeout: 10000 });
    return (data.data || []).map(jikanToMeta);
  } catch (e) {
    console.error('Jikan fetchLatest error:', e.message);
    return [];
  }
}

async function fetchTop(skip = 0) {
  const page = Math.floor(skip / 25) + 1;
  try {
    const { data } = await axios.get(`${JIKAN}/top/anime`, { params: { page, limit: 25 }, timeout: 10000 });
    return (data.data || []).map(jikanToMeta);
  } catch (e) {
    console.error('Jikan fetchTop error:', e.message);
    return [];
  }
}

async function fetchSearch(query) {
  try {
    const { data } = await axios.get(`${JIKAN}/anime`, { params: { q: query, limit: 20, sfw: false }, timeout: 10000 });
    return (data.data || []).map(jikanToMeta);
  } catch (e) {
    console.error('Jikan search error:', e.message);
    return [];
  }
}

async function catalogHandler({ type, id, extra }) {
  const skip = parseInt(extra.skip) || 0;
  const search = extra.search || '';
  let metas = [];
  if (search) metas = await fetchSearch(search);
  else if (id === 'oa-top') metas = await fetchTop(skip);
  else metas = await fetchLatest(skip);
  return { metas };
}

module.exports = { catalogHandler };
