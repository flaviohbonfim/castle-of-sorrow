import type { SaveFile } from "../game";
import { ROOMS } from "../world/rooms";
import { computeCompletion, formatPlayTime } from "./completion";

/**
 * The ONLY module allowed to touch localStorage for saves.
 *
 * Three independent slots plus a one-time migration of the original
 * single-file key. Save keys are append-only: never repurpose an existing
 * key, and every read tolerates missing/legacy fields.
 */

export const SLOT_COUNT = 3;

const KEY_PREFIX = "castle-of-sorrow-save";
const LEGACY_KEY = KEY_PREFIX;

export function slotKey(slot: number): string {
  return `${KEY_PREFIX}:${slot}`;
}

export interface SlotSummary {
  slot: number;
  roomName: string;
  level: number;
  percent: number;
  time: string;
  deaths: number;
  savedAt: number;
}

/** Parsed slot contents, or null when empty/unreadable. Never throws. */
export function readSlot(slot: number): SaveFile | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveFile;
    // Written by a newer build than this one — treat as unreadable.
    if ((data.version ?? 1) > 1) return null;
    if (!data.room || !data.player) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSlot(slot: number, data: SaveFile): boolean {
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(data));
    return true;
  } catch {
    // Storage unavailable (private mode) — play on without saving.
    return false;
  }
}

export function deleteSlot(slot: number): void {
  try {
    localStorage.removeItem(slotKey(slot));
  } catch {
    /* ignore */
  }
}

export function anySlotUsed(): boolean {
  for (let i = 0; i < SLOT_COUNT; i++) if (readSlot(i)) return true;
  return false;
}

/** Slot with the newest `savedAt`, or null when all are empty. */
export function mostRecentSlot(): number | null {
  let best: number | null = null;
  let bestAt = -1;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const data = readSlot(i);
    if (data && (data.savedAt ?? 0) >= bestAt) {
      bestAt = data.savedAt ?? 0;
      best = i;
    }
  }
  return best;
}

/** Display row for the slot picker, or null when the slot is empty. */
export function slotSummary(slot: number): SlotSummary | null {
  const data = readSlot(slot);
  if (!data) return null;
  const completion = computeCompletion(new Set(data.flags ?? []));
  return {
    slot,
    roomName: ROOMS[data.room]?.name ?? "Unknown",
    level: data.player?.levelState?.level ?? 1,
    percent: completion.percent,
    time: formatPlayTime(data.playTicks ?? 0),
    deaths: data.deaths ?? 0,
    savedAt: data.savedAt ?? 0,
  };
}

/**
 * Move a pre-slot save file into slot 0 exactly once, then drop the old key
 * so existing players keep their run when they update.
 */
export function migrateLegacy(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    if (!readSlot(0)) localStorage.setItem(slotKey(0), raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
