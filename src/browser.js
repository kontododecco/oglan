const puppeteer = require('puppeteer');

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;

  console.log('[browser] Uruchamiam Chrome...');
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
    ],
  });

  browserInstance.on('disconnected', () => {
    console.log('[browser] Chrome rozłączony');
    browserInstance = null;
  });

  console.log('[browser] Chrome uruchomiony');
  return browserInstance;
}

async function fetchWithBrowser(url, { timeout = 25000 } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Ustaw cookie sesji OA
    const sessionCookie = process.env.OA_SESSION_COOKIE || '';
    if (sessionCookie) {
      const cookies = sessionCookie.split(';').map(part => {
        const [name, ...rest] = part.trim().split('=');
        return { name: name.trim(), value: rest.join('=').trim(), domain: 'ogladajanime.pl', path: '/' };
      }).filter(c => c.name && c.value);
      await page.setCookie(...cookies);
    }

    // Blokuj niepotrzebne zasoby + loguj XHR
    await page.setRequestInterception(true);
    const capturedRequests = [];
    page.on('request', req => {
      const type = req.resourceType();
      const reqUrl = req.url();
      if (['image', 'font', 'media'].includes(type)) {
        req.abort();
      } else if (reqUrl.includes('google-analytics') || reqUrl.includes('doubleclick') || reqUrl.includes('adnxs')) {
        req.abort();
      } else {
        if ((type === 'xhr' || type === 'fetch') && !reqUrl.includes('cdn-cgi') && !reqUrl.includes('cloudflare')) {
          capturedRequests.push(reqUrl);
          console.log(`[browser] XHR: ${reqUrl}`);
        }
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log(`[browser] Otwieram: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    const initialHtml = await page.content();
    const loggedIn = !initialHtml.includes('Zaloguj się aby uzyskać dostęp');
    console.log(`[browser] Zalogowany: ${loggedIn}`);

    // Debug: zbadaj strukturę DOM żeby znaleźć listę odcinków i player
    const domInfo = await page.evaluate(() => {
      const info = {};

      // Szukaj listy odcinków
      const epSelectors = ['ul li', '.episode', '[class*="ep"]', '[class*="odcin"]'];
      for (const sel of epSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0 && els.length < 50) {
          const first = els[0];
          info.episodeSelector = sel;
          info.episodeCount = els.length;
          info.firstEpisodeHtml = first.outerHTML.substring(0, 200);
          info.firstEpisodeOnclick = first.getAttribute('onclick') || first.querySelector('[onclick]')?.getAttribute('onclick') || '';
          break;
        }
      }

      // playerFrame
      const pf = document.getElementById('playerFrame');
      info.playerFrameSrc = pf ? (pf.src || pf.getAttribute('src') || 'pusty') : 'brak elementu';
      info.playerFrameClass = pf ? pf.className : '';

      // newPlayer
      const np = document.getElementById('newPlayer');
      info.newPlayerSrc = np ? (np.src || 'pusty') : 'brak elementu';

      // Znajdź wszystkie elementy z onclick które mogą być przyciskami playera
      const onclickEls = Array.from(document.querySelectorAll('[onclick]'))
        .filter(el => el.getAttribute('onclick').includes('player') || el.getAttribute('onclick').includes('episode') || el.getAttribute('onclick').includes('watch'))
        .slice(0, 3)
        .map(el => ({ tag: el.tagName, onclick: el.getAttribute('onclick'), html: el.outerHTML.substring(0, 150) }));
      info.onclickElements = onclickEls;

      // Szukaj skryptów z logiką playera
      const scripts = Array.from(document.scripts);
      for (const s of scripts) {
        const c = s.textContent || '';
        if (c.includes('playerFrame') || c.includes('watchepisode') || (c.includes('player') && c.includes('src'))) {
          info.playerScript = c.substring(0, 600);
          break;
        }
      }

      return info;
    });

    console.log(`[browser] DOM info: ${JSON.stringify(domInfo, null, 2)}`);

    const html = await page.content();
    console.log(`[browser] HTML: ${html.length} chars, OA XHR: ${capturedRequests.length}`);
    return { html, xhrRequests: capturedRequests, domInfo };
  } finally {
    await page.close();
  }
}

module.exports = { fetchWithBrowser, getBrowser };
