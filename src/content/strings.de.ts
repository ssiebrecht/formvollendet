/**
 * Every UI string in one place (German). Content names and descriptions live with their content
 * tables; this file holds the chrome around them.
 */

const FORMS: Record<number, string> = {
  3: 'Dreieck',
  4: 'Quadrat',
  5: 'Pentagon',
  6: 'Hexagon',
};

export function formName(vertices: number): string {
  return FORMS[vertices] ?? `${vertices}-Eck`;
}

/** mm:ss */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** A multiplier: ×1,16 · ×2 · ×19,5. */
export function factor(v: number): string {
  return `×${v.toLocaleString('de-DE', { maximumFractionDigits: v >= 10 ? 1 : 2 })}`;
}

/** German number formatting with thin grouping (12.345). */
export function num(v: number): string {
  return Math.round(v).toLocaleString('de-DE');
}

export const S = {
  title: 'FORMVOLLENDET',
  tagline: 'Ein Bullet-Heaven aus reinen Formen',

  hud: {
    level: 'Lv',
    kills: 'Kills',
    splitter: 'Splitter',
    skill: 'Skill',
    skillReady: 'bereit',
    god: 'GOTTMODUS',
    // Padded for the monospaced label: the digits stay in place while walking.
    position: (x: number, y: number): string =>
      `(${String(Math.round(x)).padStart(6)} | ${String(Math.round(-y)).padStart(6)})`,
    boss: 'SIERPINSKI',
    slow: 'Verlangsamt',
  },

  banner: {
    morph: (vertices: number): string => `FORM: ${formName(vertices).toUpperCase()}`,
    morphSub: '+1 Ecke · +1 Kante',
    elite: 'ELITE',
    eliteSub: 'Besiege sie – sie trägt einen Würfel',
    ring: 'UMZINGELUNG',
    line: 'DIE GERADE',
    boss: 'SIERPINSKI',
    bossSub: 'Teile und herrsche',
    theorem: 'Q.E.D.',
    upgradeCube: 'WÜRFEL',
    revive: 'ZWEITER VERSUCH',
    bossDefeated: 'BEWIESEN',
    slow: '÷ Zeit halbiert',
    sum: '∑ Alle Kristalle',
    bomb: '× Auslöschung',
  },

  draft: {
    title: (level: number): string => `Level ${level}`,
    subtitle: 'Wähle ein Lemma',
    pending: (n: number): string =>
      n === 1 ? 'noch 1 weiteres Level-Up' : `noch ${n} weitere Level-Ups`,
    tagWeapon: 'Waffe · Ecke',
    tagAxiom: 'Axiom · Kante',
    tagTheorem: 'Theorem',
    tagOverWeapon: 'Überstufe · Ecke',
    tagOverAxiom: 'Überstufe · Kante',
    tagHeal: 'Heilung',
    tagSplitter: 'Splitter',
    isNew: 'NEU',
    level: (from: number, to: number): string => `Lv ${from} → ${to}`,
    max: 'MAX',
    theoremFrom: (from: string, axiom: string, level: number): string =>
      `Beweis: ${from} Lv ${level} + ${axiom}`,
    overDamage: (pct: number): string => `+${pct} % Schaden`,
    milestone: (text: string): string => `Meilenstein: ${text}`,
    heal: (n: number): string => `+${n} HP`,
    healDesc: 'Alles ist bewiesen. Heile dich.',
    splitter: (n: number): string => `+${n} Splitter`,
    splitterDesc: 'Alles ist bewiesen. Nimm Splitter mit.',
    reroll: 'Neu zeichnen',
    banish: 'Radieren',
    skip: 'Überspringen',
    banishMode: 'Welche Karte radieren? Sie kommt in diesem Run nicht wieder.',
    cancel: 'Abbrechen',
  },

  cube: {
    title: 'Würfel geöffnet',
    theorem: (name: string): string => `Q.E.D. – ${name}`,
    weapon: (name: string, level: number): string => `${name} → Lv ${level}`,
    axiom: (name: string, level: number): string => `${name} → Lv ${level}`,
    heal: (n: number): string => `+${n} HP`,
    splitter: (n: number): string => `+${n} Splitter`,
  },

  pause: {
    title: 'Pause',
    resume: 'Weiter',
    giveUp: 'Aufgeben',
    settings: 'Einstellungen',
    confirmGiveUp: 'Wirklich aufgeben?',
    confirmYes: 'Ja, aufgeben',
    weapons: 'Ecken · Waffen',
    axioms: 'Kanten · Axiome',
    empty: '— frei —',
    locked: 'noch keine Ecke',
    stats: 'Werte',
  },

  results: {
    won: 'Q.E.D.',
    wonSub: 'Sierpinski ist gefallen. Die Form ist vollendet.',
    lost: 'Widerlegt',
    lostSub: 'Deine Form ist zerbrochen.',
    endless: 'Grenzwert erreicht',
    endlessSub: 'Die Folge ist abgebrochen – aber wie weit sie kam!',
    time: 'Zeit',
    level: 'Level',
    kills: 'Kills',
    form: 'Form',
    theorems: 'Theoreme',
    killedBy: 'Besiegt von',
    bullet: 'Gegnerkugel',
    splitter: 'Splitter',
    damage: 'Schaden nach Quelle',
    again: 'Nochmal',
    toTitle: 'Zum Titel',
    none: '—',
    reward: 'Splitter-Abrechnung',
    collected: 'Eingesammelt',
    timeBonus: 'Zeitbonus',
    killBonus: 'Kill-Bonus',
    multiplier: 'Gier & Komplexität',
    total: 'Gutgeschrieben',
    newProofs: 'Neu bewiesen',
    discovered: (n: number): string =>
      n === 1 ? '1 neuer Eintrag im Kompendium' : `${n} neue Einträge im Kompendium`,
    notSaved: 'Debug-Run: nichts wurde gespeichert.',
    complexityOpened: (level: number): string => `Komplexität K ${level} freigeschaltet`,
  },

  menu: {
    play: 'Spielen',
    playNote: (char: string, mode: string): string => `${char} · ${mode}`,
    shop: 'Reißbrett',
    proofs: 'Beweise',
    codex: 'Kompendium',
    settings: 'Einstellungen',
    back: 'Zurück',
    sheet: (n: number): string => `Blatt ${n}`,
    theorem: 'Satz.',
    theoremText: 'Jede Form lässt sich vollenden.',
    proof: 'Beweis.',
    proofText: 'Überlebe zwanzig Minuten.',
    controls: 'WASD / Stick bewegen · Leertaste / A Skill · Esc / B zurück',
    recovered:
      'Der Spielstand war nicht lesbar und wurde neu angelegt. Das Original liegt als Sicherung im Browser-Speicher.',
    debugSave: 'Debug-Sitzung: Fortschritt wird nicht gespeichert.',
    scale: 'M 1:1',
    section: (n: number): string => `§ ${n}`,
    figure: (n: number, text: string): string => `Abb. ${n} — ${text}`,
    demo: 'Beweis in Arbeit',
    drawing: 'Konstruktionszeichnung',
    record: (time: string, level: number): string => `Rekord ${time} · Lv ${level}`,
  },

  select: {
    title: 'Formwahl',
    subtitle: 'Mit welcher Form trittst du den Beweis an?',
    hp: 'HP',
    speed: 'Tempo',
    crit: 'Krit',
    startWeapon: 'Startwaffe',
    skill: 'Signatur-Skill',
    trait: 'Eigenschaft',
    cooldown: (s: number): string => `Abklingzeit ${s} s`,
    locked: 'Gesperrt',
    lockedBy: (proof: string): string => `Beweise „${proof}“`,
    mode: 'Modus',
    normal: 'Normal',
    normalDesc: '20 Minuten, dann Sierpinski.',
    endless: 'Endlos',
    endlessDesc: 'Es geht weiter: Die Dichte wächst, alle 10 Minuten kehrt Sierpinski zurück.',
    complexity: 'Komplexität',
    complexityNone: 'Standard-Beweis',
    complexityDesc: (hp: number, damage: number, rate: number, splitter: number): string =>
      `Gegner-HP ${factor(hp)} · Gegnerschaden ${factor(damage)} · Spawns ${factor(rate)} · Splitter ${factor(splitter)}`,
    mutatorsFrom: (level: number): string => `Ab K ${level} kommt je Stufe ein Mutator hinzu.`,
    mutators: (count: number, name: string, desc: string): string =>
      count === 1 ? `Mutator: ${name} – ${desc}` : `${count} Mutatoren · neu: ${name} – ${desc}`,
    complexityLocked: (next: number, need: number): string =>
      `K ${next} öffnet ein Sieg über Sierpinski auf K ${need}.`,
    modeLocked: 'Beweise „Teile und herrsche“',
    start: 'Beweis antreten',
    selected: 'gewählt',
    values: 'Kennwerte',
    level: (n: number): string => `K ${n}`,
  },

  shop: {
    title: 'Reißbrett',
    subtitle: 'Permanente Lemmata für jeden Run. Jederzeit voll erstattbar.',
    balance: 'Splitter',
    spent: (n: string): string => `${n} verbaut`,
    max: 'MAX',
    rank: (r: number, max: number): string => `Rang ${r}/${max}`,
    /** Every rank of the current tier bought, more come with an Erweiterung. */
    needTier: 'Erweiterung nötig',
    tiers: 'Erweiterungen',
    tierHint: (proofs: string): string => `Jeder dieser Beweise öffnet eine: ${proofs}`,
    refund: 'Alles erstatten',
    refundConfirm: (n: string): string => `${n} Splitter zurück aufs Konto?`,
    refundYes: 'Ja, erstatten',
    cancel: 'Abbrechen',
  },

  proofs: {
    title: 'Beweise',
    subtitle: 'Sätze, die noch zu beweisen sind – und was sie eröffnen.',
    number: (n: number): string => `Satz ${n}`,
    proven: 'Q.E.D.',
    open: 'offen',
    unlocks: 'Eröffnet',
    stats: 'Statistik',
    runs: 'Runs',
    wins: 'Siege',
    kills: 'Kills gesamt',
    bestTime: 'Längster Run',
    bestLevel: 'Höchstes Level',
    bestKills: 'Meiste Kills',
    theorems: 'Theoreme gesamt',
    bossKills: 'Sierpinski besiegt',
    bestComplexity: 'Höchste Komplexität',
    bestWeaponLevel: 'Höchste Waffenstufe',
    splitterEarned: 'Splitter verdient',
    count: (a: number, b: number): string => `${a} / ${b} bewiesen`,
    vertices: (n: number): string => `${n} Ecken`,
    /** What the last Beweis opens: nothing but itself. */
    final: 'die Vollendung selbst',
  },

  unlock: {
    weapon: (name: string): string => `Waffe ${name}`,
    axiom: (name: string): string => `Axiom ${name}`,
    char: (name: string): string => `Form ${name}`,
    endless: 'Endlos-Modus & Komplexität',
    meta: (name: string): string => `Lemma ${name}`,
    tier: 'Reißbrett-Erweiterung',
  },

  codex: {
    title: 'Kompendium',
    subtitle: 'Alles, was dir begegnet ist.',
    weapons: 'Waffen',
    theorems: 'Theoreme',
    axioms: 'Axiome',
    enemies: 'Gegner',
    forms: 'Formen',
    found: (a: number, b: number): string => `${a} / ${b} entdeckt`,
    unknown: '???',
    unknownDesc: 'Noch nicht entdeckt.',
    damage: 'Schaden',
    cooldown: 'Abklingzeit',
    levels: 'Stufen',
    maxLevel: (n: number): string => `bis Lv ${n}`,
    perLevel: 'Pro Stufe',
    over: 'Überstufe',
    overFrom: (level: number): string => `ab Lv ${level}`,
    overDamage: (pct: number): string => `+${pct} % Schaden je Stufe`,
    milestoneLevels: (a: number, b: number): string => `Lv ${a}, ${b} …`,
    proof: 'Beweis',
    hp: 'HP',
    speed: 'Tempo',
    contact: 'Kontaktschaden',
    shells: 'Schalen',
    boss: 'Boss',
    role: 'Rolle',
    trait: 'Eigenschaft',
    skill: 'Signatur-Skill',
    startWeapon: 'Startwaffe',
    levelLine: (level: number): string => `Lv ${level}`,
    evolves: (theorem: string, axiom: string): string => `Mit ${axiom} → ${theorem}`,
    recipe: (weapon: string, axiom: string, level: number): string =>
      `${weapon} Lv ${level} + ${axiom}`,
    roles: {
      chase: 'Verfolger',
      dash: 'Sprinter',
      orbitDive: 'Umkreiser',
      kite: 'Fernkampf',
      spawner: 'Beschwörer',
      kamikaze: 'Zünder',
      march: 'Formation',
      boss: 'Boss',
    },
  },

  settings: {
    title: 'Einstellungen',
    subtitle: 'Gilt nur für diesen Browser.',
    audio: 'Klang',
    master: 'Gesamt',
    sfx: 'Effekte',
    music: 'Musik',
    display: 'Darstellung',
    shake: 'Screenshake',
    damageNumbers: 'Schadenszahlen',
    flash: 'Blitz-Reduktion',
    glow: 'Glow',
    fps: 'FPS-Anzeige',
    on: 'An',
    off: 'Aus',
    data: 'Daten',
    reset: 'Spielstand löschen',
    resetConfirm: 'Wirklich? Splitter, Reißbrett, Beweise und Kompendium gehen verloren.',
    resetYes: 'Ja, löschen',
    resetDone: 'Spielstand gelöscht.',
    cancel: 'Abbrechen',
    percent: (v: number): string => `${Math.round(v * 100)} %`,
  },

  sources: {
    vektor: 'Vektor',
    supernova: 'Supernova',
    nova: 'Krit-Zacken',
    stern: 'Stern-Explosionen',
    bomb: '×-Bombe',
  } as Record<string, string>,

  stats: {
    might: 'Schaden',
    cooldown: 'Abklingzeit',
    area: 'Fläche',
    amount: 'Anzahl',
    projSpeed: 'Projektiltempo',
    moveSpeed: 'Lauftempo',
    maxHp: 'Max-HP',
    regen: 'Regeneration',
    armor: 'Rüstung',
    magnet: 'Sammelradius',
    crit: 'Krit-Chance',
  },

  keys: {
    move: 'WASD / Pfeile',
    skill: 'Leertaste',
    pause: 'Esc',
    pick: '1–4',
  },

  debug: {
    on: 'Debug an: F1 Overlay · F2 +Level · F3 Elite · F4 +60 s · F5 Boss · F6 Gott · F7 Feld leeren',
  },

  error: {
    title: 'Etwas ist schiefgelaufen',
    webgl:
      'WebGL ist nicht verfügbar. Bitte einen aktuellen Browser mit Hardware-Beschleunigung verwenden.',
    reload: 'Neu laden',
  },
} as const;
