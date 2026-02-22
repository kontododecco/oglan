# 🎌 OgladajAnime.pl – Stremio Addon

Nieoficjalny addon Stremio dla ogladajanime.pl.

## ⚠️ Problem z Vercel (403) i jak go naprawić

Serwery Vercel mają zablokowane IP przez ogladajanime.pl – strona zwraca 403
na wszystkich requestach z centrów danych. Masz **dwie opcje**:

---

### Opcja A: ScraperAPI (zalecane dla Vercel) ✅

**ScraperAPI** to proxy które rotuje IP i nagłówki, omijając blokady.

1. Zarejestruj się na [scraperapi.com](https://www.scraperapi.com/) – **darmowy plan: 1000 requestów/miesiąc** (wystarczy do normalnego użytku)
2. Skopiuj swój klucz API
3. W panelu Vercel: **Settings → Environment Variables** → dodaj:
   ```
   Name:  SCRAPER_API_KEY
   Value: twój_klucz_scraperapi
   ```
4. Zrób redeploy (lub Vercel zrobi to automatycznie)

Bez tego klucza addon działa tylko lokalnie.

---

### Opcja B: Uruchom lokalnie 🖥️

Twoje domowe IP nie jest blokowane. Addon działa bez żadnych dodatkowych usług:

```bash
npm install
npm start
# Addon na http://localhost:7000
```

Zainstaluj w Stremio wpisując: `stremio://localhost:7000/manifest.json`

**Wada:** addon działa tylko gdy masz uruchomiony serwer na komputerze.

---

## 🚀 Deployment na Vercel

```bash
# 1. Wrzuć na GitHub
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TWOJA/repo.git
git push -u origin main

# 2. Zaloguj się na vercel.com → New Project → wybierz repo → Deploy

# 3. Dodaj SCRAPER_API_KEY w Settings → Environment Variables

# 4. Redeploy i gotowe!
```

Po deployu wejdź na URL Vercel i kliknij "Zainstaluj w Stremio".

---

## Obsługiwane hostingi

| Hosting | Status |
|---------|--------|
| Vidoza | ✅ |
| CDA.pl | ✅ |
| MP4Upload | ✅ |
| Sibnet | ✅ |
| YouTube | ✅ |
| DoodStream | ✅ |
| StreamTape | ✅ |
| VOE | ✅ |
| FileMoon | ✅ |

## Struktura projektu

```
api/index.js          ← Serwer Express (entry point Vercel)
src/manifest.js       ← Definicja addonu
src/http.js           ← Klient HTTP + obsługa ScraperAPI proxy
src/catalog.js        ← Katalog przez Jikan/MAL API (nie scraped)
src/meta.js           ← Metadane z Jikan + odcinki z OA
src/stream.js         ← Wyciąganie linków wideo
src/resolvers/        ← Resolwery dla każdego hostingu
vercel.json           ← Konfiguracja Vercel
```
