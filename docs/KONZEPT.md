# FORMVOLLENDET

**Game-Design-Dokument** · Arbeitstitel · Stand 28.09.2026 · Konzept für das MVP (Meilensteine M0–M5)

> **Hinweis zu allen Zahlen:** Die Werte in diesem Dokument geben den Stand der Implementierung wieder. Verbindlich sind die Datentabellen in `src/content` (vor allem `tuning.ts`, `weapons.ts`, `axioms.ts`, `enemies.ts`, `waves.ts`, `characters.ts` und `meta.ts`); sie werden per Balance-Simulation (`scripts/sim.ts`) weiter getunt, und bei Abweichungen gilt der Code. Alle Meilensteine des MVP sind fertig: ein kompletter 15-Minuten-Run (M0–M3); Speicherstand, Splitter, Reißbrett, Beweise, Titel und Formwahl, Kompendium, Einstellungs-Screen, Audio, Endlos-Modus und Komplexität (M4); Balance, Juice und Politur (M5). Was darüber hinausgeht, trägt den Status-Marker _(Ausbau)_. Kursive Tabellenwerte kennzeichnen nur noch Entwürfe, für die es keinen Code gibt.

---

## 1. Überblick

**Pitch.** FORMVOLLENDET ist ein Bullet-Heaven-Rogue-Lite, in dem alles – Spieler, Gegner, Geschosse, Beute – aus reiner Geometrie besteht. Du beginnst jeden Run als schlichtes Dreieck, erbeutest neue Ecken und wächst bis zum Hexagon; jede Ecke trägt eine Waffe, jede Kante ein Axiom, sodass dein Build buchstäblich an deinem Körper ablesbar ist. Wer die richtigen Waffen und Axiome kombiniert, „beweist“ Theoreme und verwandelt Schulgeometrie in ein Feuerwerk.

|                   |                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Genre**         | Bullet Heaven / Survivors-like (Vampire-Survivors-Genre), Rogue-Lite mit Meta-Progression                                                                      |
| **Plattform**     | Desktop-Browser, statisch hostbar, keine Installation                                                                                                          |
| **Steuerung**     | Tastatur oder Gamepad: Bewegen plus ein aktiver Signatur-Skill, alle Waffen feuern automatisch                                                                 |
| **Run-Länge**     | 15 Minuten bis zum Boss, danach Ergebnis-Screen                                                                                                                |
| **Sprache**       | Deutsch (alle UI-Texte zentral in `strings.de.ts`; Namen und Beschreibungen von Waffen, Axiomen, Gegnern usw. stehen in den Datentabellen unter `src/content`) |
| **Technik**       | TypeScript + PixiJS v8, prozedurale Grafik, Synth-Audio über WebAudio, keine Asset-Dateien                                                                     |
| **Leistungsziel** | 60 FPS bei rund 1000 gleichzeitigen Gegnern (Stress-Test `?stress=1500`: 60 FPS mit 1200 Gegnern und 300 Kristallen)                                           |

Der Spieler steuert nur die Bewegung und das Timing eines einzigen Skills. Die Tiefe entsteht zwischen den Momenten: in den Level-Up-Drafts, in der Frage, welche Ecke welche Waffe bekommt, und im langfristigen Ausbau über viele Runs.

## 2. Design-Pfeiler

| #   | Pfeiler                          | Begründung                                                                                                                                                                                                                                          |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Geometrie ist alles**          | Jedes Element ist eine reine Form, und die Form verrät die Funktion. Das gibt dem Spiel eine sofort wiedererkennbare Identität und macht Regeln ohne Text lernbar: Spitzes ist schnell, Rundes kommt im Schwarm, Großes und Kantiges hält viel aus. |
| 2   | **Deine Form ist dein Build**    | Das Spieler-Polygon zeigt den Build am Körper: Eckenzahl = Fortschritt, Glyphen an den Ecken = Waffen, leuchtende Kanten = Axiome. Fortschritt ist damit keine Zahl im Menü, sondern in jeder Sekunde sichtbar.                                     |
| 3   | **Chaos bleibt lesbar**          | Feste Farbcodes, Gegnerkugeln immer auf der obersten Ebene und ein Telegraph vor jedem Angriff. Hunderte Gegner sollen sich überwältigend anfühlen, Treffer aber nie unfair.                                                                        |
| 4   | **Kurze Runs, lange Motivation** | 15-Minuten-Runs passen in eine Pause. Meta-Progression, Beweise und Freischaltungen liefern den Grund für den nächsten Run.                                                                                                                         |
| 5   | **Web-first**                    | Keine Asset-Dateien: Grafik entsteht prozedural, Audio wird synthetisiert. Das hält den Download winzig; 60 FPS bei rund 1000 Gegnern sind das technische Mindestziel.                                                                              |

## 3. Kern-Mechanik „Polygon-Evolution“

### 3.1 Ecken und Kanten

Der Spieler **ist** ein Polygon. Jeder Run startet mit einem **Dreieck**.

- **Ecke = Waffen-Slot.** Die Glyphe der Waffe sitzt direkt an der Ecke, und die Waffe feuert von dort. Eine Waffe, die vom Eckpunkt schießt, dreht sich also mit dem Polygon mit.
- **Kante = Axiom-Slot.** Axiome sind passive Boni. Eine belegte Kante leuchtet in der Farbe ihres Axioms, eine leere Kante bleibt blass (Charakterfarbe mit 35 % Deckkraft). Kante i verbindet Ecke i mit Ecke i+1.
- Ecken und Kanten wachsen immer gemeinsam: Ein n-Eck hat n Waffen- und n Axiom-Slots.

| Form     | Waffen-Slots (Ecken) | Axiom-Slots (Kanten) | Erreicht durch                   |
| -------- | -------------------- | -------------------- | -------------------------------- |
| Dreieck  | 3                    | 3                    | Start                            |
| Quadrat  | 4                    | 4                    | 1. Ecken-Würfel                  |
| Pentagon | 5                    | 5                    | 2. Ecken-Würfel                  |
| Hexagon  | 6                    | 6                    | 3. Ecken-Würfel (Maximum im MVP) |

### 3.2 Morph-Ablauf

Elites droppen einen **Ecken-Würfel**. Sobald der Spieler ihn aufhebt, läuft der Morph ab:

1. Die Simulation stoppt für **0,8 s**; die Welt friert ein, niemand nimmt Schaden.
2. Aus der Mitte der schließenden Kante (von der letzten zur ersten Ecke) wächst eine neue Ecke heraus, mit einem weißen Aufblitzen an der Spitze. Die geteilte Kante behält ihr Axiom auf der ersten Hälfte, die zweite Hälfte wird zur neuen, leeren Kante.
3. Das Polygon rundet sich wieder zu einer regelmäßigen Form ab.
4. Ein weißer Schockwellen-Ring (bis 300 px) und ein Ring in der Charakterfarbe laufen vom Spieler aus, dazu Funken, ein Screenshake und das Banner **„FORM: QUADRAT“** (bzw. PENTAGON, HEXAGON) mit der Unterzeile „+1 Ecke · +1 Kante“. Dazu erklingt der Morph-Akkord, der mit jeder Form höher und schärfer wird (12).
5. Ergebnis: **+1 Waffen-Slot und +1 Axiom-Slot**. Schon der nächste Draft kann eine neue Waffe und ein neues Axiom anbieten.

Der Weg lautet **3 → 4 → 5 → 6**; das Hexagon ist das Maximum. Hebt der Spieler einen Ecken-Würfel erst als Hexagon auf, wirkt er wie ein Truhen-Würfel (Abschnitt 9). Im Ausbau folgt der Kreis als „Polygon mit unendlich vielen Ecken“ (Abschnitt 14).

### 3.3 Rotation und Drehimpuls

Das Polygon rotiert konstant mit einem **Drehimpuls von 0,8 rad/s** (eine volle Umdrehung in knapp 8 s). Das ist Optik und Mechanik zugleich:

- Radial feuernde Eck-Waffen wie der **Strahl** fegen dadurch von selbst im Kreis und bestreichen das ganze Umfeld.
- Auto-Aim-Waffen (Spitze, Fraktal) zielen auf die nächsten Gegner in Reichweite und feuern vom jeweils aktuellen Eckpunkt; die wandernden Abschusspunkte erzeugen ein lebendiges Muster. Ohne Ziel in Reichweite halten sie das Feuer zurück.
- Orbit- und Aura-Waffen (Kreisbahn, Zirkel) sind auf den Kern zentriert, und auch die **Welle** startet im Kern und läuft in Blickrichtung; bei diesen Waffen zeigt die Ecke nur Slot und Glyphe.

Weil sich das Polygon ständig dreht, zeigt ein kleiner Chevron außerhalb des Polygons die **Blickrichtung** an, also die letzte Bewegungsrichtung (zu Beginn nach rechts).

### 3.4 Kern-Punkt (Hitbox)

In der Mitte des Polygons sitzt der **Kern-Punkt** mit **r = 8 px**. Nur er ist die Hitbox, nicht das ganze Polygon (Umkreis 18 px, +2 px je weitere Ecke). Das ist Bullet-Hell-Konvention: Die Form darf groß und prächtig werden, ohne den Spieler dafür zu bestrafen, und knappes Ausweichen zwischen Kugeln bleibt möglich. Der Kern wird als weiß leuchtender Punkt gezeichnet; ein feiner, blasser Ring zeigt die 8-px-Hitbox. So ist er immer klar erkennbar.

### 3.5 Skizze: vom Dreieck zum Hexagon

```
   Dreieck           Quadrat          Pentagon           Hexagon
   3 Ecken           4 Ecken           5 Ecken           6 Ecken

      ●             ●───────●             ●               ●───●
     / \            │       │           /   \            /     \
    /   \      ▶    │   ·   │    ▶    ●   ·   ●    ▶    ●   ·   ●
   /  ·  \          │       │          \     /           \     /
  ●───────●         ●───────●           ●───●             ●───●

  ●  Ecke = Waffen-Slot      Linie = Kante = Axiom-Slot      ·  Kern-Punkt (Hitbox)
  ▶  Ecken-Würfel aufgehoben: Morph (+1 Ecke, +1 Kante)
```

### 3.6 Warum das den Build lesbar macht

- **Fortschritt auf einen Blick:** Die Eckenzahl zeigt, wie weit der Run ist – für den Spieler wie für Zuschauer.
- **Waffen sind verortet:** Jede Waffe hat einen festen Platz am Körper. Man sieht, woher welcher Schuss kommt; ein Theorem ersetzt die Waffe im selben Slot, trägt eine eigene Farbe und bekommt einen goldenen Ring um die Glyphe.
- **Passives wird sichtbar:** Leuchtende Kanten machen Axiome greifbar, eine blasse Kante ist eine offene Entscheidung.
- **Knappheit erzeugt Entscheidungen:** Weil Slots an Ecken und Kanten hängen, ist jede neue Waffe ein Commitment, und der Ecken-Würfel wird zum echten Etappenziel.
- **Ein Bild für alles:** Das Mini-Build-Polygon im HUD, die Build-Übersicht im Pause-Screen und der Ergebnis-Screen verwenden dieselbe Darstellung.

## 4. Game Loops

| Ebene        | Takt       | Was der Spieler tut                                                                                                                      | Belohnung / Entscheidung                                          |
| ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Sekunden** | 1–10 s     | bewegen, ausweichen, Kristalle einsammeln, Signatur-Skill timen                                                                          | Überleben, XP, das befriedigende Zerspringen der Gegner in Kanten |
| **Minute**   | 15–90 s    | Level-Up-Draft (3 Karten; anfangs etwa alle 30 s, in der zweiten Run-Hälfte etwa alle 15 s), Wellenwechsel, Events (Umzingelung, Gerade) | neue Waffen und Axiome, Stufenaufstiege, Theorem-Chancen          |
| **Run**      | 15:00      | 3 Ecken erbeuten → Hexagon, Theoreme beweisen, Boss „Sierpinski“ besiegen                                                                | Form-Aufstiege, Theoreme, Splitter, neue Beweise                  |
| **Meta**     | viele Runs | Splitter im **Reißbrett** investieren (permanente Stats), **Beweise** (Achievements) erfüllen, Kompendium füllen                         | freigeschaltete Waffen, Axiome, Charaktere und Modi               |

**Motivationskurve.** Der Run ist als Folge von Spannungsspitzen gebaut, nicht als gleichförmiger Anstieg:

- **Anlauf (0–3 min):** Die XP-Kurve ist anfangs flach, die ersten Level-Ups kommen in schneller Folge. Der Spieler trifft viele kleine Entscheidungen und fühlt sich schnell stärker.
- **Etappenziele im Drei-Minuten-Takt:** Die Elites um 3:00, 6:00 und 9:00 bringen jeweils einen Morph – einen sichtbaren und hörbaren Machtsprung mit neuen Slots. Dazwischen brechen die Events (4:30, 7:30) die Monotonie der Wellen und prüfen die Positionierung; um 10:30 schließt sich eine Keil-Umzingelung.
- **Zweite Hälfte – Theoreme:** Sobald die ersten Waffen Lv 8 erreichen, werden Q.E.D.-Karten zur zweiten Art von Machtsprung. Der Build „schließt sich“.
- **Finale:** Die Doppel-Elite um 12:00 belohnt vor der Schlussphase, Umzingelung 2 um 13:30 ist die letzte Prüfung, der Boss um 15:00 der Höhepunkt mit klarer Siegbedingung.
- **Nach dem Run:** Der Ergebnis-Screen rechnet die Splitter ab und zeigt neue Beweise; der kurze Weg über den Titel ins Reißbrett erzeugt den „einen Run noch“-Sog.

## 5. Run-Ablauf

### 5.1 Timeline (15:00)

Die Timeline ist eine Datentabelle (`content/waves`) und lässt sich ohne Codeänderung tunen.

| Zeit  | Ereignis                                                                                                                                  | Neu im Gegner-Pool | Erwartete Form |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| 0:00  | Start: Dreieck + Startwaffe                                                                                                               | Punkt              | Dreieck        |
| 1:00  | –                                                                                                                                         | Keil               | Dreieck        |
| 3:00  | **Elite 1** (Block) → Ecken-Würfel                                                                                                        | Block, Rhombus     | → Quadrat      |
| 4:30  | Event **Umzingelung**: ein Ring aus 20 Blöcken (r 430 px) schließt sich                                                                   | –                  | Quadrat        |
| 6:00  | **Elite 2** (Rhombus) → Ecken-Würfel                                                                                                      | Werfer, Stern      | → Pentagon     |
| 7:30  | Event **Gerade**: eine Wand aus 40 Punkten fegt quer übers Feld                                                                           | –                  | Pentagon       |
| 9:00  | **Elite 3** (Werfer) → Ecken-Würfel                                                                                                       | Wabe               | → Hexagon      |
| 10:30 | Event **Keil-Umzingelung**: ein Ring aus 28 Keilen (r 450 px)                                                                             | –                  | Hexagon        |
| 12:00 | **Doppel-Elite** (2 Waben) → je ein Truhen-Würfel (3 Upgrades + 15 Splitter)                                                              | –                  | Hexagon        |
| 13:30 | Event **Umzingelung 2**: 36 Blöcke (r 460 px), dichter                                                                                    | –                  | Hexagon        |
| 15:00 | **Boss „Sierpinski“**, normale Spawns laufen auf 30 % weiter                                                                              | –                  | Hexagon        |
| Sieg  | Banner „BEWIESEN“, gut 3 s später der Ergebnis-Screen (im Endlos-Modus, per Beweis freigeschaltet, geht der Run stattdessen weiter; 10.5) | –                  | –              |

### 5.2 Director-Prinzip

Der **Director** entscheidet, was wann wo erscheint. Er arbeitet mit vier Werkzeugen:

- **Spawn-Rate und Obergrenze:** Die Wellentabelle teilt den Run in Segmente. Innerhalb eines Segments steigt die Spawn-Rate linear (Gegner pro Sekunde), und eine Obergrenze lebender Gegner (`maxAlive`) deckelt die Dichte. Auch die Punkte, die Waben ausbrüten, zählen gegen diese Obergrenze; ist sie erreicht, schlüpft nichts, sonst würden liegen gelassene Waben das Feld fluten. Ein Punktebudget pro Archetyp gibt es nicht; wie bedrohlich eine Welle ist, steuern Rate, Obergrenze und die Mischung im Pool. Die Komplexität hebt die Rate zusätzlich an, der Endlos-Modus lässt Rate und Obergrenze nach 15:00 weiter wachsen (10.5).
- **Segment-Pools:** Jedes Segment legt fest, welche Archetypen mit welchem Gewicht gezogen werden. Neue Archetypen kommen zu den Zeitpunkten der Timeline hinzu, ältere bleiben im Pool.

| Segment     | Spawn-Rate (Gegner/s) | Max. lebend | Pool (Gewichte)                                                        |
| ----------- | --------------------- | ----------- | ---------------------------------------------------------------------- |
| 0:00–1:00   | 1,1 → 2,4             | 84          | Punkt                                                                  |
| 1:00–3:00   | 2,4 → 4,4             | 168         | Punkt 3, Keil 1                                                        |
| 3:00–6:00   | 4,4 → 6,0             | 264         | Punkt 3, Keil 2, Block 1, Rhombus 1                                    |
| 6:00–9:00   | 6,0 → 8,2             | 384         | Punkt 3, Keil 2, Block 1,5, Rhombus 1,5, Werfer 1, Stern 1             |
| 9:00–12:00  | 8,2 → 10,5            | 504         | Punkt 3, Keil 2, Block 2, Rhombus 1,5, Werfer 1,2, Stern 1,2, Wabe 0,5 |
| 12:00–15:00 | 10,5 → 13,2           | 624         | Punkt 2, Keil 2, Block 2, Rhombus 2, Werfer 1,5, Stern 1,5, Wabe 0,8   |

- **Spawn-Ort und Leine:** Gegner erscheinen 70 px außerhalb des sichtbaren Rechtecks, in zufälliger Richtung vom Spieler aus. Wer weiter als die Bilddiagonale + 420 px entfernt ist, wird an den Bildrand vor den Spieler versetzt (Blickrichtung ±1 rad); so bleibt die Dichte erhalten, und Weglaufen ist keine Strategie. Die Punkte der Geraden werden stattdessen entfernt, Boss-Teile erst ab dem 1,5-fachen Abstand zurückgeholt.
- **Skript-Ereignisse** aus der Wellentabelle, zusätzlich zu den normalen Spawns:
  - **Umzingelung** (4:30): Ein geschlossener Ring aus 20 Blöcken erscheint im Abstand von 430 px um den Spieler und zieht sich zusammen, weil alle Blöcke auf ihn zulaufen. Lösung: eine Lücke freischießen oder mit dem Signatur-Skill durchbrechen. Die **Keil-Umzingelung** (10:30) schließt mit 28 Keilen (r 450 px) einen schnelleren Ring, **Umzingelung 2** (13:30) ist mit 36 Blöcken (r 460 px) dichter. Banner „UMZINGELUNG“.
  - **Gerade** (7:30): Eine Wand aus 40 Punkten (Abstand 22 px) tritt an einer zufälligen Seite ein und marschiert als gerade Linie quer über das Feld. Lösung: eine Bresche schießen oder im richtigen Moment hindurch-dashen. Banner „DIE GERADE“.
  - **Elites** zu festen Zeiten mit festem Typ und eigenem HP-Faktor (8.5): Block (3:00), Rhombus (6:00), Werfer (9:00) und zwei Waben (12:00). Sie erscheinen am Bildrand, begleitet vom Banner „ELITE – Besiege sie – sie trägt einen Würfel“. Ein Pfeil am Bildschirmrand zeigt liegen gebliebene Würfel an; Elites selbst bekommen keinen Pfeil.
  - **Boss** um 15:00: Die normalen Spawns laufen auf 30 % weiter, damit noch XP fließt, der Fokus aber beim Boss liegt. Der Run endet erst mit dem Sieg über alle Boss-Kopien oder mit dem Tod des Spielers (im Endlos-Modus nur mit dem Tod, 10.5).

### 5.3 Balance-Ziel

Die headless Balance-Simulation (`npm run sim`, also `node scripts/sim.ts [--seeds 10] [--first 1] [--minutes 15] [--char delta] [--complexity 0] [--meta] [--jobs 4] [--react 12]`) lässt einen Bot-Spieler über mehrere Seeds laufen; alle Waffen und Axiome sind dabei freigeschaltet. Sie gibt pro Minute – gemittelt über die noch lebenden Seeds – die Zahl der überlebenden Runs, Level, HP, Gegnerzahl, Kills, erreichte Form, DPS und die Rechenzeit pro Tick aus, dazu eine Zeile pro Run (mit dem Gegnertyp, der den tödlichen Treffer gesetzt hat) und eine Zusammenfassung: Niederlagen mit Median-Todeszeit, Tode vor Minute 8 und zwischen 8 und 12, Boss erreicht und besiegt, erlittener Schaden nach Quelle und tödliche Treffer. `--meta` setzt alle Reißbrett-Upgrades auf ihren Maximalrang (Obergrenze der Meta-Stärke), `--first` wählt den ersten Seed, `--jobs` verteilt die Seeds auf parallele Prozesse (mit demselben Ergebnis wie seriell).

Der **Bot** bewertet 16 Richtungen: Gefahr durch Gegner, gezündete Sterne und Kugeln entlang einer kurzen Vorschau, Zug zum Ziel, etwas Schwung. Ziele in dieser Reihenfolge: ein Würfel, eine Heilung (unter 70 % HP), bei mehr als 50 % HP die nächste Würfel-Elite oder das nächste Boss-Teil, sonst Kristalle. Auf dem Weg zu Würfel oder Elite beachtet er nur Gegner in unmittelbarer Nähe oder mit laufendem Telegraph, und liegt ein Würfel in Reichweite des Signatur-Skills, setzt er ihn dafür ein – so, wie ein Mensch es täte. `--react` ist seine Reaktionszeit: Er plant nur alle n Ticks neu (Standard 12 Ticks = 0,2 s; 1 wäre übermenschlich). Im Draft nimmt er Theoreme, dann Waffen-Level, neue Waffen, Axiome.

Zielbild: **Ein Bot ohne Meta-Upgrades stirbt meist zwischen Minute 8 und 12; ein guter Build schafft den Boss.** Stand (64 Seeds, 20 Minuten): Delta ohne Meta verliert 59 von 64 Runs, Median 9:53; 29 davon sterben zwischen Minute 8 und 12, 14 früher; 7 erreichen den Boss, 5 besiegen ihn, in 10 bis 80 s. Nova (−20 % HP) verliert 55, Median 10:01, davon 18 vor Minute 8. Mit voller Meta überleben alle 64 Runs, 63 besiegen den Boss. Den meisten Schaden richten Rhombus, Block und Keil an. Die wichtigsten Stellschrauben waren das Gegnertempo (8.7) – vorher lief der Spieler allem davon – und die exponentielle HP-Kurve, die mit dem stark wachsenden Schaden später Builds Schritt hält.

## 6. Spieler-Charaktere

Alle Charaktere wachsen im Run von 3 auf 6 Ecken. Sie unterscheiden sich im **Stil ihrer Silhouette**, in den Grundwerten, der Startwaffe und dem Signatur-Skill (Space bzw. Gamepad A).

| Form      | Stil / Farbe                                   | Rolle      | Startwaffe | Eigenschaft                                                                    | Signatur-Skill                              | MVP                                 |
| --------- | ---------------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------- |
| **Delta** | reguläres, spitzes Polygon · Cyan `#3FF0FF`    | Allrounder | Spitze     | +10 % Projektiltempo                                                           | **Vektor**                                  | ✔ ab Start                          |
| **Nova**  | Sternpolygon (Zacken = Ecken) · Gold `#FFD23F` | Glaskanone | Kreisbahn  | +15 Prozentpunkte Krit, −20 % HP, etwas schneller; Krits sprühen 3 Mini-Zacken | **Supernova**                               | ✔ Freischaltung („Vollendete Form“) |
| Bastion   | dicke Kanten · Azur                            | Tank       | Zirkel     | +2 Rüstung, −10 % Tempo                                                        | Bollwerk: Hex-Schild blockt 2 s lang Kugeln | Ausbau                              |
| Zirkel    | gerundete Ecken · Silber                       | Fläche     | Kreisbahn  | +15 % Fläche                                                                   | Puls: Schockwelle, zieht Kristalle an       | Ausbau                              |
| Fraktal   | Mini-Polygone an den Ecken · Lime              | Beschwörer | Fraktal    | +1 Teilprojektil                                                               | Teilung: 2 Klone für 4 s                    | Ausbau                              |

### 6.1 Basiswerte

Delta ist die Referenz; die anderen Formen werden als Abweichung davon definiert.

| Wert                      | Delta    | Nova                     |
| ------------------------- | -------- | ------------------------ |
| Max-HP                    | 100      | 80 (−20 %)               |
| Lauftempo                 | 160 px/s | 170 px/s                 |
| Sammelradius              | 60 px    | 60 px                    |
| Krit-Chance               | 5 %      | 20 % (+15 Prozentpunkte) |
| Krit-Schaden              | ×2       | ×2                       |
| Projektiltempo            | +10 %    | ±0                       |
| Hitbox (Kern-Punkt)       | r = 8 px | r = 8 px                 |
| Unverwundbar nach Treffer | 0,5 s    | 0,5 s                    |

**Rüstung** (Reißbrett „Dichte“, im Ausbau auch Bastion): Jeder Punkt senkt den Schaden pro Treffer um 1, mindestens 1 Schaden kommt immer durch.

**Nova-Passiv:** Jeder kritische Treffer sprüht 3 Mini-Zacken vom getroffenen Gegner aus (je 4 Schaden, skaliert mit dem Schadensbonus; 380 px/s, 0,45 s Flugzeit). Die Zacken selbst können nicht kritisch treffen. Krits lösen so in dichten Horden eine kurze Kettenreaktion aus, die sich aber nicht endlos fortpflanzt.

### 6.2 Signatur-Skills

Der Signatur-Skill ist neben der Bewegung die einzige aktive Eingabe. Er ist als **Timing-Werkzeug** gedacht (Ausweichen, Durchbrechen, Befreiungsschlag), nicht als DPS-Rotation. Sein Cooldown erscheint als Ring im HUD.

|                   | **Vektor** (Delta)                                                                                                                                    | **Supernova** (Nova)                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wirkung           | Dash über 150 px in 0,15 s in Bewegungsrichtung (ohne Eingabe: letzte Richtung)                                                                       | 16 Zacken schießen radial aus dem Polygon: je 15 Schaden, 420 px/s, Durchschlag 3, 0,8 s Flugzeit                                                                                                        |
| Schutz            | 0,3 s i-Frames                                                                                                                                        | 0,3 s i-Frames                                                                                                                                                                                           |
| Zusatz            | hinterlässt 0,5 s lang eine Schadenslinie entlang der Dash-Strecke: 20 Schaden, jeder Gegner wird höchstens einmal getroffen und seitlich weggestoßen | starker Knockback auf alle Gegner im Umkreis von 220 px: Stoß mit 900 px/s, zum Rand hin auf 50 % abfallend (ohne Resistenz rund 100 px Weg im Zentrum, halb so viel am Rand); der Boss bleibt unberührt |
| Cooldown          | 4 s                                                                                                                                                   | 8 s                                                                                                                                                                                                      |
| Typischer Einsatz | Ringe (Umzingelung) und Wände (Gerade) durchbrechen, Ausweichen in letzter Sekunde                                                                    | Luft verschaffen, wenn die Horde zu nah ist; Kristallfelder freiräumen                                                                                                                                   |

Schaden, Zackentempo und Cooldown skalieren mit den Stats des Spielers (Schadensbonus, Projektiltempo, Cooldown-Bonus). Ein Tastendruck wird 0,15 s lang gepuffert; wer die Taste hält, löst den Skill aus, sobald er bereit ist.

## 7. Fähigkeiten

Die Zahlen in den folgenden Tabellen entsprechen den Datentabellen `content/weapons` und `content/axioms`. Alle sind Startwerte für das Balancing.

### 7.1 Waffen (an Ecken)

- Jede Waffe belegt eine Ecke und steigt bis **Lv 8** auf. Die genauen Stufentabellen liegen in `content/weapons`; die Spalte „Level-Fokus“ zeigt, was die Stufen verbessern.
- Das MVP hat **6 Waffen**, 4 davon ab Start im Pool; 🔒 markiert Waffen, die per Beweis freigeschaltet werden (10.3).
- „Blickrichtung“ meint die letzte Bewegungsrichtung des Spielers, da sich das Polygon selbst ständig dreht.

| Waffe          | Glyphe             | Verhalten (Lv 1)                                                                                                                                              | Level-Fokus                                                                                           | Verfügbar       |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------- |
| **Spitze**     | Dreieckspfeil      | Auto-Aim auf die nächsten Gegner in 630 px Reichweite, vom Eckpunkt; 10 Schaden, CD 1,0 s, 1 Pfeil, Durchschlag 1                                             | +Anzahl (bis 4 Pfeile, jeder auf ein eigenes Ziel), +Schaden, +Durchschlag, −CD                       | Start           |
| **Kreisbahn**  | Kreis              | 2 Kreise orbitieren um den Kern (r 80 px, 3 rad/s); Treffer-Intervall pro Gegner 0,5 s; 10 Schaden                                                            | +Kreise (bis 5), +Radius, +Schaden, +Tempo                                                            | Start           |
| **Welle**      | Sinuslinie         | Sinus-Geschoss aus dem Kern in Blickrichtung, durchdringt alles; 12 Schaden, CD 1,5 s, 1,6 s Flugzeit                                                         | +Anzahl (die zweite Welle fliegt rückwärts, drei teilen den Kreis), +Schaden, +Amplitude, −CD, +Größe | Start           |
| **Zirkel**     | Ring               | Aura um den Spieler (r 70 px), 6 Schaden alle 0,5 s, leichter Knockback                                                                                       | +Radius, +Schaden, kürzeres Tick-Intervall, Lv 8: 25 % Verlangsamung                                  | Start           |
| **Strahl** 🔒  | Linie              | Laser radial aus seiner Ecke, 1 s an / 3 s CD (der CD läuft erst nach dem Abschalten), fegt mit der Rotation; 5 Schaden alle 0,1 s, Länge 220 px, Breite 8 px | +Länge, +Schaden, +Dauer, Fächer (2 Strahlen im Abstand von 12°), −CD, +Breite                        | „Erster Beweis“ |
| **Fraktal** 🔒 | Sierpinski-Dreieck | Auto-Aim vom Eckpunkt; das Geschoss zerfällt beim ersten Treffer in 3 Kinder (je 50 % Schaden); 18 Schaden, CD 1,8 s, Rekursionstiefe 1                       | +Schaden, +Tiefe (bis 3), +Anzahl, −CD, Lv 8: Kinder erben 75 % Schaden                               | „Q.E.D.“        |

### 7.2 Axiome (an Kanten)

- Jedes Axiom belegt eine Kante und steigt bis **Lv 5** auf; einzige Ausnahme ist **Symmetrie mit max. Lv 2**.
- Das MVP hat **8 Axiome**; 🔒 Symmetrie und Integral werden per Beweis freigeschaltet (10.3).
- Prozentboni auf denselben Wert addieren sich, bevor sie angewendet werden (z. B. ergeben Frequenz Lv 5 und zwei Reißbrett-Ränge Frequenz −40 % − 5 % = −45 %). Der Cooldown sinkt dabei nie unter 40 % des Grundwerts.
- Kantenfarben sind überwiegend kühl (Blau, Grün, Violett, Weiß) und heben sich so von den warmen Gegnerfarben ab; Potenz (Hellrot) und Volumen (Hellgelb) sind als helle Pastelltöne die Ausnahme. Zusätzlich trägt jede belegte Kante in der Mitte ein kleines, aufrecht stehendes **Symbol**, damit Axiome auch ohne Farbwahrnehmung lesbar sind. Draft-Karten, Pause, Kompendium, Mini-Build und die gleichnamigen Reißbrett-Upgrades zeigen dasselbe Symbol.

| Axiom              | Farbe                 | Symbol                               | Wirkung pro Level                                                                | Max. Lv | Summe bei Max.       | Theorem-Partner       | Verfügbar        |
| ------------------ | --------------------- | ------------------------------------ | -------------------------------------------------------------------------------- | ------- | -------------------- | --------------------- | ---------------- |
| **Potenz**         | Hellrot `#FF8A8A`     | Zirkumflex ^ (Potenz-Operator)       | +10 % Schaden                                                                    | 5       | +50 %                | Fraktal → Mandelbrot  | Start            |
| **Frequenz**       | Hellblau `#7AD7FF`    | Uhr                                  | −8 % Cooldown                                                                    | 5       | −40 %                | Welle → Fourier-Reihe | Start            |
| **Skalierung**     | Lime `#B8FF7A`        | zwei verschachtelte Quadrate         | +10 % Fläche (Radien, Größen)                                                    | 5       | +50 %                | Strahl → Prisma       | Start            |
| **Symmetrie** 🔒   | Violett `#E07AFF`     | Spiegelachse zwischen zwei Dreiecken | +1 Anzahl: Pfeil, Kreis, Welle, Strahl oder Fraktal (wirkt nicht auf den Zirkel) | 2       | +2                   | Spitze → Sternpolygon | „Quadratur“      |
| **Volumen**        | Hellgelb `#FFE07A`    | Kugel mit Äquator                    | +20 Max-HP (der Zuwachs heilt sofort)                                            | 5       | +100                 | Zirkel → Sphäre       | Start            |
| **Integral** 🔒    | Mint `#7AFFB8`        | ∫                                    | +0,25 HP/s Regeneration                                                          | 5       | +1,25 HP/s           | –                     | „Tausend Punkte“ |
| **Beschleunigung** | Blauviolett `#8AA2FF` | »                                    | +8 % Lauftempo                                                                   | 5       | +40 %                | –                     | Start            |
| **Gravitation**    | Weiß `#F2F2FF`        | vier Pfeile zur Mitte                | +30 % Sammelradius                                                               | 5       | +150 % (60 → 150 px) | Kreisbahn → Epizykel  | Start            |

### 7.3 Theoreme (Evolutionen)

**Regel:** Erreicht eine Waffe **Lv 8** und besitzt der Spieler das **passende Axiom** (auf beliebigem Level), bietet der nächste Draft garantiert eine goldene **„Q.E.D.“-Karte** an. Wer sie wählt, ersetzt die Waffe **im selben Eck-Slot** durch ihr Theorem. Das Theorem übernimmt die Lv-8-Werte der Waffe und legt seine eigenen Boni darauf; die Glyphe bekommt eine eigene Farbe und einen goldenen Ring, das Axiom bleibt erhalten. Das Banner „Q.E.D.“ und ein goldener Ring feiern den Beweis.

```
Waffe (Lv 8)  +  passendes Axiom (beliebiges Lv)  →  goldene Q.E.D.-Karte  →  Theorem im selben Eck-Slot
```

- Die Q.E.D.-Karte belegt einen der normalen Kartenplätze; pro Draft erscheint höchstens eine (sind mehrere Theoreme möglich, entscheidet der Zufall). Wer sie nicht nimmt, bekommt sie im nächsten Draft erneut angeboten. Wer sie radiert, sperrt dieses Theorem für den Rest des Runs.
- Ein Truhen-Würfel beweist ein mögliches Theorem sofort, ohne Karte; das kostet eines seiner drei Upgrades.
- Das erste bewiesene Theorem erfüllt den Beweis „Q.E.D.“ und schaltet die Waffe Fraktal frei.

| Waffe (Lv 8) | + Axiom     | = Theorem         | Effekt                                                                                                                                                             |
| ------------ | ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spitze       | Symmetrie   | **Sternpolygon**  | Salve aus _allen_ Ecken gleichzeitig, radial nach außen (die Rotation fegt sie herum); +2 Durchschlag, +20 % Tempo, −20 % CD                                       |
| Kreisbahn    | Gravitation | **Epizykel**      | jeder Kreis hat 2 eigene, gegenläufige Monde (Spirograph-Muster); +20 % Größe, +20 % Schaden                                                                       |
| Welle        | Frequenz    | **Fourier-Reihe** | 3 überlagerte Harmonische (Amplituden 1, 1/3, 1/5 ≈ Rechteckwelle), Fächer aus 3 Wellen (±30°); +25 % Schaden, +20 % Amplitude                                     |
| Zirkel       | Volumen     | **Sphäre**        | +30 % Radius, Schockwellen-Puls alle 2 s (dreifacher Schaden, 1,35-facher Radius, starker Knockback), Kills in der Aura heilen (0,5 HP pro Kill, höchstens 3 HP/s) |
| Strahl       | Skalierung  | **Prisma**        | Dauerstrahl, spaltet sich nach 120 px in 3 Spektralstrahlen (±15°); +20 % Länge, −20 % Schaden                                                                     |
| Fraktal      | Potenz      | **Mandelbrot**    | Tiefe 4, Geschoss und Kinder zielsuchend (320 px), jede Teilung erzeugt einen Ring; +20 % Schaden                                                                  |

Theoreme sind der „Aha“-Moment des Spiels: Der Name ist echte Mathematik, und der Effekt macht sie sichtbar – die Fourier-Reihe baut aus Sinuswellen eine Rechteckwelle, der Epizykel zeichnet Spirographen. Das Sternpolygon ist bewusst mit der Kern-Mechanik verzahnt: Je mehr Ecken der Spieler hat, desto dichter wird seine Salve.

### 7.4 Level-Up-Draft

**Regeln**

1. Jedes Level-Up öffnet einen Draft mit **3 Karten** (4 mit dem Reißbrett-Upgrade „Vierte Karte“).
2. Während des Drafts ist die Simulation pausiert. Mehrere gleichzeitige Level-Ups werden nacheinander gedraftet; aufgehobene Würfel werden vorher geöffnet.
3. Eine **neue Waffe** wird nur angeboten, wenn eine Ecke frei ist; ein **neues Axiom** nur, wenn eine Kante frei ist. Gesperrte, radierte und bereits vorhandene Items fallen heraus, ebenso eine Waffe, deren Theorem der Spieler schon besitzt.
4. Jede mögliche Karte hat ein Gewicht: **Waffen-Upgrade 1, neue Waffe 0,9, Axiom-Upgrade 0,8, neues Axiom 0,7**. Gezogen wird gewichtet ohne Zurücklegen; Upgrades sind damit leicht bevorzugt, Waffen etwas häufiger als Axiome.
5. Ist ein Theorem möglich, enthält der Draft garantiert eine **Q.E.D.-Karte** (Abschnitt 7.3).
6. Reichen die möglichen Karten nicht, füllen die **Fallback-Karten „+30 HP“** (heilt 30) und **„+15 Splitter“** die freien Plätze auf, zuerst die Heilung.

Der Draft trägt den Titel „Level N“ mit der Unterzeile „Wähle ein Lemma“. Jede Karte zeigt Glyphe, Name, Stufenwechsel (z. B. „Lv 3 → 4“) und den Effekt in einem Satz. Kopfzeile und Rahmen verraten den Typ („Waffe · Ecke“, „Axiom · Kante“ oder das goldene „Theorem“); neue Items tragen die Marke „NEU“, die Q.E.D.-Karte nennt ihr Rezept („Beweis: Spitze (max) + Symmetrie“).

**Aktionen** (Anzahl pro Run kommt aus dem Reißbrett; ohne Ränge 0, dann sind die Schaltflächen ausgeblendet. Debug-Runs erhalten je 3.):

| Aktion           | Taste                                       | Gamepad        | Wirkung                                                                                                      |
| ---------------- | ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| Karte wählen     | 1–4 (oder Maus)                             | D-Pad + A      | nimmt die Karte                                                                                              |
| **Neu zeichnen** | R                                           | X              | zieht alle Karten neu (Reroll)                                                                               |
| **Radieren**     | B, dann Kartennummer (Esc oder B bricht ab) | RB, dann Karte | entfernt das Item für den Rest des Runs aus dem Pool (Banish)                                                |
| **Überspringen** | S                                           | Y              | schließt den Draft ohne Wahl, etwa um eine Ecke für eine bestimmte Waffe freizuhalten; das Level-Up verfällt |

**Eingabeschutz:** In den ersten 0,35 s nach dem Öffnen und 0,21 s nach jeder Aktion (etwa einem Reroll) reagiert der Draft auf keine Eingabe. Alle Aktionen lösen nur bei einem neuen Tastendruck aus, gehaltene Tasten zählen also erst nach dem Loslassen. Die Taste, die den Draft schließt, löst außerdem nicht gleich den Skill aus. Sonst wählt oder überspringt man versehentlich, weil man gerade noch S (Bewegung) oder A (Skill) gedrückt hält.

## 8. Gegner

### 8.1 Formensprache

- **Form = Verhalten:** spitz = schnell und aggressiv, rund = Schwarm, groß und kantig = zäh.
- **Farbe = Angriffsart:** Rot = Kontakt, Magenta = Fernkampf, Orange = explodiert, Bernstein = beschwört.
- **Schalen = HP-Stufen** (8.3) und **Telegraph vor jedem Angriff** (8.4).
- Jeder Archetyp hat eine eigene Form. Farbe ist daher nie das einzige Unterscheidungsmerkmal.
- Die Gegner tragen dieselben Formen, die der Spieler im Run annimmt: Dreieck, Quadrat, Pentagon, Hexagon. Das Hexagon ist beim Spieler das Ziel, bei der Wabe die Bedrohung.

### 8.2 Archetypen

| Name        | Form                    | Farbe                | Verhalten                                                                                                                                                                | HP  | Tempo (px/s) | Schaden            | XP  | ab   |
| ----------- | ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------------ | ------------------ | --- | ---- |
| **Punkt**   | Kreis r 7               | Rot `#FF3B5C`        | läuft direkt auf den Spieler zu                                                                                                                                          | 6   | 75           | 5                  | 1   | 0:00 |
| **Keil**    | Dreieck r 10            | Rot-Orange `#FF5A36` | ab 230 px Abstand: 0,5 s Aufblinken + Linie, dann 0,6 s Dash ×3 (dreifaches Tempo entlang der Linie), danach 0,6 s Erholung                                              | 12  | 85           | 8                  | 2   | 1:00 |
| **Block**   | Quadrat r 14, 2 Schalen | Dunkelrot `#C8243F`  | langsam, 70 % Knockback-Resistenz                                                                                                                                        | 45  | 50           | 9                  | 5   | 3:00 |
| **Rhombus** | Raute r 10              | Pink `#FF6FA8`       | kreist in 200 px Abstand, stürzt alle 3 s hinein (0,35 s Vorlauf, 0,75 s Sturz mit 2,2-fachem Tempo)                                                                     | 16  | 120          | 8                  | 3   | 3:00 |
| **Werfer**  | Pentagon r 13           | Magenta `#FF4FD8`    | hält 220–300 px Abstand, feuert alle 3,5 s einen 5er-Kugelring (150 px/s, eine Kugel zielt auf den Spieler)                                                              | 28  | 65           | 6 (auch pro Kugel) | 5   | 6:00 |
| **Stern**   | 5-Zack r 12             | Orange `#FF9A3C`     | zündet in 110 px Abstand: 0,8 s Kreis-Telegraph (kriecht dabei mit 25 % Tempo weiter), dann Explosion r 80 (trifft auch Gegner; ein explodierter Stern gibt keine Beute) | 14  | 105          | 25                 | 3   | 6:00 |
| **Wabe**    | Hexagon r 18, 3 Schalen | Bernstein `#FFC23C`  | spawnt alle 6 s 3 Punkte (0,5 s Vorlauf)                                                                                                                                 | 110 | 35           | 10                 | 12  | 9:00 |

Knockback-Resistenz: Punkt 0 %, Keil und Stern 10 %, Rhombus 20 %, Werfer 30 %, Block 70 %, Wabe 80 %; der Boss ist immun.

Technisch teilen sich die Archetypen sechs KI-Grundtypen (`chase`, `dash`, `orbitDive`, `kite`, `spawner`, `kamikaze`); Punkt und Block nutzen beide `chase`. Dazu kommen `march` für die Punkte der Geraden, die stur geradeaus marschieren, und `boss` für Sierpinski.

### 8.3 Schalen-System

Zähere Gegner tragen **verschachtelte Konturen**. Bei n Schalen bricht die äußerste, sobald die HP unter (n−1)/n fallen, die nächste unter (n−2)/n und so weiter. Jede brechende Schale zerspringt sichtbar in fliegende Kanten. Das ist die **eingebaute HP-Anzeige**: Kein Gegner braucht einen Lebensbalken, und der Spieler sieht trotzdem, wie weit ein Block oder eine Elite schon ist. Block hat 2 Schalen, Wabe und Elites haben 3.

### 8.4 Telegraphs

Vor **jedem** Angriff blinkt der Gegner während des ganzen Vorlaufs weiß auf (mit Blitz-Reduktion leuchtet er stattdessen gleichmäßig heller, 13.4), und eine Linie oder ein Kreis zeigt Richtung bzw. Wirkungsbereich.

| Angreifer  | Telegraph                                                                      | Vorlauf |
| ---------- | ------------------------------------------------------------------------------ | ------- |
| Keil       | Aufblinken + Linie in Dash-Richtung, so lang wie der Dash, mit Endpunkt        | 0,5 s   |
| Rhombus    | Aufblinken + Linie zum Spieler vor dem Sturz, mit Endpunkt                     | 0,35 s  |
| Werfer     | Aufblinken + schrumpfender Magenta-Ring vor dem Kugelring                      | 0,35 s  |
| Stern      | Kreis in Explosionsgröße (r 80), der sich von innen her füllt                  | 0,8 s   |
| Wabe       | Aufblinken + wachsender Bernstein-Ring vor dem Spawn                           | 0,5 s   |
| Sierpinski | Kanten glühen auf, kurze Magenta-Marken zeigen von den Kantenmitten nach außen | 0,45 s  |

### 8.5 Elites

Elites sind **2,5× so groß**, tragen **mindestens 3 Schalen** und einen **weißen Rand** (eine zusätzliche Kontur außen herum) und haben **+15 % Tempo** und **mindestens 60 % Knockback-Resistenz**; dafür geben sie 20-fache XP. Ihre HP sind ein Vielfaches eines normalen Gegners ihres Typs zur selben Zeit; den Faktor legt die Wellentabelle je Elite fest: **2,5×** für den Block um 3:00 (der erste Würfel soll schnell fallen), **8×** für den Rhombus um 6:00, **4×** für den Werfer um 9:00 (er flieht, das Einholen ist schon die Prüfung) und **6×** für die Waben um 12:00. Welchen Würfel eine Elite trägt, legt die Wellentabelle fest: Die Elites um 3:00, 6:00 und 9:00 droppen je einen **Ecken-Würfel**, die beiden Waben der Doppel-Elite um 12:00 je einen **Truhen-Würfel** (3 Upgrades + 15 Splitter). Jede Elite bringt außerdem 10 Splitter. Ihr Tod wird mit einem weißen Ring und Screenshake gefeiert.

### 8.6 Gegnerkugeln

Gegnerkugeln sind **hohle Magenta-Ringe mit weißem Kern** (r 6 px) und liegen **über allem außer dem Overlay**: über Spieler, eigenen Geschossen und Strahlen, aber auch über Partikeln, Ringen und Schadenszahlen (11.3). Nur Fernkämpfer (Werfer, Boss) verschießen sie; sie fliegen geradeaus und verfallen nach 6 s. Während der i-Frames fliegen sie durch den Spieler hindurch. Egal wie voll der Bildschirm ist: Was dem Spieler schaden kann, bleibt sichtbar.

### 8.7 Skalierung

- **HP:** +12 % pro Minute linear und dazu ×1,12 pro Minute exponentiell: HP × (1 + 0,12 · Minute) · 1,12^Minute, festgelegt beim Spawn. Das ergibt ×3,4 bei 6:00, ×5,8 bei 9:00, ×9,5 bei 12:00 und ×15,3 bei 15:00. Eine rein lineare Kurve (×2,8 bei 15:00) hielt mit dem Schaden später Builds nicht mit.
- **Schaden +4 % pro Minute**, linear und beim Spawn festgelegt.
- **Tempo +5 % pro Minute**, linear und beim Spawn festgelegt: Bei 15:00 laufen Gegner 1,75-mal so schnell; Sterne (184 px/s) und Rhombi (210 px/s) sind dann schneller als der Spieler ohne Tempo-Axiom (160 px/s). Das Tempo ist der stärkste Hebel der Balance – mit zu langsamen Gegnern läuft der Spieler jeder Bedrohung davon.
- **Dichte** wächst über Spawn-Rate und Obergrenze des Directors (5.2). Die **Komplexität** hebt zusätzlich die Gegner-HP (+25 % je Stufe) und die Spawn-Rate (+10 % je Stufe) an (10.5). Die HP des Bosses skalieren nur mit der Komplexität, nicht mit der Zeit.

### 8.8 Boss „Sierpinski“

Ein großes Dreieck mit dreieckigem Mittelloch – die erste Stufe des Sierpinski-Dreiecks. Gezeichnet wird es mit rekursivem Sierpinski-Muster und nur 10 % Füllung. Es erscheint außerhalb des Bildes über dem Spieler, begleitet vom Banner „SIERPINSKI – Teile und herrsche“.

- **Kantenfeuer:** Der Boss rotiert (0,45 rad/s) und feuert von jeder Kante gleichmäßig verteilte Kugeln senkrecht zur Kante nach außen (135 px/s, 10 Schaden). Durch die Rotation entstehen **Spiralwände**, zwischen denen der Spieler hindurchmanövriert.
- **Brut:** Aus dem Mittelloch spawnen alle 8 s 3 Keile.
- **Teilung:** Bei 0 HP teilt er sich in **3 halb so große, schnellere Kopien**, bis Tiefe 2: **1 → 3 → 9**. Die Kopien erscheinen auf halbem Weg zu den Ecken, werden mit 260 px/s nach außen gestoßen und sind 0,5 s lang unverwundbar (sie blinken, mit Blitz-Reduktion sind sie stattdessen abgedunkelt); ihre Salven sind um je 0,3 s versetzt, und jede neue Generation dreht gegenläufig zur vorigen (die erste Teilung mit 1,3-fachem Tempo). Sind alle Kopien zerstört, ist der Run gewonnen – daher der Beweis „Teile und herrsche“.
- **Sieg:** Banner „BEWIESEN“. Die normalen Gegner verschwinden ohne Beute, alle Kugeln erlöschen, Kristalle, Pickups und die 100 Boss-Splitter fliegen zum Spieler. 3 s später endet der Run.
- **Präsentation:** Boss-Sirene beim Erscheinen (12), Hit-Stop bei jeder Teilung (0,09 s) und beim Sieg (0,2 s); die normalen Spawns laufen auf 30 % weiter. Eine einzige HUD-Leiste zeigt die verbleibenden HP aller Kopien zusammen, auch der noch nicht geborenen.

| Phase | Tiefe | Kopien | Größe (Umkreis) | HP je Kopie | Tempo (px/s) | Salve                          | Besonderheit                                                      |
| ----- | ----- | ------ | --------------- | ----------- | ------------ | ------------------------------ | ----------------------------------------------------------------- |
| 1     | 0     | 1      | 150 px          | 4200        | 38           | alle 2,6 s, 5 Kugeln pro Kante | volle Spiralwände, Keile aus dem Mittelloch                       |
| 2     | 1     | 3      | 76 px           | 1680        | 62           | alle 2,2 s, 3 pro Kante        | jede Kopie feuert eigene, lichtere Spiralen; keine Keil-Brut mehr |
| 3     | 2     | 9      | 40 px           | 630         | 92           | alle 1,9 s, 2 pro Kante        | Kopien jagen mehr, als sie feuern                                 |

Damit 9 Kopien lesbar bleiben, feuert jede Kopie weniger Kugeln pro Kante. Die HP je Kopie betragen 40 % der Eltern-HP in Phase 2 und 37,5 % in Phase 3; zusammen hat Sierpinski 14 910 HP (× (1 + 0,25 · Komplexität)). Kontakt kostet 20 HP. Jede Generation bringt zusammen 400 XP. Als Trefferfläche dient das echte Dreieck: Geschosse, Strahlen, Auren, Explosionen und der Kontakt mit dem Spieler messen den genauen Abstand zu seinen Kanten. Nur beim Gedränge mit anderen Gegnern zählt der Inkreis.

### 8.9 Ausbau-Bosse

| Boss               | Idee                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Tesserakt**      | Projektion eines 4D-Würfels, die sich durch die Dimensionen dreht; feuert aus 16 Ecken |
| **Mandala**        | rotierende Ringe mit Lücken, durch die der Spieler schlüpfen muss                      |
| **Ouroboros**      | _eine Kette aus Kreisen, die sich selbst in den Schwanz beißt und das Feld einschnürt_ |
| **∞ (Lemniskate)** | _zieht Achten über das Feld und hinterlässt eine Kugelspur_                            |

## 9. Pickups

Alle Pickups sind mathematische Symbole und folgen damit Pfeiler 1.

| Pickup            | Darstellung                                                           | Wirkung                                                                     | Quelle                            |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| **Kristall**      | ◆ in drei Größen: grün (unter 5 XP), türkis (ab 5), fast weiß (ab 25) | XP in Höhe der Gegner-XP                                                    | jeder getötete Gegner             |
| **Plus**          | + in Grün                                                             | heilt 30 HP                                                                 | 0,4 % pro Kill                    |
| **Summe**         | ∑ in Weiß                                                             | saugt alle Kristalle der Map ein                                            | 0,12 % pro Kill                   |
| **Mal**           | × in Orange                                                           | 250 Schaden an allen Gegnern im Bild (mit Knockback, ohne Krit)             | 0,09 % pro Kill                   |
| **Geteilt**       | ÷ in Hellblau                                                         | halbiert 6 s lang das Gegnertempo; verlangsamte Gegner färben sich hellblau | 0,09 % pro Kill                   |
| **Splitter**      | violetter Splitter `#B77BFF`, dreht sich, wächst mit dem Wert         | Meta-Währung                                                                | 1 % pro Kill, Elites, Boss (10.1) |
| **Ecken-Würfel**  | isometrischer Drahtwürfel, weiß, mit atmendem Halo-Ring               | Morph: +1 Ecke, +1 Kante                                                    | Elites um 3:00, 6:00 und 9:00     |
| **Truhen-Würfel** | isometrischer Drahtwürfel, golden, mit atmendem Halo-Ring             | 3 Upgrades + 15 Splitter                                                    | die beiden Elites um 12:00        |

**Drops und Einsammeln.** Die Chancen gelten pro Kill und steigen mit dem Glück (Reißbrett „Wahrscheinlichkeit“). Plus, Summe, Mal und Geteilt teilen sich einen Wurf, es fällt also höchstens eines davon; der Splitter würfelt getrennt. Splitter werden wie Kristalle vom Sammelradius angezogen, die übrigen Pickups muss der Spieler berühren (22 px); nur nach dem Sieg über den Boss fliegt alles von selbst zu ihm. Kleine Pickups verschwinden, wenn der Spieler sich mehr als 2600 px entfernt. Würfel bleiben liegen, und ein Pfeil am Bildrand zeigt, wo. Summe, Mal und Geteilt kündigen sich mit einem Banner an („∑ Alle Kristalle“, „× Auslöschung“, „÷ Zeit halbiert“).

**Truhen-Würfel.** Er beweist zuerst ein mögliches Theorem, die übrigen der drei Upgrades gehen an zufällige vorhandene Waffen und Axiome; gibt es nichts mehr zu verbessern, heilt er 30 HP. Dazu kommen immer 15 Splitter. Eine Meldung oben rechts („Würfel geöffnet“) listet, was er gebracht hat.

**Kristalle.** Jeder Gegner hinterlässt einen Kristall mit genau seinem XP-Wert (8.2): ein Punkt 1, ein Block 5, eine Wabe 12, Elites das Zwanzigfache. Innerhalb des Sammelradius (Grundwert 60 px) beschleunigen Kristalle auf bis zu 900 px/s zum Spieler; eingesammelt wird ab 14 px Abstand, und der Erfahrungsbonus (Reißbrett „Exponent“) erhöht den Wert. Angezogene Kristalle ziehen eine **Sog-Spur** hinter sich her (11.4). Liegen **300 oder mehr Kristalle** auf der Map, entsteht kein neuer Kristall mehr: Der Wert eines neuen Drops wandert in den nächstgelegenen vorhandenen Kristall, der dadurch wächst; der Gesamtwert bleibt erhalten. Das hält die Objektzahl im Rahmen und macht spätes Einsammeln zu einem kleinen Fest.

### 9.1 XP-Kurve

Bedarf für den Aufstieg von Level L auf L+1: **5 + 10 · (L − 1)** bis Level 20, danach steiler: **195 + 13 · (L − 20)** bis Level 40 und **455 + 16 · (L − 40)** darüber (`xpForLevel` in `tuning.ts`).

| Aufstieg            | 1→2 | 2→3 | 3→4 | 5→6 | 10→11 | 15→16 | 19→20 | 20→21 | 40→41 |
| ------------------- | --- | --- | --- | --- | ----- | ----- | ----- | ----- | ----- |
| Bedarf              | 5   | 15  | 25  | 45  | 95    | 145   | 185   | 195   | 455   |
| XP gesamt bis dahin | 5   | 20  | 45  | 125 | 500   | 1125  | 1805  | 2000  | 8630  |

Typische Level eines Runs (Richtwerte, mit denen auch Debug-Sprünge und die Titel-Demo arbeiten): 1:00 → Lv 4, 3:00 → Lv 8, 5:00 → Lv 14, 8:00 → Lv 24, 10:00 → Lv 32, 13:00 → Lv 44, 15:00 → Lv 53.

## 10. Meta-Progression

### 10.1 Splitter

| Quelle                              | Menge                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| seltener Drop                       | 1 % Chance pro Kill auf 1 Splitter, skaliert mit Glück (Reißbrett „Wahrscheinlichkeit“) |
| Elite                               | 10                                                                                      |
| Boss                                | 100                                                                                     |
| Run-Bonus (bei Sieg und Niederlage) | 3 je volle Minute + 1 je volle 100 Kills                                                |
| Fallback-Karte im Draft             | +15                                                                                     |
| Truhen-Würfel                       | 15                                                                                      |
| Gier und Komplexität                | Multiplikator auf die ganze Summe: Gier (+10 % je Rang) × (1 + 0,2 · Komplexität)       |

Abgerechnet wird am Ende des Runs: (gesammelte Splitter + Zeitbonus + Kill-Bonus) × Multiplikator, gerundet. Der Ergebnis-Screen zeigt die Rechnung Zeile für Zeile.

Beispiel: Ein Run endet bei 10:00 mit 1500 Kills → Run-Bonus 30 + 15 = 45 Splitter, dazu 30 von drei Elites und einige Drops (ohne Gier und Komplexität).

### 10.2 Reißbrett

Das Reißbrett ist der Shop für **permanente Stat-Boni**. Die Kosten für den nächsten Rang betragen **Basis × (aktueller Rang + 1)**. Alle Käufe sind **jederzeit vollständig rückerstattbar**: „Alles erstatten“ setzt das ganze Reißbrett zum vollen Preis zurück; Experimentieren kostet also nichts. Die Einträge sind unabhängig von den Axiom-Freischaltungen.

| Eintrag                | Wirkung pro Rang                                                                                                               | Max. Rang | Basis-Kosten | Komplett |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------ | -------- |
| **Potenz**             | +5 % Schaden                                                                                                                   | 5         | 60           | 900      |
| **Dichte**             | +1 Rüstung                                                                                                                     | 3         | 120          | 720      |
| **Volumen**            | +10 Max-HP                                                                                                                     | 5         | 80           | 1 200    |
| **Integral**           | +0,1 HP/s                                                                                                                      | 5         | 100          | 1 500    |
| **Frequenz**           | −2,5 % Cooldown                                                                                                                | 2         | 250          | 750      |
| **Skalierung**         | +5 % Fläche                                                                                                                    | 2         | 180          | 540      |
| **Impuls**             | +10 % Projektiltempo                                                                                                           | 2         | 100          | 300      |
| **Beschleunigung**     | +5 % Lauftempo                                                                                                                 | 2         | 120          | 360      |
| **Gravitation**        | +25 % Sammelradius                                                                                                             | 2         | 80           | 240      |
| **Wahrscheinlichkeit** | +10 % Glück (Drop-Chancen, auch für Splitter)                                                                                  | 3         | 150          | 900      |
| **Exponent**           | +3 % XP                                                                                                                        | 5         | 100          | 1 500    |
| **Gier**               | +10 % Splitter                                                                                                                 | 5         | 80           | 1 200    |
| **Neu zeichnen**       | +1 Reroll pro Run                                                                                                              | 3         | 200          | 1 200    |
| **Radieren**           | +1 Banish pro Run                                                                                                              | 3         | 200          | 1 200    |
| **Überspringen**       | +1 Skip pro Run                                                                                                                | 3         | 100          | 600      |
| **Zweiter Versuch**    | 1 Wiederbelebung pro Run: 50 % HP, 2 s i-Frames, alle normalen Gegner im Umkreis von 300 px sterben (Banner „ZWEITER VERSUCH“) | 1         | 800          | 800      |
| **Vierte Karte**       | 4 statt 3 Karten pro Draft                                                                                                     | 1         | 1 000        | 1 000    |

Mit diesen Werten kostet der komplette Ausbau 14 910 Splitter.

### 10.3 Beweise

Beweise sind die Achievements des Spiels, und jeder schaltet etwas frei. Die ersten ergeben sich in den ersten Runs fast von selbst, die späteren verlangen Können. Geprüft wird am Ende eines Runs (Sieg, Tod oder Aufgeben): Der Ergebnis-Screen feiert neue Beweise unter „Neu bewiesen“, die Freischaltung gilt ab dem nächsten Run. Ein kurzer Hinweis schon im Moment des Beweises ist angedacht, aber noch nicht umgesetzt. Das Blatt „Beweise“ zeigt jeden Satz mit Fortschrittsbalken (bester Einzelrun) und dazu eine Lebenszeit-Statistik.

| Beweis                 | Bedingung                  | Freischaltung                          |
| ---------------------- | -------------------------- | -------------------------------------- |
| **Erster Beweis**      | 5:00 überleben             | Waffe **Strahl**                       |
| **Quadratur**          | das Quadrat erreichen      | Axiom **Symmetrie**                    |
| **Vollendete Form**    | das Hexagon erreichen      | Charakter **Nova**                     |
| **Q.E.D.**             | das erste Theorem beweisen | Waffe **Fraktal**                      |
| **Tausend Punkte**     | 1000 Kills in einem Run    | Axiom **Integral**                     |
| **Teile und herrsche** | Sierpinski besiegen        | **Endlos-Modus** + **Komplexität 1–5** |

### 10.4 Kompendium

Das Kompendium sammelt alle entdeckten **Waffen, Theoreme, Axiome, Gegner und Formen** mit Werten und Kurzbeschreibung, in fünf Reitern mit Zähler („x / y entdeckt“). Waffen, Theoreme und Axiome gelten als entdeckt, sobald der Spieler sie in einem Run besessen hat, Gegner, sobald sie erschienen sind, Formen, sobald sie spielbar sind. Unentdecktes erscheint als dunkle Kontur mit „???“. Waffen-Einträge nennen ihren Theorem-Partner („Mit Symmetrie → ???“); der Name des Theorems bleibt verborgen, bis es einmal bewiesen wurde.

### 10.5 Endlos-Modus und Komplexität

Beide schaltet der Beweis „Teile und herrsche“ frei; eingestellt werden sie in der Formwahl, die sich die letzte Wahl merkt.

- **Endlos-Modus:** Sierpinski erscheint wie gewohnt um 15:00, doch nach seinem Sieg läuft der Run weiter. Ab 15:00 wächst die Spawn-Rate um 8 % pro Minute (solange der Boss lebt, bleibt sie auf 30 %), und die Obergrenze lebender Gegner wächst mit, höchstens auf das Doppelte. Der Run endet erst mit dem Tod; der Ergebnis-Screen heißt dann „Grenzwert erreicht“, gewertet werden Zeit und Kills.
- **Komplexität 0–5:** vor dem Run wählbar, Stufe 0 ist der Standard-Beweis. Jede Stufe bringt **+25 % Gegner-HP** (auch für den Boss), **+10 % Spawn-Rate** und **+20 % Splitter**.

### 10.6 Speicherstand

- Gespeichert wird in `localStorage` unter `formvollendet.save` als **versioniertes JSON** (Schema v1). Bei einer neuen Version migrieren Migrationsschritte alte Stände, einer pro Versionssprung. Ohne `localStorage` (etwa im privaten Modus) hält das Spiel den Fortschritt nur für die Dauer des Tabs.
- Inhalt: Splitter, Reißbrett-Ränge, erfüllte Beweise, Kompendium (gesehene Waffen, Axiome und Gegner), Lebenszeit-Statistik mit Bestwerten und die letzte Formwahl. Freischaltungen werden nicht gespeichert, sondern aus den Beweisen abgeleitet. Die Einstellungen liegen getrennt unter `formvollendet.settings.v1`.
- Beim Laden wird der Stand bereinigt: Unbekannte IDs fallen weg, Ränge über einem inzwischen gesenkten Maximum werden erstattet.
- **Fallback bei korruptem Save:** Das Spiel startet mit einem frischen Stand, statt abzustürzen. Die beschädigten Daten bleiben unter `formvollendet.save.unreadable` erhalten, und der Titel zeigt einen Hinweis. Ein Stand aus einer neueren Version wird genauso behandelt.
- Debug-Sitzungen und Starts mit Cheat-Parametern schreiben nie in den Speicherstand; Titel und Ergebnis-Screen weisen darauf hin. Die Einstellungen bieten „Spielstand löschen“ mit Rückfrage.

## 11. Look & Feel

### 11.1 Stil und Hintergrund

Neon auf Fast-Schwarz. Der Hintergrund ist ein **Millimeterpapier-Koordinatensystem**: feines Raster alle 32 px, kräftigere Linien alle 160 px und die x/y-Achsen durch den Ursprung, an dem jeder Run beginnt. Das HUD zeigt die aktuelle Position als **„(x | y)“**. Das Raster gibt auf der endlosen Fläche Orientierung und Bewegungsgefühl und verankert das Thema „Mathe-Heft“.

### 11.2 Farbpalette

| Rolle                                                          | Farbe                                                                    | Hex                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| Hintergrund                                                    | Fast-Schwarz                                                             | `#07080D`                                |
| Raster fein / grob / Achsen                                    | gedämpftes Blaugrau                                                      | `#0F1320` / `#19213A` / `#2C3A5E`        |
| Spieler Delta                                                  | Cyan                                                                     | `#3FF0FF`                                |
| Spieler Nova                                                   | Gold                                                                     | `#FFD23F`                                |
| Kern-Punkt, Treffer-Flash, Elite-Rand, Kugelkern, Ecken-Würfel | Weiß                                                                     | `#FFFFFF`                                |
| Eigene Waffen und Axiome                                       | kühle, helle Töne (Cyan, Mint, Eisblau, Weiß, Lime; Ausnahmen siehe 7.2) | je Eintrag in `weapons.ts` / `axioms.ts` |
| Kontakt-Gegner, Telegraphs                                     | Rot                                                                      | `#FF3B5C`                                |
| Kontakt-Varianten                                              | Rot-Orange (Keil), Dunkelrot (Block), Pink (Rhombus)                     | `#FF5A36` / `#C8243F` / `#FF6FA8`        |
| Fernkampf-Gegner, Gegnerkugeln                                 | Magenta                                                                  | `#FF4FD8`                                |
| Explodierende Gegner, ×-Pickup                                 | Orange                                                                   | `#FF9A3C`                                |
| Beschwörende Gegner                                            | Bernstein                                                                | `#FFC23C`                                |
| Boss Sierpinski                                                | Rot-Pink                                                                 | `#FF2E63`                                |
| Splitter                                                       | Violett                                                                  | `#B77BFF`                                |
| Kristalle (unter 5 / ab 5 / ab 25 XP)                          | Grün, Türkis, Fast-Weiß                                                  | `#6DFF8A` / `#3DFFC4` / `#D8FFF0`        |
| Heilung (+-Pickup, Heil-Ring, volle HP-Leiste)                 | Grün                                                                     | `#6DFF8A`                                |
| ÷-Pickup, Verlangsamung                                        | Hellblau                                                                 | `#7AD7FF`                                |
| Theoreme, Q.E.D.-Karte, Krit-Zahlen, Truhen-Würfel             | Gold                                                                     | `#FFD23F`                                |

Rot, Orange, Bernstein und Magenta liegen bei Rot-Grün-Schwäche nah beieinander; deshalb trägt jeder Archetyp eine eigene Form. Auch Nova (Gold) und Wabe (Bernstein) sind farblich eng verwandt – hier unterscheiden Form und Position (der Spieler ist immer in der Bildmitte). Gold steht außerdem gleichzeitig für Nova, Theoreme, Krits und den Truhen-Würfel, und Heilung teilt sich ihr Grün mit den kleinen Kristallen (die Form – Plus gegen Kristall – trennt sie). Das muss im Playtest geprüft werden.

### 11.3 Darstellung

- **Gegner:** Kontur (2,2 px) + 16 % Füllung + vorgebackener Glow, **normal geblendet**. So verschmelzen dichte Horden nicht zu einem hellen Brei. Schalen sind zusätzliche, nach innen versetzte Konturen; Elites tragen einen weißen Außenrand.
- **Eigene Projektile, Strahlen und VFX:** **additiv** geblendet; die eigene Macht darf leuchten.
- **Formen als Sprites:** Gegner, Geschosse, Kristalle, Pickups und Partikel werden einmal per Canvas 2D mit echtem Glow in einen Atlas gebacken und dann als Sprites gezeichnet; Spieler-Polygon, Boss, Strahlen, Ringe und Linien sind Vektorgrafik. Die Einstellung „Glow“ schaltet nur die Halos dieser Vektorgrafik ab.
- **Ebenen** von unten nach oben: Millimeterpapier → Achsen → Boden-Effekte (Aura, Orbit-Bahnen, Telegraphs, Dash-Linien) → Kristalle → Pickups → Gegner → Boss → eigene Projektile → Strahlen, Wellenspuren, Vektor-Linie → Spieler → VFX (Partikel, Ringe) → Schadenszahlen → Gegnerkugeln → Overlay (Pfeile zu Würfeln außerhalb des Bildes, Vollbild-Blitze).

### 11.4 Juice

- **Treffer:** Weiß-Flash per Tint (60 ms) und ein paar Funken, bei Krits goldene. Mit Blitz-Reduktion schwillt stattdessen die Kontur kurz an, und die Funken sind grau (13.4).
- **Schalenbruch und Tod:** Die Form zerfällt in fliegende Kanten. Elites sterben zusätzlich mit weißem Ring und Screenshake.
- **Trauma-Screenshake:** Ausschlag wächst mit dem Quadrat des Traumas, gedeckelt auf 14 px und abschaltbar. Nur Ereignisse im Bild rütteln die Kamera.
- **Hit-Stop** nur an den großen Boss-Momenten: 0,09 s bei jeder Teilung, 0,2 s beim Sieg.
- **Level-Up:** Ringpuls vom Spieler aus (20 → 110 px, Charakterfarbe).
- **Morph-Animation:** neue Ecke wächst, Polygon rundet sich ab, Schockwellen-Ring (3.2).
- **Theorem:** goldener Ring (240 px) und goldene Funken.
- **Skills:** Supernova mit goldenem Ring (220 px) und Funkenregen, Vektor mit Nachbildern (7 Schemen) und leuchtender Schadenslinie.
- **Spieler:** blinkt während der Unverwundbarkeit, zerspringt beim Tod in Kanten; ein roter Vollbild-Blitz quittiert jeden Treffer (weiß bei ×-Bombe und Zweitem Versuch). Mit Blitz-Reduktion entfallen Blinken und Vollbild-Blitze (13.4).
- **Kristall-Sog-Spuren:** Jeder angezogene Kristall zieht ab 160 px/s eine Spur in seiner Farbe hinter sich her, so lang wie seine Strecke der letzten 0,05 s (bei Höchsttempo 45 px) und umso kräftiger, je schneller er fliegt. Ein ∑ zieht so ein Strahlenbild zum Spieler.
- **Schadenszahlen:** Krits in Gold mit „!“ und kurzem Aufploppen, abschaltbar, höchstens 80 gleichzeitig (die älteste wird recycelt).

### 11.5 Lesbarkeitsregeln

1. Gegnerkugeln liegen über allen Spielobjekten (Gegner, eigene Geschosse, Strahlen, Spieler) und sehen immer gleich aus (hohler Magenta-Ring, weißer Kern). Auch Partikel, Ringe und Schadenszahlen verdecken sie nie; darüber liegt nur das Overlay (11.3). Nichts anderes darf so aussehen; eigene Geschosse sind nie magenta.
2. Jeder gegnerische Angriff hat einen Telegraph (8.4).
3. Form codiert Verhalten, Farbe codiert Angriffsart – beide Kanäle sind redundant.
4. Gegner normal, eigene Effekte additiv: Bedrohung bleibt kontrastreich, eigene Effekte leuchten.
5. Der Kern-Punkt ist immer erkennbar, egal wie groß das Polygon wird.
6. Effektmengen sind gedeckelt (höchstens 1500 Partikel, 48 Ringe, 80 Schadenszahlen und 40 Treffer-Funken pro Frame; Screenshake max. 14 px); mit Blitz-Reduktion gibt es zusätzlich keine Vollbild-Blitze und kein Blinken (13.4).

## 12. Audio

Alle Klänge entstehen live über **WebAudio**, ohne eine einzige Audiodatei: Jeder Ton ist ein Oszillator oder gefiltertes Rauschen mit kurzer Hüllkurve (`src/audio`). Browser erlauben Klang erst nach einer Nutzeraktion; das Audio startet daher mit dem ersten Klick oder Tastendruck (Esc zählt nicht), ein Gamepad allein kann es nicht wecken. In einem versteckten Tab schläft es. Grundregel: **Der Oszillator-Typ folgt der Form.**

| Form           | Oszillator | Charakter          | Beispiele                                                    |
| -------------- | ---------- | ------------------ | ------------------------------------------------------------ |
| Kreis          | `sine`     | weich, rund        | Punkt, Kreisbahn, Zirkel, Welle, Kristalle, Heilung          |
| Dreieck        | `triangle` | hell, klar         | Keil, Fraktal, Level-Up- und Theorem-Arpeggien, Menü-Klicks  |
| Quadrat        | `square`   | hohl, kräftig      | Block, Rhombus, Werfer, Wabe, Spieler getroffen, Elite-Alarm |
| Stern / Spitze | `sawtooth` | scharf, schneidend | Spitze, Stern, Strahl, Vektor, Boss-Sirene                   |

**SFX-Liste**

| Ereignis                            | Klang                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waffe feuert                        | kurzer, leiser Ton je Waffenart: Spitze ein `sawtooth`-Zirpen, Welle ein aufsteigender `sine`-Bogen, Strahl ein vibrierendes Summen, Fraktal ein heller `triangle`-Ton, Kreisbahn und Zirkel ein weiches Ticken; Theoreme klingen wie ihre Grundwaffe. Der Schockwellen-Puls der Sphäre und jede Teilung des Mandelbrots geben einen dumpfen `sine`-Puls |
| Gegner getroffen                    | sehr kurzer Klick mit leicht variierter Tonhöhe; Krits als hellerer, schärferer Klick                                                                                                                                                                                                                                                                    |
| Schalenbruch                        | heller Knack aus Rauschen und einem hohen `triangle`-Ton                                                                                                                                                                                                                                                                                                 |
| Gegner stirbt                       | kurzer, fallender Ton im Oszillator der Gegnerform; kleine Formen klingen hoch, große tief. Elites zerbrechen mit Rauschen, tiefem Schlag und hellem Doppelton                                                                                                                                                                                           |
| Kristall eingesammelt               | `sine`; die Tonhöhe steigt während einer schnellen Serie die Pentatonik hinauf (alle zwei Kristalle eine Stufe, höchstens zehn) und setzt nach 0,6 s Pause zurück; große Kristalle klingen länger, die größten mit hellem Oberton                                                                                                                        |
| Level-Up                            | aufsteigendes Arpeggio                                                                                                                                                                                                                                                                                                                                   |
| Morph                               | vierstimmiger Akkord über tiefem Fundament mit Rausch-Sweep; mit jeder Form steigt der Grundton (C, D, E) und die Klangfarbe wird schärfer (Quadrat `square`, ab dem Pentagon `sawtooth`), das Hexagon bekommt eine fünfte Stimme                                                                                                                        |
| Theorem bewiesen (Q.E.D.)           | helles Arpeggio aus sechs Tönen mit weichem, nachklingendem Akkord                                                                                                                                                                                                                                                                                       |
| Signatur-Skill                      | Vektor: Rausch-Wusch mit `sawtooth`-Sweep aufwärts; Supernova: tiefer Schlag mit Rausch-Burst und dunklem Akkord                                                                                                                                                                                                                                         |
| Spieler getroffen                   | tiefer, fallender `square`-Ton mit Rauschen                                                                                                                                                                                                                                                                                                              |
| Heilung, Zweiter Versuch            | Heilung: zwei kurze `sine`-Töne; Wiederbelebung: aufsteigendes Arpeggio mit Rausch-Sweep                                                                                                                                                                                                                                                                 |
| Pickups                             | + Dur-Akkord, ∑ aufsteigender Sog, × tiefer Knall, ÷ fallender, zitternder Ton, Splitter heller Doppelton; Ecken-Würfel aufsteigender Ton mit Rauschen, Truhen-Würfel kurzer Doppelton und beim Öffnen ein Arpeggio (je Belohnung ein Ton mehr)                                                                                                          |
| Elite, Formationen                  | Elite: Alarm aus vier `square`-Tönen; Umzingelungen: tiefes, anschwellendes Dröhnen; Gerade: aufsteigendes Rauschen                                                                                                                                                                                                                                      |
| Gegnerkugel, Explosion              | kurzer fallender Schuss; Explosion als Rauschen mit tiefem Schlag                                                                                                                                                                                                                                                                                        |
| Boss erscheint                      | Boss-Sirene: zwei schwebende `sawtooth`-Stimmen über tiefem Brummen                                                                                                                                                                                                                                                                                      |
| Boss teilt sich, Boss besiegt, Sieg | Krachen mit fallendem Ton; großer Akkord; Fanfare                                                                                                                                                                                                                                                                                                        |
| Tod                                 | fallendes Arpeggio, das in Rauschen versinkt                                                                                                                                                                                                                                                                                                             |
| Menüs                               | Fokus bewegen, Bestätigen, Zurück, Kaufen, Verweigern, Umschalten, Blatt öffnen – je ein kurzer eigener Klang                                                                                                                                                                                                                                            |

**Mix:** Stimmen-Limit 24 für Effekte (32 für die Musik) plus Rate-Limit pro Sound, damit 300 Treffer pro Sekunde kein Rauschen erzeugen. Ist das Limit voll, verdrängt ein neuer Klang nur einen gleich wichtigen oder unwichtigeren (Treffer, eigene Schüsse und Kristalle < normale Klänge < Pickups und Menüs < große Momente). Klänge aus der Welt werden nach ihrer Lage zum Spieler im Stereobild verteilt und mit der Entfernung leiser. Ein Limiter am Ausgang fängt Spitzen ab. Die Titel-Demo spielt keine Effekte; hinter dem Titel läuft nur die Musik.

**Musik:** ein einfacher generativer Loop (104 BPM, A-Moll: Am – F – C – G, zwei Takte pro Akkord), dessen **Intensität der Gegnerdichte folgt** – rasch steigend, langsam fallend. Die Schichten blenden mit steigender Intensität ein: Pad (immer), Bass, Arpeggio (bei hoher Dichte in Sechzehnteln), Kick, Hi-Hats, Snare. Das Arpeggio-Motiv wird jeden Zyklus neu gewürfelt. Der Boss bringt eine eigene, bedrohlichere Akkordfolge (Am – B♭ – Am – E) bei voller Intensität; die Menüs spielen eine ruhige Variante ohne Schlagzeug. Pause und Draft dämpfen die Musik, nach dem Run klingt sie aus.

## 13. UI & Steuerung

### 13.1 Screen-Flow

Alle Screens sind ein DOM-Overlay über dem Canvas.

```
                      Draft-Modal
                     (Sim pausiert)
               Level-Up  ▲    │ Karte gewählt
                         │    ▼
 Titel ──► Formwahl ──► Run (HUD) ── Sieg / Tod / Aufgeben ──► Ergebnis ──► Nochmal · Zum Titel
   │             Weiter  ▲    │ Esc / P, Fokusverlust
   │                     │    ▼
   │         Pause mit Build-Übersicht ──► Einstellungen
   │
   └──► Reißbrett · Beweise · Kompendium · Einstellungen   (zurück mit Esc / B)
```

Die Menüs sind sechs **Blätter einer Konstruktionszeichnung** – 1 Titel, 2 Formwahl, 3 Reißbrett, 4 Beweise, 5 Kompendium, 6 Einstellungen –, jedes mit Schriftfeld („M 1:1“, „n / 6“). Sie liegen als Stapel übereinander: „Zurück“ (Esc / B) führt zum vorherigen Blatt. Maus, Tastatur und Gamepad teilen sich eine Fokus-Markierung. Hinter den Menüs läuft eine **Demo**: Ein Bot spielt mit einer freigeschalteten Form einen unverwundbaren Endlos-Run ab einer zufälligen Minute zwischen 2:00 und 10:00, ruhiger dargestellt (keine Schadenszahlen, kein Screenshake, Blitz-Reduktion) und alle 75 s neu. Auf dem Titel rückt die Kamera die Figur in die rechte Bildhälfte („Abb. 1 — Beweis in Arbeit“).

- **Titel:** der Satz „Jede Form lässt sich vollenden.“ mit dem Beweis „Überlebe fünfzehn Minuten.“, das Inhaltsverzeichnis § 1–5 (Spielen mit gewählter Form und Modus, Reißbrett mit Kontostand, Beweise „x / y bewiesen“, Kompendium „x / y entdeckt“, Einstellungen), eine Steuerungszeile und der Rekord (längster Run, höchstes Level). Hinweise erscheinen, wenn der Spielstand neu angelegt werden musste (10.6) oder eine Debug-Sitzung nichts speichert.
- **Formwahl:** beide Formen als Karten mit HP, Tempo, Krit, Startwaffe, Signatur-Skill und Eigenschaft; eine gesperrte Form nennt den nötigen Beweis. Darunter Modus (Normal: „15 Minuten, dann Sierpinski.“ oder Endlos) und Komplexität (K 0–5, mit Wirkung im Klartext); beides bleibt bis „Teile und herrsche“ gesperrt. „Beweis antreten“ startet den Run, die Wahl merkt sich der Spielstand.
- **Reißbrett:** alle Einträge mit Rang, Preis und Wirkung, dazu Kontostand, verbaute Splitter und „Alles erstatten“ mit Rückfrage (10.2). **Beweise** und **Kompendium** siehe 10.3 und 10.4, **Einstellungen** siehe 13.4.
- **Pause** (Esc, P, Start, Fokusverlust oder getrenntes Gamepad; auch aus dem offenen Draft heraus, der danach wieder erscheint): zugleich die **Build-Übersicht** mit Charakter, Form, Level und Zeit, dem Polygon in groß, Ecke für Ecke Waffe und Kante mit Stufe (MAX, Q.E.D.) und allen Werten von Max-HP bis Krit. Knöpfe: Weiter, Einstellungen, Aufgeben. Die Rückfrage beim Aufgeben startet auf „Abbrechen“, damit ein Doppeldruck nicht versehentlich aufgibt.
- **Ergebnis-Screen:** erscheint 1,2 s nach dem Tod (der Spieler zerspringt erst) und beim Sieg gut 3 s nach dem Banner „BEWIESEN“ (5.1). Er zeigt das Urteil – „Q.E.D.“ nach dem Sieg, „Widerlegt“ nach Tod oder Aufgeben, „Grenzwert erreicht“ nach dem Tod im Endlos-Modus –, das Build-Polygon, Zeit, Level, Kills, erreichte Form und Theoreme, nach einem Tod auch „Besiegt von“ (der Gegnertyp oder die Gegnerkugel mit dem tödlichen Treffer), „Schaden nach Quelle“ (Waffen, Skill, Nova-Zacken, Stern-Explosionen, ×-Bombe) mit Balken und Anteil, die Splitter-Abrechnung (10.1), neue Kompendium-Einträge und unter „Neu bewiesen“ die frisch erfüllten Beweise mit ihren Freischaltungen. Knöpfe: „Nochmal“ (gleiche Form, gleicher Modus) und „Zum Titel“; ins Reißbrett geht es über den Titel.

Fehlt WebGL oder tritt ein unerwarteter Fehler auf, zeigt das Spiel statt eines leeren Bildschirms einen Hinweis mit „Neu laden“.

### 13.2 HUD

| Element            | Position                         | Inhalt                                                                                                                                                                                                       |
| ------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XP-Balken          | oben, volle Breite               | Fortschritt zum nächsten Level                                                                                                                                                                               |
| Timer              | oben Mitte                       | Run-Zeit (mm:ss)                                                                                                                                                                                             |
| Level / Kills      | links oben                       | aktuelles Level und Kills                                                                                                                                                                                    |
| Splitter           | rechts oben                      | im Run gesammelte Splitter                                                                                                                                                                                   |
| Boss-Anzeige       | oben, unter dem Timer            | „SIERPINSKI“ und ein einziger Balken mit den verbleibenden HP aller Teile, auch der noch nicht abgespaltenen; keine Stückzahl                                                                                |
| HP-Balken          | direkt unter dem Spieler         | aktuelle HP (44 × 4 px, von Rot nach Grün), wandert mit                                                                                                                                                      |
| Skill-CD-Ring      | unten Mitte                      | Symbol des Signatur-Skills in einem sich füllenden Ring in Charakterfarbe, darunter „Leertaste“; leuchtet auf, sobald der Skill bereit ist                                                                   |
| Mini-Build-Polygon | unten links                      | SVG (132 px): Waffen-Glyphen an den Ecken, Axiom-Farben und -Symbole an den Kanten, Theoreme mit Goldring; die fehlenden Ecken bis zum Hexagon als blasse, gestrichelte Kontur                               |
| Position           | unten rechts                     | Koordinaten im Format „(x \| y)“, gerundet; y zählt wie im Heft nach oben                                                                                                                                    |
| Banner             | Mitte, auf 21 % der Höhe         | Morph, Elite, Formationen, Boss, Q.E.D., „BEWIESEN“, Zweiter Versuch und die Pickups ∑, × und ÷; je 2,4 s, nacheinander aus einer Warteschlange, dasselbe Banner zweimal hintereinander wird zusammengefasst |
| Würfel-Meldung     | rechts oben, unter den Splittern | Inhalt eines geöffneten Truhen-Würfels („Würfel geöffnet“), 4,5 s                                                                                                                                            |
| Würfel-Pfeile      | am Bildrand                      | zeigen auf Würfel außerhalb des Bildes                                                                                                                                                                       |

### 13.3 Steuerung

| Aktion              | Tastatur                                                   | Gamepad                     |
| ------------------- | ---------------------------------------------------------- | --------------------------- |
| Bewegen             | WASD / Pfeiltasten                                         | linker Stick oder D-Pad     |
| Signatur-Skill      | Leertaste (gehalten: löst aus, sobald bereit)              | A                           |
| Pause               | Esc / P                                                    | Start, Back oder B          |
| Draft: Karte wählen | 1–4, Pfeiltasten + Enter/Leertaste oder Maus               | D-Pad/Stick + A             |
| Draft: Neu zeichnen | R                                                          | X                           |
| Draft: Radieren     | B, dann Karte (Esc oder B bricht ab)                       | RB, dann Karte              |
| Draft: Überspringen | S                                                          | Y                           |
| Menüs               | Maus oder Pfeiltasten/WASD + Enter/Leertaste, Esc = zurück | D-Pad/Stick + A, B = zurück |

Das Spiel pausiert automatisch bei **Fokusverlust** (Tab-Wechsel, Fenster verlassen) und wenn das Gamepad, mit dem gerade gespielt wird, getrennt wird; danach steuert wieder die Tastatur. Es zählt das erste verbundene Gamepad mit Standard-Belegung; der Stick hat eine radiale Totzone und steuert in Menüs wie das D-Pad. Zum versehentlichen Auslösen im Draft siehe den Eingabeschutz in 7.4.

**Entwickler-Parameter:** `?seed`, `?t` (Startsekunde samt passendem Build), `?char` und `?stress` starten direkt einen Run, `?scene` öffnet ein bestimmtes Blatt, `?splitter` setzt den Kontostand und `?unlock` schaltet alles frei. `?debug` aktiviert F1–F7 (Overlay, +Level, Elite, +60 s, Boss, Gottmodus, Feld leeren). Sitzungen mit `?debug`, `?t`, `?stress`, `?splitter` oder `?unlock` speichern nie (10.6); `?seed`, `?char` und `?scene` allein gelten als normale Sitzung.

### 13.4 Einstellungen und Barrierefreiheit

**Einstellungen** (Blatt 6, auch aus der Pause erreichbar; sie gelten nur für diesen Browser, liegen getrennt vom Spielstand und wirken sofort):

- **Klang:** Gesamt, Effekte, Musik in 10-%-Schritten (Standard 80 / 80 / 50 %). Die Regler wirken sofort; die Lautstärke folgt dem Quadrat des Reglerwerts, damit sich die Schritte gleichmäßig anfühlen (12).
- **Darstellung:** Screenshake, Schadenszahlen, Blitz-Reduktion, Glow (Halos der Vektorgrafik, 11.3) und FPS-Anzeige, jeweils An/Aus. Standard: alles an außer Blitz-Reduktion und FPS-Anzeige.
- **Daten:** „Spielstand löschen“ mit Rückfrage (10.6).

**Barrierefreiheit**

- **Blitz-Reduktion:** Nichts blitzt oder blinkt mehr, und es gibt keine Vollbild-Blitze. Ein Treffer lässt die Kontur des Gegners kurz um bis zu 18 % anschwellen, statt ihn weiß aufblitzen zu lassen (beim Boss werden die Kanten dicker); ein Gegner im Telegraph leuchtet gleichmäßig heller, statt zu blinken, und frisch geteilte Boss-Teile sind abgedunkelt. Den roten Vollbild-Blitz bei einem Treffer ersetzt ein roter Kontur-Puls um den Spieler, den weißen der ×-Bombe eine Welle in Bombenfarbe über den Bildschirm; der Zweite Versuch kommt ohne Blitz aus. Während der Unverwundbarkeit ist der Spieler gleichmäßig halb durchsichtig. Ringe und Schockwellen (Level-Up, Morph, Explosionen, Sieg) leuchten mit halber Deckkraft; weiße Ringe und das Aufleuchten der wachsenden Ecke beim Morph erscheinen in der Farbe der Figur (der Ring einer sterbenden Elite in ihrer eigenen), Treffer-Funken in Grau, und der Strahl brennt ohne Flimmern. Die Titel-Demo läuft immer mit Blitz-Reduktion.
- **Screenshake aus:** komplett abschaltbar, Hit-Stop und Telegraphs bleiben als Rückmeldung erhalten.
- **Formen redundant zur Farbe:** Jede Gegnerkategorie ist an ihrer Form erkennbar, jedes Axiom am Symbol seiner Kante, Gegnerkugeln an ihrer Ringform. Das Spiel bleibt damit auch bei Farbenblindheit vollständig lesbar.
- **Nichts nur über Audio:** Jedes wichtige Signal (Telegraph, Elite, Boss, Level-Up) ist auch sichtbar.
- **Weniger Rauschen:** Schadenszahlen lassen sich abschalten, Effektmengen sind gedeckelt (11.5).

## 14. Ausbau nach MVP

Das MVP (Meilensteine M0–M5) umfasst Delta und Nova, 6 Waffen, 8 Axiome, 6 Theoreme, 7 Gegner-Archetypen, den Boss Sierpinski sowie Endlos-Modus und Komplexität 1–5 als Freischaltung. Alles Folgende ist Ausbau; kursive Einträge sind Ideenskizzen, keine Festlegungen.

**Charaktere:** **Bastion** (Tank, dicke Kanten, Bollwerk-Schild), **Zirkel** (Fläche, gerundete Ecken, Puls) und **Fraktal** (Beschwörer, Mini-Polygone an den Ecken, Teilung in Klone); Werte siehe Abschnitt 6. Freischaltung über neue Beweise.

**Waffen und Axiome:** Jede neue Waffe bringt ein eigenes Theorem mit, neue Axiome dienen als Partner.

| Typ   | Name                   | Idee                                                                                                         |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Waffe | **Parabel**            | _Wurfgeschoss auf Parabelbahn, Flächenschaden beim Aufschlag_                                                |
| Waffe | **Raster**             | _Gitter aus Schadenszellen rund um das Polygon, die im Takt aufblinken_                                      |
| Waffe | **Graph**              | _verbindet nahe Gegner mit Kanten; der Schaden springt entlang des Graphen_                                  |
| Waffe | **Spirale**            | _archimedische Spirale aus Geschossen, die mit dem Drehimpuls wandert_                                       |
| Waffe | **Reflexion**          | _Spiegelachse durch den Spieler: eigene Geschosse werden gespiegelt, streifende Gegnerkugeln zurückgeworfen_ |
| Axiom | **Impuls**             | _+Knockback_                                                                                                 |
| Axiom | **Konstante**          | _+flacher Schaden pro Treffer_                                                                               |
| Axiom | **Dichte**             | _+Rüstung_                                                                                                   |
| Axiom | **Wahrscheinlichkeit** | _+Glück: Krit-Chance und Drop-Chancen, auch für Splitter_                                                    |
| Axiom | **Exponent**           | _+XP-Gewinn_                                                                                                 |
| Axiom | **Drehimpuls**         | _+Rotationstempo des Polygons; Strahl und Co. fegen schneller_                                               |

Impuls, Dichte, Wahrscheinlichkeit und Exponent gibt es bereits als Reißbrett-Einträge (10.2) – Impuls dort als +Projektiltempo, Wahrscheinlichkeit nur für Drop-Chancen. Als Axiome bräuchten sie eigene Namen oder eine klare Abgrenzung.

**Bosse:** Tesserakt, Mandala, Ouroboros und ∞ (Lemniskate), siehe 8.9.

**Ebenen** – neue Arenen mit eigener Geometrie:

| Ebene            | Idee                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **Polar**        | _Raster aus Kreisen und Strahlen; Wellen rücken ringförmig an, Events laufen entlang der Radien_ |
| **Hyperbolisch** | _Poincaré-Scheibe: Zum Rand hin schrumpfen Gegner und Raum, Entfernungen täuschen_               |
| **Fraktal**      | _selbstähnliche Arena, die bei jedem Morph eine Stufe tiefer zoomt_                              |

**Kreis-Transzendenz:** Im Endlos-Modus kann das Hexagon über eine besondere Bedingung zum **Kreis** werden – dem Polygon mit unendlich vielen Ecken. _Idee: Alle Waffen feuern dann vom gesamten Umfang statt von festen Ecken, und die Axiome verschmelzen zu einem einzigen leuchtenden Ring._

**Endlos und Komplexität:** Beide sind im MVP als Freischaltung enthalten. _Ausbau: höhere Komplexitätsstufen mit eigenen Mutatoren (z. B. schnellere Gegnerkugeln, doppelte Elites) und ein Tages-Seed – die deterministische Simulation macht Runs mit gleichem Seed direkt vergleichbar._

## 15. Glossar

| Begriff         | Bedeutung                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ecke**        | Waffen-Slot des Spieler-Polygons; die Waffe feuert vom Eckpunkt                                                                                      |
| **Kante**       | Axiom-Slot zwischen zwei Ecken; leuchtet in der Farbe ihres Axioms, leer bleibt sie blass (Charakterfarbe mit 35 % Deckkraft)                        |
| **Axiom**       | passiver Bonus auf einer Kante, max. Lv 5 (Symmetrie: Lv 2)                                                                                          |
| **Theorem**     | Evolution einer Waffe: Waffe Lv 8 + passendes Axiom → Q.E.D.-Karte → Theorem im selben Eck-Slot                                                      |
| **Beweis**      | Achievement mit Freischaltung, z. B. „Quadratur“ → Axiom Symmetrie                                                                                   |
| **Splitter**    | violette Meta-Währung für das Reißbrett                                                                                                              |
| **Kristall**    | XP-Pickup mit den XP des besiegten Gegners; Größe und Farbe zeigen den Wert (grün unter 5, türkis ab 5, fast weiß ab 25 XP)                          |
| **Würfel**      | isometrischer Drahtwürfel: als weißer _Ecken-Würfel_ Auslöser des Morphs (+1 Ecke, +1 Kante), als goldener _Truhen-Würfel_ 3 Upgrades + 15 Splitter  |
| **Reißbrett**   | Meta-Shop für permanente Stat-Boni, jederzeit voll rückerstattbar („Alles erstatten“)                                                                |
| **Schale**      | verschachtelte Kontur eines Gegners = eine HP-Stufe; bricht sichtbar in fliegende Kanten                                                             |
| **Komplexität** | Schwierigkeitsstufe 0–5 (0 = Standard-Beweis), freigeschaltet durch „Teile und herrsche“: je Stufe +25 % Gegner-HP, +10 % Spawn-Rate, +20 % Splitter |
| **Q.E.D.**      | „quod erat demonstrandum“: die goldene Draft-Karte, die ein Theorem auslöst – und der Beweis für das erste Theorem                                   |
| **Kern-Punkt**  | die kleine Hitbox (r = 8 px) in der Mitte des Polygons                                                                                               |
| **Morph**       | der 0,8 s lange Übergang, in dem das Polygon eine Ecke dazugewinnt                                                                                   |
| **Telegraph**   | Vorwarnung (weißes Aufblinken + Linie, Ring oder Kreis) vor jedem gegnerischen Angriff                                                               |
| **Director**    | das System, das Spawns, Events, Elites und Boss steuert: Spawn-Rate, Obergrenze und gewichtete Pools je Zeitabschnitt plus ein Skript fester Events  |
