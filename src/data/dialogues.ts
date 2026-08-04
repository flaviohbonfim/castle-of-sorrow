/**
 * Dialogue pages: each entry is 1–3 short lines for the textbox.
 * Speaker name + portrait key live in NPC_DEFS / resolve logic.
 * Lines are bilingual; resolve with `dialoguePages(id)`.
 */
import { getLocale, t, type Locale } from "./i18n";

export type DialoguePages = string[][];

type LocPages = Record<Locale, DialoguePages>;

export const DIALOGUES: Record<string, LocPages> = {
  hermit_welcome: {
    en: [
      ["Ah… another soul who walks", "these halls after midnight."],
      ["I keep relics and remedies.", "Trade if you must, night-walker."],
    ],
    "pt-BR": [
      ["Ah… outra alma que vagueia", "nestes salões após a meia-noite."],
      ["Guardo relíquias e remédios.", "Negocie se quiser, andarilho."],
    ],
  },
  hermit_quest: {
    en: [
      ["A coral ring sleeps beneath", "the sunken depths."],
      ["Bring it to me, and I will", "strengthen your heart…"],
      ["…and part with my wares", "for a kinder price."],
    ],
    "pt-BR": [
      ["Um anel de coral dorme", "nas profundezas submersas."],
      ["Traga-o a mim, e eu", "fortalecerei seu coração…"],
      ["…e venderei minhas mercadorias", "por um preço mais amigável."],
    ],
  },
  hermit_has_ring: {
    en: [
      ["You found it! The sea's gift.", "Permit me a moment…"],
      ["There. Your vessel is sturdier.", "And my prices… friendlier."],
    ],
    "pt-BR": [
      ["Você o achou! Presente do mar.", "Permita-me um momento…"],
      ["Pronto. Seu corpo está mais firme.", "E meus preços… mais leves."],
    ],
  },
  hermit_done: {
    en: [["The lake is quieter now.", "Browse freely, friend."]],
    "pt-BR": [["O lago está mais quieto.", "Olhe à vontade, amigo."]],
  },
  hermit_after_colossus: {
    en: [
      ["You slew the Colossus…", "I felt the castle shudder."],
      ["Deeper wings will not", "forgive so easily."],
    ],
    "pt-BR": [
      ["Você derrotou o Colosso…", "Senti o castelo estremecer."],
      ["As asas mais profundas", "não perdoam tão fácil."],
    ],
  },
  ghost_gallery: {
    en: [
      ["I was a knight once…", "or a shadow of one."],
      ["The Sanctuary to the east", "hides a gale's soul."],
      ["Break the cracked wall.", "Jump twice, and rise."],
    ],
    "pt-BR": [
      ["Já fui um cavaleiro…", "ou a sombra de um."],
      ["O Santuário a leste", "esconde a alma da ventania."],
      ["Quebre a parede rachada.", "Pule duas vezes, e suba."],
    ],
  },
  ghost_after_dj: {
    en: [["You already wear the gale.", "Climb the marble sky next."]],
    "pt-BR": [["Você já veste a ventania.", "Suba o céu de mármore agora."]],
  },
  demon_cage: {
    en: [
      ["Rattle, rattle… free me?", "Ha. The gears above guard", "Gravity's boots."],
      ["Defeat the ticking wraith", "at the spire's crown."],
    ],
    "pt-BR": [
      ["Rangem, rangem… me solta?", "Ha. As engrenagens acima", "guardam as botas da gravidade."],
      ["Derrote o espectro tique-taque", "no topo da torre."],
    ],
  },
  demon_after_wraith: {
    en: [["The clock is silent.", "I remain caged. Typical."]],
    "pt-BR": [["O relógio calou.", "Continuo enjaulado. Típico."]],
  },
};

export function dialoguePages(id: string): DialoguePages | null {
  const entry = DIALOGUES[id];
  if (!entry) return null;
  const loc = getLocale();
  return entry[loc] ?? entry.en;
}

export interface NpcDef {
  id: string;
  /** i18n key under npc.* */
  nameKey: string;
  portrait: "hermit" | "ghost" | "demon";
  pickDialogue: (flags: Set<string>, hasItem: (id: string) => boolean) => string;
  onComplete?: (
    dialogueId: string,
    ctx: {
      flags: Set<string>;
      hasItem: (id: string) => boolean;
      removeItem: (id: string) => boolean;
      grantHeartMax: (n: number) => void;
    },
  ) => void;
  openShopAfter?: boolean;
}

export function npcName(def: NpcDef): string {
  return t(def.nameKey);
}

export const NPC_DEFS: Record<string, NpcDef> = {
  hermit: {
    id: "hermit",
    nameKey: "npc.hermit",
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
    nameKey: "npc.ghost",
    portrait: "ghost",
    pickDialogue(flags) {
      return flags.has("relic:doubleJump") ? "ghost_after_dj" : "ghost_gallery";
    },
  },
  demon: {
    id: "demon",
    nameKey: "npc.demon",
    portrait: "demon",
    pickDialogue(flags) {
      return flags.has("boss:wraith") ? "demon_after_wraith" : "demon_cage";
    },
  },
};
