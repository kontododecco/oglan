# 🎌 OgladajAnime.pl – Stremio Addon

## ⚙️ Zmienne środowiskowe (Vercel → Settings → Environment Variables)

| Zmienna | Opis | Wymagana? |
|---------|------|-----------|
| `SCRAPER_API_KEY` | Klucz z scraperapi.com | ✅ Tak |
| `OA_SESSION_COOKIE` | Cookie sesji z ogladajanime.pl | ✅ Tak |

---

## 🍪 Jak zdobyć OA_SESSION_COOKIE (3 minuty)

OA wymaga zalogowania żeby oglądać odcinki. Zamiast przekazywać login/hasło
(które byłyby blokowane przez Vercel), kopiujesz cookie sesji z przeglądarki:

**Krok 1:** Zaloguj się na [ogladajanime.pl](https://ogladajanime.pl) w przeglądarce

**Krok 2:** Naciśnij **F12** → zakładka **Application** (Chrome) lub **Storage** (Firefox)

**Krok 3:** W lewym panelu: **Cookies** → **https://ogladajanime.pl**

**Krok 4:** Znajdź i skopiuj wartości tych cookies (kliknij w nazwę, skopiuj pole "Value"):
- `dle_user_id` – np. `12345`
- `dle_password` – np. `abc123def456...` (długi hash)

**Krok 5:** Złóż je w jeden string w formacie:
```
dle_user_id=12345; dle_password=abc123def456...
```

**Krok 6:** Wklej jako wartość zmiennej `OA_SESSION_COOKIE` na Vercel

> 💡 **Uwaga:** Cookie wygasa po pewnym czasie (zwykle kilka tygodni/miesięcy).
> Jeśli addon przestanie działać – powtórz kroki 2-6.

---

## 🚀 Deploy na Vercel

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TWOJA/repo.git
git push -u origin main
# vercel.com → New Project → wybierz repo → Deploy
# Dodaj obie zmienne → Redeploy
```

Po deployu wejdź na URL projektu i kliknij "Zainstaluj w Stremio".

## 💻 Lokalnie (bez ScraperAPI)

```bash
# Plik .env w katalogu projektu:
OA_SESSION_COOKIE=dle_user_id=XXX; dle_password=YYY

npm install && npm start
# http://localhost:7000
```
