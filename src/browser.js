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
    console.log('[browser] Chrome rozłączony, zresetuję przy następnym użyciu');
    browserInstance = null;
  });

  console.log('[browser] Chrome uruchomiony');
  return browserInstance;
}

/**
 * Pobierz HTML strony przez Puppeteer z cookie sesji OA.
 * Opcja clickSelector: CSS selector elementu do kliknięcia przed zwróceniem HTML.
 * Opcja waitFor: selektor na który czekamy po kliknięciu.
 */
async function fetchWithBrowser(url, { clickSelector, waitFor, timeout = 20000 } = {}) {
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

    // Blokuj reklamy i zasoby których nie potrzebujemy
    await page.setRequestInterception(true);
    const capturedRequests = [];
    page.on('request', req => {
      const type = req.resourceType();
      const reqUrl = req.url();
      // Przepuść dokumenty i XHR, blokuj obrazki/czcionki/reklamy
      if (['image', 'font', 'media'].includes(type)) {
        req.abort();
      } else if (reqUrl.includes('google-analytics') || reqUrl.includes('doubleclick') || reqUrl.includes('adnxs')) {
        req.abort();
      } else {
        // Loguj XHR żebyśmy wiedzieli jakie AJAX requesty robi OA
        if (type === 'xhr' || type === 'fetch') {
          capturedRequests.push(reqUrl);
          console.log(`[browser] XHR: ${reqUrl}`);
        }
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log(`[browser] Otwieram: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout });

    const loggedIn = !(await page.content()).includes('Zaloguj się aby uzyskać dostęp');
    console.log(`[browser] Zalogowany: ${loggedIn}`);

    // Kliknij element jeśli podano selektor
    if (clickSelector) {
      console.log(`[browser] Klikam: ${clickSelector}`);
      try {
        await page.waitForSelector(clickSelector, { timeout: 5000 });
        await page.click(clickSelector);
        if (waitFor) {
          await page.waitForSelector(waitFor, { timeout: 10000 });
        } else {
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (e) {
        console.warn(`[browser] Kliknięcie nieudane: ${e.message}`);
      }
    }

    const html = await page.content();
    console.log(`[browser] HTML: ${html.length} chars, XHR requests: ${capturedRequests.length}`);
    return { html, xhrRequests: capturedRequests };
  } finally {
    await page.close();
  }
}

module.exports = { fetchWithBrowser, getBrowser };
