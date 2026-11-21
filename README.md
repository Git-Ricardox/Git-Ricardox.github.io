# thoughtfullycomplicateded

Website for the *thoughtfullycomplicateded* workshop channel: everyday problems, over-engineered (ESP32, 3D printing).
Plain static files for **GitHub Pages**. No build step, no dependencies, no tracking.

```
/                      language redirect (stored choice / browser language, fallback links)
/en/  /de/             start page per language (real files, no hash routes)
/en/projects/<slug>/   project page (same in /de/)
/en/{about,projects,contact,files,legal,help}/
content/projects/      project data (JSON) — source of truth for the project pages and the command line
assets/                tokens.css, fonts/, css/, js/app.js, holo/ (holo.js + vendored three), models/ (GLB), icons/, video-graphics/
legal/                 imprint / privacy PLACEHOLDERS (D17 replaces them)
404.html  sitemap.xml  robots.txt  .nojekyll  CNAME.example
```

## Run locally

```
python3 -m http.server 8000      # then open http://localhost:8000/
```
Use a server, not `file://` (ES modules + `fetch`). The site is written for the domain root.

## Deploy (GitHub Pages)

1. Create an empty GitHub repo, push `main`.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. Custom domain: rename `CNAME.example` to `CNAME` (one line, the domain), set the same domain in Settings → Pages, enable *Enforce HTTPS*, point DNS at GitHub. Details: `01-Aktiv/OverEngineered/website/REPO-SETUP.md` in the vault.
4. Replace `https://thoughtfullycomplicateded.com` (canonical/hreflang/sitemap) if the domain differs — see "Changing the domain".

Project-site URL (`user.github.io/<repo>/`) does **not** work: pages use absolute-from-root paths in `404.html` and the
JS root detection assumes the site sits at `/`. Use a custom domain or a `<user>.github.io` repo.

## Adding a project

1. Add `content/projects/<slug>.json` (fields: `content/README.md`) and append the slug to `content/projects/index.json`.
2. Put `<name>.glb`, `<name>.png`, `<name>.ascii.txt` in `assets/models/`.
3. Regenerate the static pages (OFFEN-23: until 6 projects the generator lives in the vault, not in this repo):
   `python3 <vault>/01-Aktiv/OverEngineered/website/scaffold_pages.py .`
   Or copy the new project page by hand from an existing one. From 6 projects on, copy the script in here as `build.py`.

## Changing the domain

`SITE` constant in `scaffold_pages.py`, then regenerate; or search/replace `thoughtfullycomplicateded.com` in `sitemap.xml`, `robots.txt`, `index.html`, `en/**`, `de/**`.

## Hologram

`assets/holo/holo.js` mounts a vendored three.js build (`assets/holo/vendor/`, MIT) on `[data-holo]` slots. Order: WebGL GLB → poster PNG → ASCII
text → CSS cube. Respects `prefers-reduced-motion`. Models are simplified stand-ins, not final CAD.

## Status of content

Texts are facts from the project notes: tram clock = design only, hook = printer calibrated but hook not built, mailbox sensor = idea.
Contact addresses and the legal pages are **placeholders** (`example.invalid`, `[…]`) until the accounts and D17 texts exist.

## Licenses

Code: choose before publishing (suggestion: MIT). three.js: MIT (`assets/holo/vendor/LICENSE-three.txt`). Fonts: see `assets/fonts/` (OFL files). Content/models: decide per project (CC BY-NC / pay-what-you-want on Cults3D/Printables).
