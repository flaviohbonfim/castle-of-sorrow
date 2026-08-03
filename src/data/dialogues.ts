/**
 * Dialogue pages: each entry is 1–3 short lines for the textbox.
 * Speaker name + portrait key live in NPC_DEFS / resolve logic.
 */
export type DialoguePages = string[][];

export const DIALOGUES: Record<string, DialoguePages> = {
  // --- Hermit (shop) ---
  hermit_welcome: [
    ["Ah… another soul who walks", "these halls after midnight."],
    ["I keep relics and remedies.", "Trade if you must, night-walker."],
  ],
  hermit_quest: [
    ["A coral ring sleeps beneath", "the sunken depths."],
    ["Bring it to me, and I will", "strengthen your heart…"],
    ["…and part with my wares", "for a kinder price."],
  ],
  hermit_has_ring: [
    ["You found it! The sea's gift.", "Permit me a moment…"],
    ["There. Your vessel is sturdier.", "And my prices… friendlier."],
  ],
  hermit_done: [
    ["The lake is quieter now.", "Browse freely, friend."],
  ],
  hermit_after_colossus: [
    ["You slew the Colossus…", "I felt the castle shudder."],
    ["Deeper wings will not", "forgive so easily."],
  ],

  // --- Flavor NPCs ---
  ghost_gallery: [
    ["I was a knight once…", "or a shadow of one."],
    ["The Sanctuary to the east", "hides a gale's soul."],
    ["Break the cracked wall.", "Jump twice, and rise."],
  ],
  ghost_after_dj: [
    ["You already wear the gale.", "Climb the marble sky next."],
  ],
  demon_cage: [
    ["Rattle, rattle… free me?", "Ha. The gears above guard", "Gravity's boots."],
    ["Defeat the ticking wraith", "at the spire's crown."],
  ],
  demon_after_wraith: [
    ["The clock is silent.", "I remain caged. Typical."],
  ],
};

export interface NpcDef {
  id: string;
  name: string;
  portrait: "hermit" | "ghost" | "demon";
  /** Resolve which dialogue id to play given world flags / inventory. */
  pickDialogue: (flags: Set<string>, hasItem: (id: string) => boolean) => string;
  /** Side effect when a specific dialogue finishes. */
  onComplete?: (
    dialogueId: string,
    ctx: {
      flags: Set<string>;
      hasItem: (id: string) => boolean;
      removeItem: (id: string) => boolean;
      grantHeartMax: (n: number) => void;
    },
  ) => void;
  /** After dialogue closes, open the shop (Hermit). */
  openShopAfter?: boolean;
}

export const NPC_DEFS: Record<string, NpcDef> = {
  hermit: {
    id: "hermit",
    name: "Hermit",
    portrait: "hermit",
    openShopAfter: true,
    pickDialogue(flags, hasItem) {
      if (flags.has("quest:coral:done")) {
        if (flags.has("boss:colossus") && !flags.has("dlg:hermit:colossus")) {
          return "hermit_after_colossus";
        }
        return "hermit_done";
      }
      if (hasItem("coralRing")) return "hermit_has_ring";
      if (flags.has("quest:coral:offered")) return "hermit_quest";
      return "hermit_welcome";
    },
    onComplete(dialogueId, ctx) {
      if (dialogueId === "hermit_welcome" || dialogueId === "hermit_quest") {
        ctx.flags.add("quest:coral:offered");
      }
      if (dialogueId === "hermit_has_ring" && ctx.hasItem("coralRing")) {
        ctx.removeItem("coralRing");
        ctx.grantHeartMax(10);
        ctx.flags.add("quest:coral:done");
      }
      if (dialogueId === "hermit_after_colossus") {
        ctx.flags.add("dlg:hermit:colossus");
      }
    },
  },
  ghost: {
    id: "ghost",
    name: "Pale Knight",
    portrait: "ghost",
    pickDialogue(flags) {
      return flags.has("relic:doubleJump") ? "ghost_after_dj" : "ghost_gallery";
    },
  },
  demon: {
    id: "demon",
    name: "Caged Imp",
    portrait: "demon",
    pickDialogue(flags) {
      return flags.has("boss:wraith") ? "demon_after_wraith" : "demon_cage";
    },
  },
};
