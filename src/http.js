const axios = require('axios');

const BASE_URL = 'https://ogladajanime.pl';

// Nagłówki maksymalnie imitujące prawdziwą przeglądarkę
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

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: BROWSER_HEADERS
});

async function fetchPage(url, options = {}) {
  try {
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const response = await axios.get(fullUrl, {
      headers: { ...BROWSER_HEADERS, ...(options.headers || {}) },
      timeout: 15000,
      ...options
    });
    return response.data;
  } catch (e) {
    console.error(`fetchPage error for ${url}:`, e.message);
    throw e;
  }
}

module.exports = { client, fetchPage, BASE_URL, BROWSER_HEADERS };

