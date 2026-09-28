/** Device-local presentation settings (the run and meta save never depend on them). */
export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  screenShake: boolean;
  damageNumbers: boolean;
  /** No full-screen flashes or blinking; hits and telegraphs pulse in contour and colour. */
  flashReduction: boolean;
  /** 0 = off, 1 = full vector-stroke halos. Baked sprite glow is always on. */
  glow: 0 | 1;
  showFps: boolean;
}

const KEY = 'formvollendet.settings.v1';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  screenShake: true,
  damageNumbers: true,
  flashReduction: false,
  glow: 1,
  showFps: false,
};

export function loadSettings(): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const data = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    // Take only known keys with the right type; anything else falls back to the default.
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = data[key];
      if (typeof v !== typeof DEFAULT_SETTINGS[key]) continue;
      if (key === 'glow' && v !== 0 && v !== 1) continue;
      (s as unknown as Record<string, unknown>)[key] = v;
    }
  } catch {
    // Private mode or corrupt JSON: defaults.
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: settings stay for this session only.
  }
}
