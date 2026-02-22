const axios = require('axios');

const BASE_URL = 'https://ogladajanime.pl';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': BASE_URL
  }
});

async function fetchPage(url, options = {}) {
  try {
    const response = await client.get(url, options);
    return response.data;
  } catch (e) {
    console.error(`fetchPage error for ${url}:`, e.message);
    throw e;
  }
}

module.exports = { client, fetchPage, BASE_URL };
