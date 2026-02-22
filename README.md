# 🎌 OgladajAnime.pl – Stremio Addon

Nieoficjalny addon Stremio dla ogladajanime.pl.

## ⚙️ Wymagane zmienne środowiskowe na Vercel

Wejdź: **Vercel → projekt → Settings → Environment Variables**

| Zmienna | Opis | Wymagana? |
|---------|------|-----------|
| `SCRAPER_API_KEY` | Klucz API z scraperapi.com | ✅ Tak (omija blokadę IP) |
| `OA_LOGIN` | Login do konta ogladajanime.pl | ✅ Tak (dostęp do playerów) |
| `OA_PASSWORD` | Hasło do konta ogladajanime.pl | ✅ Tak |

### Dlaczego potrzebne konto OA?

OA wymaga zalogowania żeby oglądać odcinki. Bez konta strona pokazuje listę
odcinków ale nie udostępnia linków do playerów (komunikat: "Zaloguj się aby
uzyskać dostęp do wszystkich treści").

**Konto OA jest darmowe** – zarejestruj się na ogladajanime.pl.

### Jak dodać zmienne na Vercel:
1. Vercel → twój projekt → **Settings** → **Environment Variables**
2. Dodaj każdą zmienną osobno (Name + Value)
3. Kliknij **Save** po każdej
4. **Redeploy**: Deployments → najnowszy deploy → **...** → **Redeploy**

## 🚀 Deploy na Vercel

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TWOJA/repo.git
git push -u origin main
# Potem: vercel.com → New Project → wybierz repo → Deploy
# Dodaj zmienne środowiskowe → Redeploy
```

## 💻 Uruchomienie lokalne

```bash
# Utwórz plik .env w katalogu projektu:
echo "OA_LOGIN=twoj_login" >> .env
echo "OA_PASSWORD=twoje_haslo" >> .env
echo "SCRAPER_API_KEY=twoj_klucz" >> .env  # opcjonalne lokalnie

npm install
npm start
# Addon na http://localhost:7000
```

## Obsługiwane hostingi
Vidoza, CDA.pl, MP4Upload, Sibnet, YouTube, DoodStream, StreamTape, VOE, FileMoon
