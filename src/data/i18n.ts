/**
 * Lightweight UI localisation. Locale is stored in settings (localStorage).
 * Gameplay values and flag ids stay English; only player-facing text is keyed.
 */

export type Locale = "en" | "pt-BR";

type Dict = Record<string, string>;

const EN: Dict = {
  // Title
  "title.new": "NEW GAME",
  "title.load": "LOAD GAME",
  "title.hint": "↑↓ choose    X confirm    ←→ language",
  "title.subtitle": "a nocturne in six hundred years",
  "title.lang": "Language",

  // HUD
  "hud.hints": "[Tab] Menu  [V] Sub",

  // Interactables
  "prompt.talk": "[^] Talk",
  "prompt.talkQuest": "[^] Talk !",
  "prompt.warp": "[^] Warp",
  "prompt.save": "[^] Save",
  "prompt.saved": "Saved",

  // Menu tabs
  "menu.tab.status": "STATUS",
  "menu.tab.equip": "EQUIP",
  "menu.tab.items": "ITEMS",
  "menu.tab.map": "MAP",
  "menu.tab.book": "BOOK",
  "menu.tab.sys": "SYS",
  "menu.book": "— ENEMY BOOK —",
  "menu.book.unknown": "????",
  "menu.book.empty": "No foes recorded yet.",
  "menu.book.hint": "↑↓ browse   Strike foes to unlock",
  "menu.book.count": "{n}/{total} recorded",
  "menu.book.hp": "HP",
  "menu.book.atk": "ATK",
  "menu.book.def": "DEF",
  "menu.book.exp": "EXP",
  "menu.book.boss": "BOSS",
  "menu.hint.book": "↑↓ entry   ←→ tabs",

  "enemy.skeleton.name": "Skeleton",
  "enemy.skeleton.desc": "Bone walker of the halls. Turns at ledges; drops hearts often.",
  "enemy.bat.name": "Bat",
  "enemy.bat.desc": "Swoops in a shallow sine. Fragile, but nests in numbers.",
  "enemy.fishman.name": "Merman",
  "enemy.fishman.desc": "Leaps from floodwaters and spits. Watch the surface.",
  "enemy.medusaHead.name": "Medusa Head",
  "enemy.medusaHead.desc": "Sine-wave flyer. Touch turns flesh to stone — mash free.",
  "enemy.axeKnight.name": "Axe Knight",
  "enemy.axeKnight.desc": "Armored sentinel. Throws spinning axes in wide arcs.",
  "enemy.colossus.name": "Bone Colossus",
  "enemy.colossus.desc": "Wing guardian. Charges and rains bones when enraged.",
  "enemy.wraith.name": "Clockwork Wraith",
  "enemy.wraith.desc": "Spire master. Phases, summons heads, keeps lethal rhythm.",
  "enemy.sovereign.name": "Eternal Sovereign",
  "enemy.sovereign.desc": "The Colossus reborn. Heavier blows, no mercy.",
  "enemy.zombie.name": "Zombie",
  "enemy.zombie.desc": "Slow undead. Easy prey alone; deadly in packs.",
  "enemy.spearGuard.name": "Spear Guard",
  "enemy.spearGuard.desc": "Lunges when you enter range. Keep your distance.",
  "enemy.fleaMan.name": "Flea Man",
  "enemy.fleaMan.desc": "Tiny jumper. Hard to pin down on ledges.",
  "enemy.dracula.name": "Dracula",
  "enemy.dracula.desc": "Lord of the castle. Teleports, blood bolts, two forms.",
  "menu.status": "STATUS",
  "menu.combat": "COMBAT",
  "menu.relics": "RELICS",
  "menu.none": "(none)",
  "menu.more": "+{n} more",
  "menu.character": "— CHARACTER —",
  "menu.weapon": "Weapon",
  "menu.equipment": "— EQUIPMENT —",
  "menu.items": "— ITEMS —",
  "menu.emptyItems": "(no items)",
  "menu.map": "— CASTLE MAP —",
  "menu.sys": "— SYSTEM —",
  "menu.sys.music": "Music",
  "menu.sys.musicOn": "Music: ON",
  "menu.sys.musicOff": "Music: OFF",
  "menu.sys.lang": "Language",
  "menu.sys.scanOn": "Scanlines: ON",
  "menu.sys.scanOff": "Scanlines: OFF",
  "menu.sys.save": "Save game",
  "menu.sys.title": "Return to title",
  "menu.flash.unequip": "Unequipped",
  "menu.flash.equipped": "Equipped {name}",
  "menu.flash.noEffect": "No effect",
  "menu.flash.used": "Used",
  "menu.flash.musicOn": "Music ON",
  "menu.flash.musicOff": "Music OFF",
  "menu.flash.lang": "Language: {lang}",
  "menu.flash.scanOn": "Scanlines ON",
  "menu.flash.scanOff": "Scanlines OFF",
  "menu.hint.status": "←→ tabs",
  "menu.hint.equip": "↑↓ slot   X unequip   ←→ tabs",
  "menu.hint.items": "↑↓ item   X use/equip   ←→ tabs",
  "menu.hint.map": "←→ tabs",
  "menu.hint.sys": "↑↓ option   X confirm   ←→ tabs",
  "menu.slot.rightHand": "Right Hand",
  "menu.slot.leftHand": "Left Hand",
  "menu.slot.head": "Head",
  "menu.slot.body": "Body",
  "menu.slot.cloak": "Cloak",
  "menu.slot.accessory1": "Acc. 1",
  "menu.slot.accessory2": "Acc. 2",
  "menu.empty": "— empty —",

  // Shop / warp / slots
  "shop.title": "— HERMIT'S WARES —",
  "shop.titleFriend": "— HERMIT'S WARES (friend) —",
  "shop.hint": "X: buy   Tab: leave",
  "shop.relic": "(relic)",
  "warp.title": "— WARP —",
  "warp.hint": "↑↓ select   X/Z confirm   Esc cancel",
  "slots.load": "LOAD GAME",
  "slots.save": "SAVE GAME",
  "slots.delete": "DELETE SLOT",
  "slots.empty": "— empty —",
  "slots.slot": "SLOT {n}",
  "slots.overwrite": "Overwrite slot {n}?  X yes   Z no",
  "slots.confirmDelete": "Delete slot {n}?  X yes   Z no",
  "slots.hint": "↑↓ choose   X confirm   C delete   Z back",
  "slots.lv": "Lv {n}",

  // Combat / notices
  "notice.levelUp": "LEVEL {n}!",
  "notice.maxHp": "+{n} Max HP",
  "notice.petrify": "STONE!",
  "notice.stoneBreak": "Free!",

  // NPCs / speakers
  "npc.hermit": "Hermit",
  "npc.ghost": "Pale Knight",
  "npc.demon": "Caged Imp",
  "npc.dracula": "Dracula",
  "npc.hero": "Night-Walker",

  // Relics
  "relic.doubleJump": "Soul of the Gale",
  "relic.batForm": "Soul of the Bat",
  "relic.wolfForm": "Skin of the Wolf",
  "relic.mistForm": "Power of the Mist",
  "relic.waterWalk": "Mermaid Statue",
  "relic.highJump": "Gravity Boots",
  "relic.batFire": "Fire of the Bat",
  "relic.wolfDash": "Fang of the Gale",
  "relic.desc.doubleJump": "Double Jump!",
  "relic.desc.batForm": "Bat Form [1]!",
  "relic.desc.wolfForm": "Wolf Form [2]!",
  "relic.desc.mistForm": "Mist Form [3]!",
  "relic.desc.waterWalk": "Water Walking!",
  "relic.desc.highJump": "High Jump!",
  "relic.desc.batFire": "Bat Fireball [X]!",
  "relic.desc.wolfDash": "Sonic Run!",

  // Status tips
  "tip.1": "Explore every wing of the castle.",
  "tip.2": "Relics open new paths forever.",
  "tip.3": "Save often at blue pedestals.",
  "tip.4": "Medusa Heads turn you to stone —",
  "tip.5": "mash ←→ to break free.",
};

const PT: Dict = {
  "title.new": "NOVO JOGO",
  "title.load": "CARREGAR",
  "title.hint": "↑↓ escolher    X confirmar    ←→ idioma",
  "title.subtitle": "um noturno em seiscentos anos",
  "title.lang": "Idioma",

  "hud.hints": "[Tab] Menu  [V] Sub",

  "prompt.talk": "[^] Falar",
  "prompt.talkQuest": "[^] Falar !",
  "prompt.warp": "[^] Portal",
  "prompt.save": "[^] Salvar",
  "prompt.saved": "Salvo",

  "menu.tab.status": "STATUS",
  "menu.tab.equip": "EQUIP",
  "menu.tab.items": "ITENS",
  "menu.tab.map": "MAPA",
  "menu.tab.book": "LIVRO",
  "menu.tab.sys": "SIS",
  "menu.book": "— LIVRO DE INIMIGOS —",
  "menu.book.unknown": "????",
  "menu.book.empty": "Nenhum inimigo registrado.",
  "menu.book.hint": "↑↓ navegar   Acerte inimigos p/ liberar",
  "menu.book.count": "{n}/{total} registrados",
  "menu.book.hp": "HP",
  "menu.book.atk": "ATK",
  "menu.book.def": "DEF",
  "menu.book.exp": "EXP",
  "menu.book.boss": "CHEFE",
  "menu.hint.book": "↑↓ entrada   ←→ abas",

  "enemy.skeleton.name": "Esqueleto",
  "enemy.skeleton.desc": "Andarilho de ossos. Vira em beiradas; solta corações.",
  "enemy.bat.name": "Morcego",
  "enemy.bat.desc": "Voa em seno raso. Frágil, mas vem em bando.",
  "enemy.fishman.name": "Merman",
  "enemy.fishman.desc": "Pula da água e cospe. Fique de olho na superfície.",
  "enemy.medusaHead.name": "Cabeça de Medusa",
  "enemy.medusaHead.desc": "Voa em seno. Toque vira pedra — aperte ←→ p/ livrar.",
  "enemy.axeKnight.name": "Cavaleiro do Machado",
  "enemy.axeKnight.desc": "Sentinela blindada. Arremessa machados em arco.",
  "enemy.colossus.name": "Colosso de Ossos",
  "enemy.colossus.desc": "Guardião da ala. Carrega e chove ossos enfurecido.",
  "enemy.wraith.name": "Espectro Relógio",
  "enemy.wraith.desc": "Mestre da torre. Faseia, invoca cabeças, ritmo letal.",
  "enemy.sovereign.name": "Soberano Eterno",
  "enemy.sovereign.desc": "O Colosso renascido. Golpes mais pesados, sem piedade.",
  "enemy.zombie.name": "Zumbi",
  "enemy.zombie.desc": "Morto-vivo lento. Fácil sozinho; perigoso em grupo.",
  "enemy.spearGuard.name": "Guarda da Lança",
  "enemy.spearGuard.desc": "Investe quando você chega perto. Mantenha distância.",
  "enemy.fleaMan.name": "Homem-Pulga",
  "enemy.fleaMan.desc": "Saltador minúsculo. Difícil de acertar em plataformas.",
  "enemy.dracula.name": "Drácula",
  "enemy.dracula.desc": "Senhor do castelo. Teleporta, sangue e duas formas.",
  "menu.status": "STATUS",
  "menu.combat": "COMBATE",
  "menu.relics": "RELÍQUIAS",
  "menu.none": "(nenhuma)",
  "menu.more": "+{n} mais",
  "menu.character": "— PERSONAGEM —",
  "menu.weapon": "Arma",
  "menu.equipment": "— EQUIPAMENTO —",
  "menu.items": "— ITENS —",
  "menu.emptyItems": "(sem itens)",
  "menu.map": "— MAPA DO CASTELO —",
  "menu.sys": "— SISTEMA —",
  "menu.sys.music": "Música",
  "menu.sys.musicOn": "Música: ON",
  "menu.sys.musicOff": "Música: OFF",
  "menu.sys.lang": "Idioma",
  "menu.sys.scanOn": "Scanlines: ON",
  "menu.sys.scanOff": "Scanlines: OFF",
  "menu.sys.save": "Salvar jogo",
  "menu.sys.title": "Voltar ao título",
  "menu.flash.unequip": "Desequipado",
  "menu.flash.equipped": "Equipou {name}",
  "menu.flash.noEffect": "Sem efeito",
  "menu.flash.used": "Usado",
  "menu.flash.musicOn": "Música ON",
  "menu.flash.musicOff": "Música OFF",
  "menu.flash.lang": "Idioma: {lang}",
  "menu.flash.scanOn": "Scanlines ON",
  "menu.flash.scanOff": "Scanlines OFF",
  "menu.hint.status": "←→ abas",
  "menu.hint.equip": "↑↓ slot   X tirar   ←→ abas",
  "menu.hint.items": "↑↓ item   X usar/equipar   ←→ abas",
  "menu.hint.map": "←→ abas",
  "menu.hint.sys": "↑↓ opção   X confirmar   ←→ abas",
  "menu.slot.rightHand": "Mão dir.",
  "menu.slot.leftHand": "Mão esq.",
  "menu.slot.head": "Cabeça",
  "menu.slot.body": "Corpo",
  "menu.slot.cloak": "Capa",
  "menu.slot.accessory1": "Acess. 1",
  "menu.slot.accessory2": "Acess. 2",
  "menu.empty": "— vazio —",

  "shop.title": "— LOJA DO EREMITA —",
  "shop.titleFriend": "— LOJA DO EREMITA (amigo) —",
  "shop.hint": "X: comprar   Tab: sair",
  "shop.relic": "(relíquia)",
  "warp.title": "— PORTAL —",
  "warp.hint": "↑↓ selecionar   X/Z confirmar   Esc cancelar",
  "slots.load": "CARREGAR JOGO",
  "slots.save": "SALVAR JOGO",
  "slots.delete": "APAGAR SLOT",
  "slots.empty": "— vazio —",
  "slots.slot": "SLOT {n}",
  "slots.overwrite": "Sobrescrever slot {n}?  X sim   Z não",
  "slots.confirmDelete": "Apagar slot {n}?  X sim   Z não",
  "slots.hint": "↑↓ escolher   X confirmar   C apagar   Z voltar",
  "slots.lv": "Nv {n}",

  "notice.levelUp": "NÍVEL {n}!",
  "notice.maxHp": "+{n} HP máx",
  "notice.petrify": "PEDRA!",
  "notice.stoneBreak": "Livre!",

  "npc.hermit": "Eremita",
  "npc.ghost": "Cavaleiro Pálido",
  "npc.demon": "Diabrete Enjaulado",
  "npc.dracula": "Drácula",
  "npc.hero": "Andarilho da Noite",

  "relic.doubleJump": "Alma da Ventania",
  "relic.batForm": "Alma do Morcego",
  "relic.wolfForm": "Pele do Lobo",
  "relic.mistForm": "Poder da Névoa",
  "relic.waterWalk": "Estátua da Sereia",
  "relic.highJump": "Botas da Gravidade",
  "relic.batFire": "Fogo do Morcego",
  "relic.wolfDash": "Presa da Ventania",
  "relic.desc.doubleJump": "Pulo Duplo!",
  "relic.desc.batForm": "Forma de Morcego [1]!",
  "relic.desc.wolfForm": "Forma de Lobo [2]!",
  "relic.desc.mistForm": "Forma de Névoa [3]!",
  "relic.desc.waterWalk": "Andar sobre a Água!",
  "relic.desc.highJump": "Pulo Alto!",
  "relic.desc.batFire": "Bola de Fogo [X]!",
  "relic.desc.wolfDash": "Corrida Sônica!",

  "tip.1": "Explore todas as asas do castelo.",
  "tip.2": "Relíquias abrem caminhos para sempre.",
  "tip.3": "Salve nos pedestais azuis.",
  "tip.4": "Cabeças de Medusa viram pedra —",
  "tip.5": "aperte ←→ para se libertar.",
};

const TABLES: Record<Locale, Dict> = { en: EN, "pt-BR": PT };

let current: Locale = "en";

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

/** Apply locale from settings at boot (or after toggle). */
export function initLocale(locale: Locale): void {
  current = locale === "pt-BR" ? "pt-BR" : "en";
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const table = TABLES[current] ?? EN;
  let s = table[key] ?? EN[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

export function localeLabel(locale: Locale = current): string {
  return locale === "pt-BR" ? "PT-BR" : "EN";
}

export function toggleLocale(): Locale {
  current = current === "en" ? "pt-BR" : "en";
  return current;
}

export function relicName(id: string): string {
  return t(`relic.${id}`);
}

export function relicDesc(id: string): string {
  return t(`relic.desc.${id}`);
}
