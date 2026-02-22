function getManifest() {
  return {
    id: 'pl.ogladajanime.stremio',
    version: '1.0.0',
    name: 'OgladajAnime.pl',
    description: 'Anime po polsku z serwisu ogladajanime.pl – napisy i dubbing PL',
    logo: 'https://cdn.ogladajanime.pl/images/oa3.png',
    background: 'https://cdn.ogladajanime.pl/images/oa3.png',
    types: ['series', 'movie'],
    catalogs: [
      {
        type: 'series',
        id: 'oa-latest',
        name: '🆕 Ostatnio dodane (OA)',
        extra: [
          { name: 'search', isRequired: false },
          { name: 'skip', isRequired: false }
        ]
      },
      {
        type: 'series',
        id: 'oa-top',
        name: '🔥 Najpopularniejsze (OA)',
        extra: [
          { name: 'skip', isRequired: false }
        ]
      }
    ],
    resources: ['catalog', 'meta', 'stream'],
    idPrefixes: ['oa:'],
    behaviorHints: {
      adult: false,
      p2p: false
    }
  };
}

module.exports = { getManifest };
