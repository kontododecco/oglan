# 🎌 OgladajAnime.pl – Stremio Addon

Nieoficjalny addon Stremio który pobiera treści z serwisu [ogladajanime.pl](https://ogladajanime.pl).

## Obsługiwane hostingi

| Hosting | Status |
|---------|--------|
| Vidoza | ✅ |
| CDA.pl | ✅ (z deszyfrowaniem) |
| MP4Upload | ✅ |
| Sibnet | ✅ |
| YouTube | ✅ |
| DoodStream | ✅ |
| StreamTape | ✅ |
| VOE | ✅ |
| FileMoon | ✅ |

## Struktura projektu

```
ogladajanime-stremio/
├── api/
│   └── index.js          ← Główny serwer Express (entry point Vercel)
├── src/
│   ├── manifest.js       ← Definicja addonu
│   ├── http.js           ← Klient HTTP ze wspólnymi nagłówkami
│   ├── catalog.js        ← Handler katalogu (lista anime, wyszukiwanie)
│   ├── meta.js           ← Handler metadanych (opis, lista odcinków)
│   ├── stream.js         ← Handler streamów (wyciąganie linków)
│   └── resolvers/
│       ├── index.js      ← Eksport wszystkich resolwerów
│       ├── vidoza.js
│       ├── cda.js
│       ├── mp4upload.js
│       ├── sibnet.js
│       ├── youtube.js
│       ├── dood.js
│       ├── streamtape.js
│       ├── voe.js
│       └── filemoon.js
├── vercel.json           ← Konfiguracja Vercel
├── package.json
└── README.md
```

---

## 🚀 Deployment na Vercel (krok po kroku)

### 1. Załóż konto GitHub i wrzuć projekt

```bash
git init
git add .
git commit -m "Initial commit"
# Utwórz repo na GitHub i push:
git remote add origin https://github.com/TWOJA-NAZWA/ogladajanime-stremio.git
git push -u origin main
```

### 2. Deploy na Vercel

1. Wejdź na [vercel.com](https://vercel.com) i zaloguj się przez GitHub
2. Kliknij **"New Project"**
3. Wybierz swoje repozytorium `ogladajanime-stremio`
4. Ustawienia pozostaw domyślne – Vercel automatycznie wykryje `vercel.json`
5. Kliknij **"Deploy"**

### 3. Zainstaluj addon w Stremio

Po deployu dostaniesz URL, np. `https://ogladajanime-stremio.vercel.app`

**Opcja A – przez przeglądarkę:**
Wejdź na adres deploymentu i kliknij przycisk **"Zainstaluj w Stremio"**

**Opcja B – ręcznie:**
1. Otwórz Stremio
2. Kliknij ikonę puzzle (Addons) → **"Community Addons"**
3. Kliknij **"Add Addon"** / ikonę `+`
4. Wklej URL: `https://ogladajanime-stremio.vercel.app/manifest.json`
5. Kliknij **"Install"**

---

## 💻 Uruchomienie lokalne

```bash
npm install
npm start
# Addon dostępny na http://localhost:7000
# Stremio URL: stremio://localhost:7000/manifest.json
```

Lub z auto-restartem:
```bash
npm run dev
```

---

## ⚠️ Uwagi

- Addon jest **nieoficjalny** i nie jest powiązany z ogladajanime.pl
- Serwis ogladajanime.pl nie hostuje treści – wyłącznie linkuje do zewnętrznych serwerów wideo
- Resolwery mogą przestać działać jeśli hostingi zmienią swój kod
- CDA może wymagać aktualizacji algorytmu deszyfrowania po zmianach po ich stronie

---

## 🔧 Rozwiązywanie problemów

**Brak streamów:**
- Strona mogła zmienić strukturę HTML – sprawdź selektory w `src/stream.js`
- Hosting mógł zmienić metodę obfuskacji – zaktualizuj odpowiedni resolwer

**Błąd 500 na Vercel:**
- Sprawdź logi w panelu Vercel → zakładka "Deployments" → "Functions"

**Addon nie pojawia się w Stremio:**
- Sprawdź czy manifest.json jest dostępny: `https://TWOJ-URL/manifest.json`
