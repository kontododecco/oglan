const axios = require('axios');

const BASE_URL = 'https://ogladajanime.pl';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
  'Referer': 'https://www.google.com/'
};

/**
 * Pobierz stronę ogladajanime.pl.
 *
 * Vercel IP jest zablokowane przez OA (403).
 * Rozwiązanie: ScraperAPI jako proxy rotujące IP.
 *
 * Jeśli zmienna SCRAPER_API_KEY jest ustawiona – używa ScraperAPI.
 * Bez klucza działa tylko lokalnie (twoje IP nie jest blokowane).
 */
async function fetchOA(path) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const scraperKey = process.env.SCRAPER_API_KEY;

  if (scraperKey) {
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false&country_code=pl`;
    const { data } = await axios.get(scraperUrl, { timeout: 30000 });
    return data;
  }

  // Bezpośredni request – działa lokalnie, blokowany na Vercel
  const { data } = await axios.get(url, {
    headers: BROWSER_HEADERS,
    timeout: 15000
  });
  return data;
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: BROWSER_HEADERS
});

module.exports = { client, fetchOA, BASE_URL, BROWSER_HEADERS };
