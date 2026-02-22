const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Resolver dla VK video embed.
 * VK embed URL format: https://vk.com/video_ext.php?oid=XXX&id=YYY&hash=ZZZ
 * lub: https://vkvideo.ru/video_ext.php?oid=XXX&id=YYY&hash=ZZZ
 *
 * Strona video_ext.php zawiera w JS tablicę źródeł wideo w różnych jakościach.
 */
async function resolveVK(embedUrl) {
  try {
    const { data: html } = await axios.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://ogladajanime.pl/',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      },
      timeout: 15000
    });

    // VK trzyma URL-e wideo w zmiennej JS, np:
    // "url1080":"https:\/\/...mp4", "url720":"...", "url480":"..."
    const qualityOrder = ['url1080', 'url720', 'url480', 'url360', 'url240', 'hls'];
    for (const quality of qualityOrder) {
      const pattern = new RegExp(`["']${quality}["']\\s*:\\s*["']([^"']+)["']`);
      const m = html.match(pattern);
      if (m) {
        const videoUrl = m[1].replace(/\\\//g, '/');
        console.log(`[vk] Found ${quality}: ${videoUrl.substring(0, 80)}`);
        const label = quality.replace('url', '') + 'p';
        return {
          url: videoUrl,
          name: 'OgladajAnime',
          title: `📺 VK ${quality === 'hls' ? 'HLS' : label}`,
          behaviorHints: { notWebReady: false }
        };
      }
    }

    // Fallback: szukaj M3U8
    const hlsMatch = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (hlsMatch) {
      return {
        url: hlsMatch[1].replace(/\\\//g, '/'),
        name: 'OgladajAnime',
        title: '📺 VK HLS',
        behaviorHints: { notWebReady: false }
      };
    }

    console.warn(`[vk] No video URL found in embed page`);
    return null;
  } catch (e) {
    console.error(`[vk] Resolver error: ${e.message}`);
    return null;
  }
}

module.exports = resolveVK;
