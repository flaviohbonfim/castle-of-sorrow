/**
 * Lightweight player prefs (scanlines, language, etc.). Stored in
 * localStorage; missing keys default safely so old profiles keep working.
 */

import { initLocale, type Locale } from "../data/i18n";

const KEY = "castle-of-sorrow-settings";

export interface Settings {
  /** CRT-ish scanline overlay (Phase 9). */
  scanlines: boolean;
  /** UI language. */
  language: Locale;
}

const DEFAULTS: Settings = {
  scanlines: false,
  language: "en",
};

let cache: Settings | null = null;

function parseLanguage(v: unknown): Locale {
  return v === "pt-BR" ? "pt-BR" : "en";
}

export function loadSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      cache = { ...DEFAULTS };
      initLocale(cache.language);
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    cache = {
      scanlines: typeof parsed.scanlines === "boolean" ? parsed.scanlines : DEFAULTS.scanlines,
      language: parseLanguage(parsed.language),
    };
    initLocale(cache.language);
    return cache;
  } catch {
    cache = { ...DEFAULTS };
    initLocale(cache.language);
    return cache;
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  if (patch.language) initLocale(next.language);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode — keep in-memory only
  }
  return next;
}

export function getSettings(): Settings {
  return loadSettings();
}
