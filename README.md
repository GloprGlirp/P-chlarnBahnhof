# Kugelhagel

5-gegen-5-Shooter im Browser. Drei Modi, zwei Karten, Waffen mit Aufsätzen, Perks und Level-Freischaltungen. Leere Plätze werden mit Bots aufgefüllt – echte Spieler verdrängen sie automatisch.

## Starten

```bash
npm install
npm start
```

Dann im Browser `http://localhost:3000` öffnen. Freunde im selben Netzwerk verbinden sich über deine lokale IP, z. B. `http://192.168.0.12:3000`.

## Was drin ist

- **Modi:** Team-Deathmatch (75 Kills), Herrschaft (Flaggen A/B/C, 200 Punkte), Suchen & Zerstören (ein Leben, Bombe legen/entschärfen, 4 Rundensiege, Seitenwechsel)
- **Karten:** Werft (Containerhafen mit Lagerhalle und Kai) und Altstadt (Gassen, Marktplatz, begehbare Häuser)
- **Waffen:** 9 Primärwaffen (Sturmgewehre, MPs, Schrotflinten, MG, Präzisions- und Scharfschützengewehr) und 3 Sekundärwaffen
- **Waffenschmied:** 15 Aufsätze in 6 Kategorien, max. 5 pro Waffe, freigeschaltet über Waffenlevel (Kills mit der Waffe)
- **Tarnungen:** 8 Tarnungen pro Waffe über Herausforderungen (Kills, Kopfschüsse, Weitschüsse, Hüftfeuer, Doppel-Kills); alle 8 → **Gold**, Gold auf allen Waffen einer Klasse → **Diamant**, Diamant in allen Klassen → **Dunkle Materie** (animiert)
- **Progression:** Spielerlevel 1–55 schaltet Waffen, Perks und Ausrüstung frei; 5 eigene Klassen
- **Perks:** 9 Perks in 3 Slots (Leichtgewicht, Geist, Lautlos, Plünderer …)
- **Ausrüstung:** Splitter- und Haftgranate, Blend- und Rauchgranate, Messer
- **Movement:** Sprint, taktischer Sprint (2× Shift), Rutschen, Klettern über Kanten und durch Fenster, Ducken
- **Killstreak:** Aufklärungsdrohne bei 4 Kills in Folge
- **Netzcode:** Server-autoritativ für Treffer, Schaden und Munition, Lag-Kompensation, Bewegungsprüfung
- **Accounts:** Registrierung mit Passwort (scrypt-Hash) oder Gastzugang ohne Speicherung
- **Grafik:** Foto-Materialien (CC0) für Asphalt, Ziegel, Beton und Wellblech, HDRI-Himmel mit passendem Umgebungslicht, Schatten, Normal-Maps, Umgebungsverdeckung, Bloom; drei Qualitätsstufen in den Einstellungen (Niedrig / Mittel / Hoch)

## Steuerung

| Taste | Aktion |
|---|---|
| WASD | Bewegen |
| Maus links / rechts | Schießen / Zielen |
| Shift (2× tippen) | Sprinten (taktischer Sprint) |
| Leertaste | Springen / Klettern |
| C | Ducken, beim Sprinten Rutschen |
| R | Nachladen |
| 1 / 2 / Mausrad | Waffe wechseln |
| G / Q | Tödliche / taktische Granate |
| V | Messer |
| E | Bombe legen / entschärfen |
| Tab | Punktestand |
| T | Chat |
| Esc | Pause, Klasse wechseln |

## Online hosten (z. B. Render)

1. Repo bei [Render](https://render.com) als **Web Service** anlegen (die `render.yaml` ist schon dabei).
2. Build: `npm install`, Start: `npm start`.
3. **Wichtig für Accounts:** Auf kostenlosen Hostern wird das Dateisystem bei jedem Neustart gelöscht. Damit Level und Klassen erhalten bleiben, eine kostenlose Postgres-Datenbank anlegen (z. B. bei Neon oder Supabase) und deren URL als Umgebungsvariable `DATABASE_URL` setzen. Ohne `DATABASE_URL` speichert der Server in `data/users.json`.

| Variable | Bedeutung |
|---|---|
| `PORT` | Port (Standard 3000) |
| `DATABASE_URL` | Postgres-Verbindung für dauerhafte Accounts |
| `DATA_DIR` | Ordner für `users.json`, wenn keine Datenbank genutzt wird |
| `PGSSL=off` | SSL zur Datenbank abschalten (nur lokal) |

## Projektaufbau

```
server/   Node-Server: Lobby, Räume, Modi, Kampf, Bots, Accounts
shared/   Gemeinsamer Code: Waffen, Karten, Physik, Progression
public/   Browser-Client: Three.js-Rendering, HUD, Menüs, Sound
```

Neue Karten entstehen in `shared/maps.js` aus Boxen; Waffen und Aufsätze stehen in `shared/weapons.js`. Herkunft und Lizenzen der Assets: [CREDITS.md](CREDITS.md).
