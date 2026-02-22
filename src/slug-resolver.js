const cheerio = require('cheerio');
const { fetchOA, BASE_URL } = require('./http');

// Cache slug -> MAL_ID i odwrotnie (in-memory, resetuje się przy restarcie)
const slugCache = new Map(); // malId -> slug

/**
 * Znajdź slug OA dla danego tytułu anime.
 * Szukamy na OA przez wyszukiwarkę, dopasowujemy pierwszy wynik.
 */
async function findOASlug(malId, title) {
  // Sprawdź cache
  if (slugCache.has(malId)) {
    return slugCache.get(malId);
  }

  // Oczyść tytuł z nadmiaru słów dla lepszego wyszukiwania
  const searchQuery = title
    .replace(/\s*(Season \d+|Part \d+|\d+nd Season|\d+rd Season|\d+th Season|2nd Season|3rd Season)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');

  try {
    const html = await fetchOA(`/search/name/${encodeURIComponent(searchQuery)}`);
    const $ = cheerio.load(html);

    // Wyciągnij pierwszy slug z wyników wyszukiwania
    let foundSlug = null;
    $('a[href^="/anime/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/^\/anime\/([^\/]+)\/?$/);
      if (match && !foundSlug) {
        foundSlug = match[1];
      }
    });

    if (foundSlug) {
      slugCache.set(malId, foundSlug);
      console.log(`[slug-resolver] MAL ${malId} "${title}" → OA slug: "${foundSlug}"`);
      return foundSlug;
    }
  } catch (e) {
    console.error(`[slug-resolver] Search failed for "${title}": ${e.message}`);
  }

  // Fallback: spróbuj wygenerować slug z tytułu (angielski → kebab-case)
  const fallback = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  console.warn(`[slug-resolver] Using fallback slug for "${title}": "${fallback}"`);
  return fallback;
}

module.exports = { findOASlug };
