import { ROOMS } from "../world/rooms";

/** Relics that count toward 100% (ability unlocks). */
export const COMPLETION_RELICS = [
  "doubleJump",
  "batForm",
  "wolfForm",
  "mistForm",
  "waterWalk",
  "highJump",
  "batFire",
  "wolfDash",
] as const;

export const COMPLETION_BOSSES = ["colossus", "wraith", "sovereign", "dracula"] as const;

/** One-off world items (flag `item:<room>:<n>`). */
export const COMPLETION_ITEMS = ["item:lakeDepths:0"] as const;

export interface CompletionBreakdown {
  visited: number;
  visitedTotal: number;
  relics: number;
  relicsTotal: number;
  bosses: number;
  bossesTotal: number;
  items: number;
  itemsTotal: number;
  /** 0–100 integer */
  percent: number;
}

export function computeCompletion(flags: Set<string>): CompletionBreakdown {
  const roomIds = Object.keys(ROOMS);
  const visited = roomIds.filter((id) => flags.has(`visited:${id}`)).length;
  const relics = COMPLETION_RELICS.filter((r) => flags.has(`relic:${r}`)).length;
  const bosses = COMPLETION_BOSSES.filter((b) => flags.has(`boss:${b}`)).length;
  const items = COMPLETION_ITEMS.filter((i) => flags.has(i)).length;

  const got = visited + relics + bosses + items;
  const total =
    roomIds.length + COMPLETION_RELICS.length + COMPLETION_BOSSES.length + COMPLETION_ITEMS.length;
  const percent = total <= 0 ? 0 : Math.min(100, Math.round((got / total) * 100));

  return {
    visited,
    visitedTotal: roomIds.length,
    relics,
    relicsTotal: COMPLETION_RELICS.length,
    bosses,
    bossesTotal: COMPLETION_BOSSES.length,
    items,
    itemsTotal: COMPLETION_ITEMS.length,
    percent,
  };
}

export function formatPlayTime(ticks: number): string {
  const sec = Math.floor(ticks / 60);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${mm}:${String(s).padStart(2, "0")}`;
}
