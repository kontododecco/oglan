const cheerio = require('cheerio');
const { fetchOA } = require('./http');

const slugCache = new Map();

/**
 * Znajdź slug OA dla anime.
 * OA używa japońskich tytułów jako slugów (np. "sousou-no-frieren").
 * Dlatego szukamy najpierw po japońskim tytule, potem angielskim.
 */
async function findOASlug(malId, titleJp, titleEn) {
  const cacheKey = String(malId);
  if (slugCache.has(cacheKey)) return slugCache.get(cacheKey);

  // Próbuj kilka wariantów wyszukiwania, od najbardziej konkretnego
  const queries = [];

  // 1. Japoński tytuł (pierwsze 3 słowa) – OA zazwyczaj używa tego jako slug
  if (titleJp) {
    const jpShort = titleJp.split(' ').slice(0, 3).join(' ');
    queries.push(jpShort);
    // Też pełny japoński
    if (titleJp !== jpShort) queries.push(titleJp);
  }

  // 2. Angielski tytuł (pierwsze 2 słowa) – fallback
  if (titleEn && titleEn !== titleJp) {
    queries.push(titleEn.split(' ').slice(0, 2).join(' '));
  }

  for (const query of queries) {
    console.log(`[slug-resolver] Searching OA: "${query}" (MAL ${malId})`);
    try {
      const html = await fetchOA(`/search/name/${encodeURIComponent(query)}`);
      const $ = cheerio.load(html);

      // Wyciągnij slugi z wyników wyszukiwania
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
      console.error(`[slug-resolver] Query "${query}" failed: ${e.message}`);
    }
  }

  // Ostateczny fallback: kebab z japońskiego tytułu (tak jak OA to robi)
  const base = (titleJp || titleEn || `anime-${malId}`)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  console.warn(`[slug-resolver] Fallback slug: "${base}"`);
  return base;
}

module.exports = { findOASlug };
