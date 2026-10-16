# Eason Chan Recording Sessions

Swipe through every song in McDonald's Presents: Recording Sessions with Mr. Eason Chan. Mark each track 聽過 or 未聽過. Answers stay in this browser.

## Live

- https://kytse.com/eason-recording-sessions/
- https://tsekityam.github.io/eason-recording-sessions/

## Local

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 . The page loads `data/shows.json` from the same origin (26 shows, 30 albums, 321 tracks). A repeated song title is shown once, on the first night. A Demo, NG Take, or Big Band version is folded into the main title when that title is also listed, so the deck has 285 cards. Cards show the song and the date, not the album name. Opening `index.html` as a file will not load the JSON.

## Pages

The site files live at the repository root. `.github/workflows/pages.yml` deploys them on every push to `main`.

GitHub still needs one setting before the first publish: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The Actions token cannot turn Pages on by itself.

Or skip Actions and use **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**. Same files, no workflow required.

`kytse.com` is the username site custom domain. This project is served at `/eason-recording-sessions/`, so this repo has no `CNAME`.
