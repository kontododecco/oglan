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

// Trzymamy cookie sesji w pamięci
let sessionCookie = null;

/**
 * Zaloguj się na OA i zapisz cookie sesji.
 * Wymaga zmiennych środowiskowych OA_LOGIN i OA_PASSWORD.
 */
async function login() {
  const login = process.env.OA_LOGIN;
  const password = process.env.OA_PASSWORD;

  if (!login || !password) {
    console.warn('[http] Brak OA_LOGIN / OA_PASSWORD – działam bez logowania (brak dostępu do playerów)');
    return false;
  }

  console.log(`[http] Loguję się jako: ${login}`);

  try {
    // Krok 1: pobierz stronę główną żeby dostać ewentualne tokeny/cookie
    const initResp = await axios.get(BASE_URL, {
      headers: BROWSER_HEADERS,
      maxRedirects: 5,
      timeout: 15000
    });

    // Wyciągnij cookies z init response
    const initCookies = (initResp.headers['set-cookie'] || [])
      .map(c => c.split(';')[0])
      .join('; ');

    // Krok 2: wyślij formularz logowania
    const loginResp = await axios.post(
      `${BASE_URL}/?action=login`,
      new URLSearchParams({ login, password, subaction: 'login' }).toString(),
      {
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': BASE_URL,
          'Origin': BASE_URL,
          'Cookie': initCookies
        },
        maxRedirects: 5,
        timeout: 15000
      }
    );

    // Zbierz wszystkie cookies z odpowiedzi
    const cookies = (loginResp.headers['set-cookie'] || [])
      .map(c => c.split(';')[0])
      .join('; ');

    if (cookies) {
      sessionCookie = (initCookies + '; ' + cookies).replace(/^; /, '');
      console.log('[http] Zalogowano pomyślnie, cookie sesji zapisane');
      return true;
    } else {
      console.error('[http] Logowanie nieudane – brak cookie w odpowiedzi');
      return false;
    }
  } catch (e) {
    console.error(`[http] Błąd logowania: ${e.message}`);
    return false;
  }
}

// Upewnij się że jesteśmy zalogowani (lazy init)
let loginPromise = null;
async function ensureLoggedIn() {
  if (sessionCookie) return true;
  if (!loginPromise) loginPromise = login().finally(() => { loginPromise = null; });
  return loginPromise;
}

/**
 * Pobierz stronę OA przez ScraperAPI (z cookie sesji) lub bezpośrednio.
 */
async function fetchOA(path, extraHeaders = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const scraperKey = process.env.SCRAPER_API_KEY;

  // Upewnij się że jesteśmy zalogowani
  await ensureLoggedIn();

  const headers = {
    ...BROWSER_HEADERS,
    ...extraHeaders,
    ...(sessionCookie ? { Cookie: sessionCookie } : {})
  };

  if (scraperKey) {
    // ScraperAPI z nagłówkiem Cookie
    const scraperUrl = new URL('http://api.scraperapi.com');
    scraperUrl.searchParams.set('api_key', scraperKey);
    scraperUrl.searchParams.set('url', url);
    scraperUrl.searchParams.set('render', 'false');
    scraperUrl.searchParams.set('country_code', 'pl');
    // ScraperAPI pozwala przekazać nagłówki jako JSON
    scraperUrl.searchParams.set('keep_headers', 'true');

    console.log(`[fetchOA] ScraperAPI → ${url}`);
    const { data } = await axios.get(scraperUrl.toString(), {
      headers,
      timeout: 30000
    });

    if (typeof data === 'string') {
      console.log(`[fetchOA] HTML preview (${data.length} chars): ${data.replace(/\s+/g, ' ').substring(0, 200)}`);
    }
    return data;
  }

  // Bezpośredni request (lokalnie)
  console.log(`[fetchOA] Direct → ${url}`);
  const { data } = await axios.get(url, { headers, timeout: 15000 });
  return data;
}

/**
 * POST request do OA (np. logowanie)
 */
async function postOA(path, body, extraHeaders = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers = {
    ...BROWSER_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': BASE_URL,
    'Origin': BASE_URL,
    ...extraHeaders,
    ...(sessionCookie ? { Cookie: sessionCookie } : {})
  };

  const { data, headers: respHeaders } = await axios.post(url, body, { headers, timeout: 15000, maxRedirects: 5 });

  // Aktualizuj cookie jeśli serwer je odświeżył
  const newCookies = (respHeaders['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  if (newCookies) {
    sessionCookie = (sessionCookie || '') + '; ' + newCookies;
  }

  return data;
}

const client = axios.create({ baseURL: BASE_URL, timeout: 15000, headers: BROWSER_HEADERS });

module.exports = { client, fetchOA, postOA, BASE_URL, BROWSER_HEADERS };
