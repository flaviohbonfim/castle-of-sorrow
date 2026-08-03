import { computeCompletion } from "../rpg/completion";
import type { SceneId } from "../gfx/scenes";

export type EndingId = "short" | "true";

export interface EndingPanel {
  scene: SceneId;
  lines: string[];
}

export interface EndingDef {
  /** Shown on the results screen. */
  name: string;
  /** One line of context under the name (hint for the short ending). */
  note: string;
  panels: EndingPanel[];
}

/**
 * All ending prose lives here — never bake narration into UI code.
 * Lines are typed out one panel at a time by `CutsceneUI`.
 */
export const ENDINGS: Record<EndingId, EndingDef> = {
  true: {
    name: "THE NIGHT YIELDS",
    note: "Every relic recovered. The castle kept nothing.",
    panels: [
      {
        scene: "throneCollapse",
        lines: [
          "The Sovereign's crown struck the floor,",
          "and for the first time in six hundred years",
          "the throne room was silent.",
        ],
      },
      {
        scene: "castleCrumbles",
        lines: [
          "Stone by stone, the castle let go of the hill",
          "it had haunted since before the village had a name.",
          "Nothing inside cried out. It had all been borrowed.",
        ],
      },
      {
        scene: "dawn",
        lines: [
          "You carried out what the dark had taken:",
          "every relic, every stolen thing, every name.",
          "The sun found you on the road, and did not burn.",
        ],
      },
      {
        scene: "closing",
        lines: ["Castles fall. Sorrow keeps its own hours."],
      },
    ],
  },
  short: {
    name: "THE NIGHT RECEDES",
    note: "The castle sank with its secrets still in hand.",
    panels: [
      {
        scene: "sealedGate",
        lines: [
          "The Sovereign fell — but the castle did not.",
          "It drew its halls inward, and sealed the ones",
          "you never opened.",
        ],
      },
      {
        scene: "closing",
        lines: [
          "You walked out alive. Something stayed behind,",
          "and it remembers the way you left.",
        ],
      },
    ],
  },
};

/**
 * Two endings, gated on collection: the full one needs every ability relic
 * and every unique world item. Beating the Sovereign is implied by reaching
 * the cutscene at all.
 */
export function pickEnding(flags: Set<string>): EndingId {
  const c = computeCompletion(flags);
  return c.relics === c.relicsTotal && c.items === c.itemsTotal ? "true" : "short";
}
