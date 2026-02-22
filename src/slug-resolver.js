const cheerio = require('cheerio');
const { fetchOA } = require('./http');

// Cache: title -> oaSlug
const slugCache = new Map();

/**
 * Znajdź slug OA dla tytułu anime.
 * Szuka na OA wyszukiwarce, bierze pierwszy wynik.
 */
async function findOASlug(malId, title) {
  const cacheKey = String(malId);
  if (slugCache.has(cacheKey)) return slugCache.get(cacheKey);

  // Oczyść tytuł - tylko pierwsze 3-4 słowa, bez "Season X", "Part X" itp.
  const cleanTitle = title
    .replace(/\s*(2nd|3rd|\d+th|second|third)\s+season.*/gi, '')
    .replace(/\s*season\s+\d+.*/gi, '')
    .replace(/\s*part\s+\d+.*/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');

  console.log(`[slug-resolver] Searching OA for: "${cleanTitle}" (MAL ${malId})`);

  try {
    const html = await fetchOA(`/search/name/${encodeURIComponent(cleanTitle)}`);
    const $ = cheerio.load(html);

    let foundSlug = null;
    $('a[href^="/anime/"]').each((i, el) => {
      if (foundSlug) return;
      const href = $(el).attr('href') || '';
      const match = href.match(/^\/anime\/([^\/]+)\/?$/);
      if (match && match[1]) foundSlug = match[1];
    });

    if (foundSlug) {
      slugCache.set(cacheKey, foundSlug);
      console.log(`[slug-resolver] MAL ${malId} → OA slug: "${foundSlug}"`);
      return foundSlug;
    }
  } catch (e) {
    console.error(`[slug-resolver] Search failed: ${e.message}`);
  }

  // Fallback: kebab-case z tytułu angielskiego
  const fallback = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  console.warn(`[slug-resolver] Fallback slug: "${fallback}"`);
  return fallback;
}

module.exports = { findOASlug };
