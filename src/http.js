const axios = require('axios');

const BASE_URL = 'https://ogladajanime.pl';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

async function fetchOA(path, { render = false } = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const scraperKey = process.env.SCRAPER_API_KEY;
  const sessionCookie = process.env.OA_SESSION_COOKIE || '';

  const headers = {
    ...BROWSER_HEADERS,
    ...(sessionCookie ? { Cookie: sessionCookie } : {})
  };

  if (scraperKey) {
    let scraperUrl;

    if (render) {
      // Używamy ScraperAPI /screenshot endpoint który obsługuje JS instructions
      // Ale lepiej – używamy standardowego render z autoparse i czekamy na konkretny element
      const params = new URLSearchParams({
        api_key: scraperKey,
        url,
        country_code: 'pl',
        keep_headers: 'true',
        render: 'true',
        wait_for_selector: '#playerFrame[src]:not([src=""])',
        wait: '3000',
      });
      scraperUrl = `http://api.scraperapi.com?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        api_key: scraperKey,
        url,
        country_code: 'pl',
        keep_headers: 'true',
      });
      scraperUrl = `http://api.scraperapi.com?${params.toString()}`;
    }

    console.log(`[fetchOA] ScraperAPI${render ? ' (render=true)' : ''} → ${url}`);
    const { data } = await axios.get(scraperUrl, { headers, timeout: 60000 });
    if (typeof data === 'string') {
      const loggedIn = !data.includes('Zaloguj się aby uzyskać dostęp');
      console.log(`[fetchOA] HTML (${data.length} chars), zalogowany: ${loggedIn}`);
    }
    return data;
  }

  console.log(`[fetchOA] Direct → ${url}`);
  const { data } = await axios.get(url, { headers, timeout: 15000 });
  return data;
}

const client = axios.create({ baseURL: BASE_URL, timeout: 15000, headers: BROWSER_HEADERS });
module.exports = { client, fetchOA, BASE_URL, BROWSER_HEADERS };
