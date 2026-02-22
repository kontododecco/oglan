/**
 * YouTube resolver
 * YouTube nie pozwala na bezpośrednie pobieranie MP4 bez yt-dlp/youtube-dl
 * Na Vercelu nie możemy uruchomić yt-dlp, więc zwracamy externalUrl
 * Stremio obsługuje YouTube natively przez wtyczkę
 */
async function resolveYoutube(url) {
  // Wyciągnij ID wideo
  let videoId = '';

  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const p of patterns) {
    const m = url.match(p);
    if (m) { videoId = m[1]; break; }
  }

  if (!videoId) throw new Error('YouTube: nie znaleziono ID wideo');

  // Stremio potrafi odtworzyć YouTube bezpośrednio przez ytdl
  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    name: 'OgladajAnime',
    title: '▶ YouTube',
    behaviorHints: { notWebReady: true }
  };
}

module.exports = resolveYoutube;
