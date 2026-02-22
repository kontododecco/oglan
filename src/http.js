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
};

async function fetchOA(path) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const scraperKey = process.env.SCRAPER_API_KEY;

  if (scraperKey) {
    // ScraperAPI: render=false bo strona jest SSR, country_code=pl dla polskiego IP
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false&country_code=pl`;
    console.log(`[fetchOA] ScraperAPI → ${url}`);
    const { data } = await axios.get(scraperUrl, { timeout: 30000 });

    // Debug: log fragment HTML żeby widzieć co dostajemy
    if (typeof data === 'string') {
      const preview = data.replace(/\s+/g, ' ').substring(0, 300);
      console.log(`[fetchOA] HTML preview (${data.length} chars): ${preview}`);
    }

    return data;
  }

  // Bez ScraperAPI: bezpośredni request (tylko lokalnie)
  console.log(`[fetchOA] Direct → ${url}`);
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
