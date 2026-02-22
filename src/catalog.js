const cheerio = require('cheerio');
const { fetchPage, BASE_URL } = require('./http');

// Buduje ID w formacie oa:<slug>
function makeId(slug) {
  return `oa:${slug}`;
}

// Parsuje stronę główną – sekcja "Ostatnio dodane"
async function fetchLatest(skip = 0) {
  // strona nie ma prostej paginacji na liście ostatnich,
  // więc pobieramy all_anime_list z sortowaniem po dacie
  const page = Math.floor(skip / 20) + 1;
  const html = await fetchPage(`/all_anime_list/${page}`);
  return parseAnimeList(html);
}

// Pobiera popularność (strona główna – sekcja "Najczęściej wyświetlane")
async function fetchTop() {
  const html = await fetchPage('/');
  const $ = cheerio.load(html);
  const metas = [];

  // sekcja "Najczęściej wyświetlane dzisiaj"
  $('a[href^="/anime/"]').each((i, el) => {
    const href = $(el).attr('href') || '';
    const slug = href.replace('/anime/', '').split('/')[0];
    if (!slug || slug === '') return;

    const img = $(el).find('img');
    const name = img.attr('alt') || img.attr('title') || $(el).text().trim();
    const poster = img.attr('src') || img.attr('data-src') || '';

    if (name && slug && !metas.find(m => m.id === makeId(slug))) {
      metas.push({
        id: makeId(slug),
        type: 'series',
        name: name.trim(),
        poster: poster.startsWith('http') ? poster : `${BASE_URL}${poster}`,
        posterShape: 'poster'
      });
    }
  });

  return metas.slice(0, 20);
}

// Wyszukiwanie
async function fetchSearch(query) {
  const html = await fetchPage(`/search/name/${encodeURIComponent(query)}`);
  return parseAnimeList(html);
}

// Uniwersalny parser listy anime z dowolnej strony OA
function parseAnimeList(html) {
  const $ = cheerio.load(html);
  const metas = [];
  const seen = new Set();

  // Główne bloki anime – różne selektory dla różnych podstron
  const selectors = [
    'a[href^="/anime/"]',
  ];

  selectors.forEach(sel => {
    $(sel).each((i, el) => {
      const href = $(el).attr('href') || '';
      // wyciąga slug: /anime/some-title → some-title
      const match = href.match(/^\/anime\/([^\/]+)\/?$/);
      if (!match) return;

      const slug = match[1];
      if (seen.has(slug)) return;
      seen.add(slug);

      const img = $(el).find('img').first();
      let poster = img.attr('src') || img.attr('data-src') || '';
      if (poster && !poster.startsWith('http')) poster = `${BASE_URL}${poster}`;

      // Tytuł: alt atrybutu img, lub title linku, lub tekst w .title/.name
      let name = img.attr('alt') || img.attr('title') || '';
      if (!name) {
        name = $(el).find('.title, .name, h3, h2').first().text().trim();
      }
      if (!name) name = $(el).attr('title') || '';
      if (!name) return; // pomiń jeśli brak tytułu

      const ratingText = $(el).find('em, .rating, .score').first().text().trim();
      const rating = parseFloat(ratingText) || undefined;

      metas.push({
        id: makeId(slug),
        type: 'series',
        name: name.trim(),
        poster: poster || undefined,
        posterShape: 'poster',
        imdbRating: rating
      });
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
    metas = await fetchTop();
  } else {
    // oa-latest
    metas = await fetchLatest(skip);
  }

  return { metas };
}

module.exports = { catalogHandler };
