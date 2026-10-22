# Credits

Alle eingebundenen Fremd-Assets sind gemeinfrei (CC0 1.0) – keine Namensnennung nötig, hier trotzdem aufgelistet.

## Texturen (`public/assets/textures/`)

| Ordner | Material | Quelle | Lizenz |
|---|---|---|---|
| `asphalt031/` | Asphalt 031 | [ambientCG](https://ambientcg.com/view?id=Asphalt031) | CC0 1.0 |
| `bricks101/` | Bricks 101 | [ambientCG](https://ambientcg.com/view?id=Bricks101) | CC0 1.0 |
| `concrete034/` | Concrete 034 | [ambientCG](https://ambientcg.com/view?id=Concrete034) | CC0 1.0 |
| `corrugatedsteel005/` | Corrugated Steel 005 | [ambientCG](https://ambientcg.com/view?id=CorrugatedSteel005) | CC0 1.0 |

Die Dateien stammen in verkleinerter 1K-Fassung aus dem Repo [ricschuster/crosstown](https://github.com/ricschuster/crosstown) (`src/game/scene/materials`), das sie von ambientCG übernommen hat.

## Himmel / Umgebungslicht (`public/assets/hdri/`)

| Datei | Quelle | Lizenz |
|---|---|---|
| `quarry_01_1k.hdr` | [Poly Haven – Quarry 01](https://polyhaven.com/a/quarry_01) | CC0 1.0 |
| `venice_sunset_1k.hdr` | [Poly Haven – Venice Sunset](https://polyhaven.com/a/venice_sunset) | CC0 1.0 |

Bezogen über das [three.js-Repository](https://github.com/mrdoob/three.js) (`examples/textures/equirectangular`).

## Selbst erstellt

Alle übrigen Texturen (Holz, Kisten, Kopfsteinpflaster, Dachziegel, Steine, Fässer, Tarnmuster, Wasser) samt Normal-Maps, alle Waffen- und Soldatenmodelle sowie alle Sounds werden zur Laufzeit im Code erzeugt.

## Bibliotheken

- [three.js](https://threejs.org) – MIT
- [Express](https://expressjs.com) – MIT
- [ws](https://github.com/websockets/ws) – MIT
- [node-postgres](https://node-postgres.com) – MIT
