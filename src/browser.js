const puppeteer = require('puppeteer');

let browserInstance = null;

// User-Agent musi być IDENTYCZNY jak przeglądarka która wygenerowała cf_clearance cookie
const USER_AGENT = process.env.OA_USER_AGENT || 
  'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0';

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
    // Ustaw User-Agent identyczny z przeglądarką która wygenerowała cf_clearance
    await page.setUserAgent(USER_AGENT);

    // Ustaw cookies OA PRZED otwarciem strony
    const sessionCookie = process.env.OA_SESSION_COOKIE || '';
    if (sessionCookie) {
      const cookies = sessionCookie.split(';').map(part => {
        const [name, ...rest] = part.trim().split('=');
        return {
          name: name.trim(),
          value: rest.join('=').trim(),
          domain: 'ogladajanime.pl',
          path: '/',
          sameSite: 'Lax',
        };
      }).filter(c => c.name && c.value);
      await page.setCookie(...cookies);
      console.log(`[browser] Ustawiono ${cookies.length} cookies: ${cookies.map(c => c.name).join(', ')}`);
    }

    // Blokuj niepotrzebne zasoby, loguj XHR (bez Cloudflare CDN-CGI)
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
        if ((type === 'xhr' || type === 'fetch') && !reqUrl.includes('cdn-cgi') && !reqUrl.includes('cloudflare.com')) {
          capturedRequests.push(reqUrl);
          console.log(`[browser] OA XHR: ${reqUrl}`);
        }
        req.continue();
      }
    });

    console.log(`[browser] Otwieram: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    const html = await page.content();
    const htmlLen = html.length;
    const loggedIn = !html.includes('Zaloguj się aby uzyskać dostęp');
    const cfChallenge = html.includes('cf-browser-verification') || html.includes('challenge-form') || htmlLen < 50000;

    console.log(`[browser] HTML: ${htmlLen} chars, zalogowany: ${loggedIn}, CF challenge: ${cfChallenge}`);

    if (cfChallenge) {
      console.warn('[browser] Cloudflare blokuje – cf_clearance może być nieaktualne lub UA się nie zgadza');
      console.log(`[browser] Używany UA: ${USER_AGENT}`);
    }

    // Zbadaj DOM żeby znaleźć strukturę playera
    const domInfo = await page.evaluate(() => {
      const info = {};

      // playerFrame
      const pf = document.getElementById('playerFrame');
      info.playerFrameSrc = pf ? (pf.src || pf.getAttribute('src') || 'pusty') : 'brak';

      // newPlayer
      const np = document.getElementById('newPlayer');
      info.newPlayerSrc = np ? (np.src || 'pusty') : 'brak';

      // Znajdź listę odcinków – szukaj li z liczbą jako tekstem
      const allLi = Array.from(document.querySelectorAll('li'));
      const epLi = allLi.filter(li => /^\d+$/.test(li.textContent.trim()) || li.textContent.trim().match(/^(Trailer|\d+)/));
      if (epLi.length > 0) {
        info.episodeCount = epLi.length;
        info.firstEpHtml = epLi[0].outerHTML.substring(0, 300);
        info.firstEpOnclick = epLi[0].getAttribute('onclick') || '';
        info.firstEpParentClass = epLi[0].parentElement?.className || '';
      }

      // Znajdź wszystkie onclick z "player" lub "episode"
      const onclickEls = Array.from(document.querySelectorAll('[onclick]'))
        .filter(el => {
          const oc = el.getAttribute('onclick') || '';
          return oc.includes('player') || oc.includes('episode') || oc.includes('watch') || oc.includes('src');
        })
        .slice(0, 5)
        .map(el => ({ tag: el.tagName, cls: el.className, onclick: el.getAttribute('onclick') }));
      info.onclickElements = onclickEls;

      // Skrypty z logiką playera
      for (const s of document.scripts) {
        const c = s.textContent || '';
        if (c.length > 100 && (c.includes('playerFrame') || c.includes('watchepisode'))) {
          info.playerScript = c.substring(0, 800);
          break;
        }
      }

      return info;
    });

    console.log(`[browser] DOM: ${JSON.stringify(domInfo, null, 2)}`);

    return { html, xhrRequests: capturedRequests, domInfo };
  } finally {
    await page.close();
  }
}

module.exports = { fetchWithBrowser, getBrowser };
