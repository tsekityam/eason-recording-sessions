# Eason Chan Recording Sessions

Swipe through every song in McDonald's Presents: Recording Sessions with Mr. Eason Chan. Mark each track 聽過 or 未聽過. Answers stay in this browser.

## Live

- https://kytse.com/eason-recording-sessions/
- https://tsekityam.github.io/eason-recording-sessions/

## Local

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 . The page loads `data/shows.json` from the same origin (26 shows, 30 albums, 321 tracks). Opening `index.html` as a file will not load the JSON.

## Pages

The site files live at the repository root. Publish from `main` either way:

1. **GitHub Actions** (`.github/workflows/pages.yml`): Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. **Branch**: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

`kytse.com` is the username site custom domain. This project is served at `/eason-recording-sessions/`, so this repo has no `CNAME`.
