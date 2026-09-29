# FORMVOLLENDET

Bullet-Heaven-Rogue-Lite im Browser, in dem alles aus reinen geometrischen Formen besteht. Du
spielst ein Polygon: Jede **Ecke** ist ein Waffen-Slot, jede **Kante** ein Axiom-Slot (Passiv).
Elites droppen Ecken-Würfel, und das Dreieck wächst über Quadrat und Pentagon bis zum Hexagon.
Nach 20 Minuten kommt der Boss **Sierpinski**, der sich beim Tod teilt (1 → 3 → 9). Waffen,
Theoreme und Axiome steigen über ihre Kern-Stufen hinaus als **Überstufen** bis Lv 99 – ein Ende,
das kein Run erreicht.

Zwischen den Runs gibt es Splitter für das **Reißbrett** (permanente Upgrades in vier
Erweiterungsstufen), **Beweise** (Achievements) schalten Waffen, Axiome, die Form Nova, neue
Reißbrett-Einträge und -Erweiterungen, den Endlos-Modus mit wiederkehrendem Boss und die
**Komplexitäts-Leiter** K 0–20 mit Mutatoren frei, und das **Kompendium** sammelt alles, was dir
begegnet ist.

Das Designdokument liegt in [`docs/KONZEPT.md`](docs/KONZEPT.md).

Technik: TypeScript (strict), PixiJS v8 (WebGL, WebGPU als Fallback), WebAudio, Vite. Es gibt
keine Asset-Dateien: Jede Form wird prozedural gezeichnet, jeder Klang und die Musik werden live
synthetisiert.

## Schnellstart

Voraussetzung ist Node ≥ 22.18, weil die Skripte TypeScript nativ per Type-Stripping ausführen.

```sh
npm install
npm run dev        # http://localhost:5173
```

## Steuerung

| Aktion            | Tastatur                               | Gamepad              |
| ----------------- | -------------------------------------- | -------------------- |
| Bewegen           | WASD / Pfeiltasten                     | linker Stick / D-Pad |
| Signatur-Skill    | Leertaste                              | A                    |
| Pause             | Esc / P                                | Start / Back         |
| Karte wählen      | 1–4, oder ←/→ und Enter bzw. Leertaste | D-Pad / Stick + A    |
| Neu zeichnen      | R                                      | X                    |
| Radieren (Banish) | B, danach Karte wählen                 | RB, danach Karte + A |
| Überspringen      | S                                      | Y                    |
| Menü: Auswahl     | Pfeiltasten / WASD, Maus               | D-Pad / Stick        |
| Menü: bestätigen  | Enter / Leertaste, Klick               | A                    |
| Menü zurück       | Esc                                    | B                    |

Verliert das Fenster den Fokus oder wird das Gamepad getrennt, mit dem gerade gespielt wird,
pausiert das Spiel automatisch.

Browser spielen Ton erst nach einer Nutzeraktion ab. Der Ton startet daher mit dem ersten Klick
oder Tastendruck; ein Gamepad-Knopf allein genügt dafür nicht. Lautstärken für Gesamt, Effekte
und Musik stehen in den Einstellungen, die auch aus dem Pause-Menü erreichbar sind.

## Skripte

| Befehl               | Zweck                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`        | Dev-Server mit Hot Reload                                                    |
| `npm run build`      | Typecheck und Production-Build nach `dist/` (statisch hostbar, `base: './'`) |
| `npm run preview`    | Production-Build lokal ausliefern                                            |
| `npm run check`      | `tsc` + ESLint + Vitest, soll vor jedem Commit grün sein                     |
| `npm run test`       | nur Vitest (`test:watch` für den Watch-Modus)                                |
| `npm run format`     | Prettier über alles                                                          |
| `npm run sim -- …`   | headless Balance-Sim mit Autopilot, siehe unten                              |
| `npm run smoke -- …` | Browser-Smoke-Test über headless Chrome, siehe unten                         |

### Balance-Sim

```sh
node scripts/sim.ts --seeds 64 --jobs 16 [--minutes 23] [--first 1] [--char delta] [--complexity 0] [--meta [0-3]] [--endless] [--react 12]
```

Die Sim spielt komplette Runs mit einem Bot und gibt eine Tabelle pro Minute aus (Level, HP,
Gegner, Kills, Ecken, DPS), eine Zeile pro Run (mit dem tödlichen Gegner) und eine
Zusammenfassung: Niederlagen mit Median-Todeszeit, Tode vor Minute 10 und zwischen 10 und 14,
Boss erreicht und besiegt, Schaden nach Quelle, tödliche Treffer und die Splitter, die der Run
bringen würde; läuft beim Zeitlimit noch ein Boss-Kampf, zeigt die Run-Zeile den HP-Rest
(„37 % left“). `--meta n` setzt alle Reißbrett-Einträge auf ihren Maximalrang mit n
Erweiterungen (0–3, `--meta` allein = 0), das ergibt die Obergrenze der Meta-Stärke je Stufe.
`--endless` spielt den Endlos-Modus (dann z. B. `--minutes 70`). `--minutes` ist
standardmäßig die Run-Länge plus 3 Minuten für den Boss-Kampf. `--jobs` verteilt die
Seeds auf parallele Prozesse, `--react` ist die Reaktionszeit des Bots in Ticks (Standard 12 =
0,2 s). Die Simulation ist deterministisch: gleicher Seed und gleiche Eingaben ergeben denselben
Zustand, seriell wie parallel. Ziel und aktueller Stand der Balance: `docs/KONZEPT.md`, 5.3.

### Browser-Smoke-Test

Der Test startet ein lokal installiertes Chrome oder Edge headless (Pfad über `$CHROME`
überschreibbar), steuert es über das DevTools-Protokoll und schlägt fehl, sobald in der Konsole
Fehler oder Warnungen auftauchen. Screenshots landen in `.smoke/`.

```sh
npm run dev   # in einem zweiten Terminal
node scripts/smoke.ts --url "http://localhost:5173/?seed=7&debug" \
  --step wait:3000 --step shot:run --step key:F2 --step wait:400 --step shot:draft \
  --step "eval:game.session.state"
```

Mögliche Schritte:

- `wait:<ms>`
- `shot:<name>`
- `key:<code>`
- `hold:<code>:<ms>`
- `eval:<js>`

`--soft` schaltet auf Software-GL (SwiftShader) um. Das ist deutlich langsamer und für
FPS-Messungen nicht aussagekräftig.

## URL-Parameter und Debug

| Parameter        | Wirkung                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=123`      | fester Run-Seed (gilt auch für „Nochmal“)                                                                                                                         |
| `?t=1180`        | Start bei Sekunde 1180 mit einem Build auf passendem Level und passender Eckenzahl                                                                                |
| `?char=nova`     | Charakter wählen (`delta`, `nova`)                                                                                                                                |
| `?stress=1500`   | Stresstest: hält so viele Gegner am Leben (Deckel 1200), dazu Gottmodus und Auto-Draft                                                                            |
| `?debug`         | Debug-Tasten, Overlay, je 3× Neu zeichnen, Radieren und Überspringen                                                                                              |
| `?scene=shop`    | öffnet dieses Menü-Blatt statt des Titels (`title`, `select`, `shop`, `proofs`, `codex`, `settings`)                                                              |
| `?splitter=3000` | Splitter-Stand für diese Sitzung                                                                                                                                  |
| `?unlock`        | alle Beweise erbracht und das ganze Kompendium entdeckt: alle Waffen, Axiome, Formen und Modi frei, alle drei Reißbrett-Erweiterungen offen, Komplexität bis K 20 |

`seed`, `t`, `stress` und `char` starten sofort einen Run, sonst öffnet das Spiel die Menüs.
Direkte Runs mit `?debug` sind wie mit `?unlock` komplett freigeschaltet.

Der Speicherstand liegt im `localStorage`. Sitzungen mit `debug`, `t`, `stress`, `splitter` oder
`unlock` spielen auf einer Kopie, die nie zurückgeschrieben wird. Ein fester `seed` oder eine
Form per `char` zählen dagegen normal.

Debug-Tasten (nur mit `?debug` oder `?stress`):

| Taste | Wirkung                                         |
| ----- | ----------------------------------------------- |
| F1    | Overlay an/aus (FPS, Sim-/Render-ms, Entitäten) |
| F2    | +1 Level                                        |
| F3    | Elite spawnen (dropt einen Ecken-Würfel)        |
| F4    | 60 s vorspulen                                  |
| F5    | Boss spawnen                                    |
| F6    | Gottmodus                                       |
| F7    | Feld leeren                                     |

Beispiele:

- `/?seed=3&t=1193&debug` startet kurz vor dem Boss.
- `/?stress=1500` misst die Performance mit voller Horde.
- `/?scene=shop&splitter=3000` öffnet das Reißbrett mit genug Splittern zum Ausprobieren.
- `/?scene=shop&splitter=300000&unlock` öffnet das Reißbrett mit allen Erweiterungen.
- `/?scene=select&unlock` zeigt die Formwahl mit der ganzen Komplexitäts-Leiter.

## Projektstruktur

```
src/
  sim/       deterministische Simulation (kein DOM, kein Pixi, kein Math.random – per ESLint erzwungen)
  content/   Daten: Waffen, Axiome, Gegner, Wellen, Meta, Tuning, Farben, deutsche Texte (strings.de.ts)
  meta/      Speicherstand (versioniert, mit Migrationen), Splitter, Reißbrett, Beweise, Kompendium
  render/    PixiJS: Atlas, Kamera, Hintergrund, Welt, Spieler, VFX, Schadenszahlen
  audio/     WebAudio-Synthesizer, Effekte pro Sim-Event, generative Musik
  ui/        DOM-Overlay: HUD, Draft, Pause, Ergebnis; screens/ enthält die Menü-Blätter
  app/       Loop (fester 60-Hz-Tick + Interpolation), Input, Einstellungen, Debug, Attract-Demo
scripts/     sim.ts (Balance), smoke.ts (Browser-Test)
tests/       Vitest (Node)
docs/        KONZEPT.md
```

## Stand

Das MVP ist fertig, alle Meilensteine M0 bis M5:

- **Run:** 6 Waffen, 8 Axiome, 6 Theoreme (Q.E.D.-Karten), Morph vom Dreieck bis zum Hexagon, 7 Gegner-Archetypen mit Schalen, Gegnerkugeln und Telegraphs, Wellentabelle mit Events, Boss Sierpinski, Pickups.
- **Formen:** Delta mit dem Signatur-Skill Vektor, Nova mit Supernova (per Beweis frei).
- **Meta:** Speicherstand mit Migrationen, Splitter-Abrechnung pro Run, Reißbrett mit 17 Upgrades, 6 Beweise mit Freischaltungen, Kompendium, Endlos-Modus mit Komplexität 1–5 (seitdem ausgebaut, siehe unten).
- **Präsentation:** Menü-Blätter im Stil einer Konstruktionszeichnung (Titel mit laufender Demo, Formwahl, Reißbrett, Beweise, Kompendium, Einstellungen), Pause- und Ergebnis-Screen, Audio mit Effekten pro Ereignis und generativer Musik, deren Intensität der Gegnerdichte folgt.
- **Balance und Politur:** mit der Balance-Sim getunt – ein Bot ohne Meta-Upgrades stirbt im Median nach knapp 12 Minuten, mit vollem Reißbrett schafft er den Boss sicher (Zahlen in KONZEPT 5.3). Dazu Axiom-Symbole an den Kanten (lesbar ohne Farbwahrnehmung), Kristall-Sog-Spuren, eine Blitz-Reduktion ganz ohne Vollbild-Blitze und Blinken, Auto-Pause beim Trennen des Gamepads und „Besiegt von“ im Ergebnis.
- **Performance und Build:** Der Stress-Test (`?stress=1500`) hält 60 FPS mit 1200 Gegnern und 300 Kristallen (Sim etwa 0,4 ms, Render unter 1 ms pro Frame). Der Production-Build legt PixiJS in einen eigenen Chunk (Spiel etwa 64 kB, PixiJS etwa 164 kB gzip).

Darauf baut der **Langzeit-Ausbau** auf:

- **Ruhige Menüs:** Alle Blätter, Draft, Pause und Ergebnis haben feste Größen; Inhalte scrollen im Fenster, statt es wachsen zu lassen, und keine Auswahl verschiebt das Layout.
- **Run:** 20 Minuten bis zum Boss mit dichterer Timeline (Truhen-Elites um 13:00, 16:00 und 18:30). Überstufen bis Lv 99 für Waffen, Theoreme und Axiome: +10 % Kern-Schaden je Waffenstufe, alle 5 Stufen ein Meilenstein, harte Stat-Caps. Theoreme behalten das Level ihrer Waffe.
- **Endgame:** Endlos-Rhythmus mit eigener 10-Minuten-Runde und Sierpinskis Rückkehr um 30:00, 40:00 …, dazu eine Schadens-Wand ab 20:00. Komplexitäts-Leiter K 0–20 (jeder Sieg öffnet die nächste Stufe) mit 15 Mutatoren ab K 6.
- **Meta:** Reißbrett mit 23 Einträgen (6 neue) und drei Erweiterungen, die die Rang-Obergrenzen heben; 16 Beweise (10 neue). Voller Ausbau: 273 921 Splitter, rund 150 gute Runs (Pacing-Modell in KONZEPT 5.3).

Ideen für danach – weitere Formen, Waffen, Axiome, Bosse und Ebenen – sammelt Kapitel 14 von KONZEPT.md („Ausbau nach MVP“).
