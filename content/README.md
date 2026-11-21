# content/projects

One JSON per project; `index.json` lists the slugs in display order. Pages under `/en/` and `/de/` are static
HTML generated from these files (see `../README.md`, section "Adding a project").

| field | meaning |
|---|---|
| `slug` | URL part, `/en/projects/<slug>/` |
| `titel_en` / `titel_de` | title |
| `video` | V1, V2, … (video number) |
| `pillar`, `tag` | topic group / list tag |
| `status` | `idea` · `planned` · `design` · `building` · `published` |
| `dims_mm` | [w,h,d] for the CSS fallback hologram |
| `holo` | `glb`, `png` (poster), `ascii` (text fallback), `label_en/de` — files in `assets/models/` |
| `video_info.youtube_id` | `null` until the video is public (then the page shows a click-to-load player) |
| `files` | `cults3d_url`, `printables_url`, `github_url` (all `null` until published), `pwyw` |
| `bom[]` | `qty`, `teil_en/de`, `preis_eur` (`null` = unknown), `status` (`verified` / `estimate` / `owned` / `tbd`), optional `url`, `abgerufen`, `hinweis_en/de` |
| `kurz_*`, `beschreibung_*` | one-line summary / full text |
| `log[]` | dated build-log entries (`datum`, `en`, `de`) |
| `quellen` | where the facts came from (internal, not rendered) |

Rule: numbers only with a source. Unknown = `null` / `tbd`, never a guess.
