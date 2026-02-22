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

/**
 * Pobierz stronę OA przez ScraperAPI z cookie sesji.
 *
 * Cookie sesji ustawiasz raz ręcznie:
 * 1. Zaloguj się na ogladajanime.pl w przeglądarce
 * 2. F12 → Application → Cookies → ogladajanime.pl
 * 3. Skopiuj wartość cookie (zazwyczaj "dle_user_id=XXX; dle_password=YYY" lub podobne)
 * 4. Wklej jako zmienną OA_SESSION_COOKIE na Vercel
 */
async function fetchOA(path) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const scraperKey = process.env.SCRAPER_API_KEY;
  const sessionCookie = process.env.OA_SESSION_COOKIE || '';

  const headers = {
    ...BROWSER_HEADERS,
    ...(sessionCookie ? { Cookie: sessionCookie } : {})
  };

  if (scraperKey) {
    // ScraperAPI z keep_headers=true przekazuje nasze nagłówki (w tym Cookie) do docelowej strony
    const scraperUrl = `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false&country_code=pl&keep_headers=true`;
    console.log(`[fetchOA] ScraperAPI → ${url}${sessionCookie ? ' (z cookie)' : ' (bez cookie)'}`);
    const { data } = await axios.get(scraperUrl, {
      headers,
      timeout: 30000
    });
    if (typeof data === 'string') {
      const loggedIn = !data.includes('Zaloguj się aby uzyskać dostęp');
      console.log(`[fetchOA] HTML (${data.length} chars), zalogowany: ${loggedIn}`);
    }
    return data;
  }

  // Lokalnie – bezpośredni request
  console.log(`[fetchOA] Direct → ${url}`);
  const { data } = await axios.get(url, { headers, timeout: 15000 });
  return data;
}

const client = axios.create({ baseURL: BASE_URL, timeout: 15000, headers: BROWSER_HEADERS });
module.exports = { client, fetchOA, BASE_URL, BROWSER_HEADERS };
