# Icon-Set: 5 Pillars + UI Glyphs

**Style:** 24px raster, stroke width 1.5px, mono look matching tokens.css (01-Aktiv/OverEngineered/design/tokens.css)
**Reference:** R-14 in 01-Aktiv/OverEngineered/Referenzen/index.md

## Contents

- `sprite.svg` — SVG sprite with all symbols (<symbol> IDs listed below)
- `icons-24/sprite_24.png`, `icons-32/sprite_32.png`, `icons-48/sprite_48.png` — PNG exports at 24/32/48px

## Pillar Icons

| ID | Description |
|---|---|
| `pillar-3dprint` | 3D-Druck |
| `pillar-esp32` | ESP32/Elektronik |
| `pillar-server` | Raspberry Pi/Heimserver |
| `pillar-robot` | Robotik |
| `pillar-design` | Design |

## UI Glyphs

| ID | Description |
|---|---|
| `ui-arrow` | Pfeil |
| `ui-folder` | Ordner |
| `ui-file` | Datei |
| `ui-terminal` | Terminal |
| `ui-link` | Externer Link |
| `ui-theme` | Mond/Sonne für Theme |
| `ui-lang` | Sprache EN/DE |

## Usage

```html
<svg><use href="icons/sprite.svg#pillar-3dprint"/></svg>
```

## ASCII Terminal View

See `ascii-icons.txt` for a pure-text representation.

## License

Created for OverEngineered project — reference R-14.