# 🎌 OgladajAnime.pl – Stremio Addon

## 🚀 Deploy na Railway.app (zalecane)

Railway uruchamia prawdziwą przeglądarkę Chrome (Puppeteer) która potrafi obsłużyć JavaScript OA.

### Krok 1: Utwórz repozytorium GitHub
```bash
git init && git add . && git commit -m "init"
# Utwórz repo na github.com i wgraj:
git remote add origin https://github.com/TWOJE/repo.git
git push -u origin main
```

### Krok 2: Deploy na Railway
1. Wejdź na [railway.app](https://railway.app) → zaloguj się przez GitHub
2. **New Project → Deploy from GitHub repo** → wybierz swoje repo
3. Railway automatycznie wykryje Dockerfile i zbuduje projekt

### Krok 3: Dodaj zmienne środowiskowe
Railway → twój projekt → **Variables**:

| Zmienna | Opis |
|---------|------|
| `OA_SESSION_COOKIE` | `accepted=1; cf_clearance=XXX; PHPSESSID=XXX; user_id=XXX; user_key=XXX` |
| `PORT` | `7000` |

### Krok 4: Zainstaluj w Stremio
Po deployu Railway da ci URL (np. `https://twoj-addon.up.railway.app`).
Wejdź na ten URL → kliknij "Zainstaluj w Stremio".

---

## 🍪 Jak skopiować OA_SESSION_COOKIE

1. Zaloguj się na ogladajanime.pl w Firefox
2. **F12 → Storage → Cookies → https://ogladajanime.pl**
3. Skopiuj wartości: `accepted`, `cf_clearance`, `PHPSESSID`, `user_id`, `user_key`
4. Złóż w jeden string:
```
accepted=1; cf_clearance=WARTOŚĆ; PHPSESSID=WARTOŚĆ; user_id=WARTOŚĆ; user_key=WARTOŚĆ
```

> Cookie wygasa co kilka tygodni – jeśli addon przestanie działać, odśwież cookie.

---

## 💻 Lokalnie

```bash
OA_SESSION_COOKIE="..." npm start
# http://localhost:7000
```
