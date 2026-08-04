/**
 * 16-bit gothic palette, in the style of SNES-era dark fantasy: limited ramps
 * with strong hue shifts toward violet/blue in the shadows.
 */
export const PAL = {
  // Stone (castle interior)
  stoneDark: "#1b1626",
  stoneMid: "#37304a",
  stoneLight: "#575070",
  stoneHi: "#7d7898",

  // Clock Tower bronze / verdigris ramp
  towerStoneDark: "#1a221c",
  towerStoneMid: "#3a4a3e",
  towerStoneLight: "#5a6e58",
  towerStoneHi: "#7a9070",

  // Background depths
  skyTop: "#0c0a18",
  skyBottom: "#241b3e",
  moon: "#e8e4d0",
  moonGlow: "#54487035",
  castleFar: "#171226",
  castleMid: "#221a38",
  cloudDark: "#2c2248",

  // Player (Alucard-ish: pale, black-and-gold coat)
  //
  // The ramp deliberately has no gap wider than ~0.10 in OKLab lightness:
  // coatShade .19 / boots .20 / coat .26 / pants .36 / coatMid .43 /
  // coatLight .53 / skinShade .62 / bladeEdge .66 / coatTrim .72 /
  // hairShade .73 / linen .78 / skin .81 / blade .91 / hair .91 / bladeHi 1.0.
  // A hole between .36 and .66 used to collapse every mid-tone onto `pants`,
  // which flattened the figure at sprite size (docs/ART_PIPELINE.md §5.1).
  // The mid-tones also carry chroma the stone ramp does not, so the hero
  // separates from a wall by hue and not only by brightness.
  hair: "#e8e0c8",
  hairShade: "#b0a888",
  skin: "#e0b898",
  skinShade: "#a87860",
  linen: "#c0b8a8",
  coat: "#26202f",
  coatTrim: "#c8a038",
  coatShade: "#161020",
  coatMid: "#4e4482",
  coatLight: "#6d5fa8",
  pants: "#403850",
  boots: "#181420",

  // Weapons / FX
  blade: "#d8e0f0",
  bladeHi: "#ffffff",
  bladeEdge: "#8890b8",
  slashFx: "#c0d0ff",

  // Enemies
  bone: "#d8d0b8",
  boneShade: "#989078",
  boneDark: "#585048",
  // Zombie undead ramp (green-grey flesh + rag browns) — kept separate from
  // the violet stone/coat ramps so quantised AI art stays readable.
  zombieSkin: "#6a7a58",
  zombieSkinMid: "#5a6a4a",
  zombieSkinShade: "#3a4830",
  zombieRag: "#4a4038",
  zombieRagDark: "#2a2830",
  batFur: "#483058",
  batWing: "#302040",
  batEye: "#ff4040",
  eyeRed: "#d02020",
  // Flea Man violet ramp (small jumper)
  fleaSkin: "#706088",
  fleaSkinMid: "#584068",
  fleaSkinDark: "#302038",
  fleaSkinHi: "#9080a8",
  // Merman / Fishman green scale ramp (lake enemy)
  fishScale: "#3e8a6e",
  fishScaleMid: "#2a6a58",
  fishScaleDark: "#1a4038",
  fishScaleHi: "#5aad88",
  fishBelly: "#a8d8c0",
  fishFin: "#c8a060",
  // Medusa Head (floating green head + gold snakes)
  medusaSkin: "#6a8a58",
  medusaSkinDark: "#3a5030",
  medusaSkinHi: "#a8c080",
  medusaHair: "#c8b070",
  // Armored minions (spear guard / axe knight) — steel ramp with midtones
  armor: "#686878",
  armorMid: "#505060",
  armorDark: "#383848",
  armorHi: "#a0a8b8",
  armorShade: "#282030",
  // Pale Knight (ghost NPC) — ethereal blue-steel
  ghostCloak: "#8aa0b8",
  ghostCloakMid: "#6a8098",
  ghostCloakDark: "#4a6078",
  ghostHi: "#c8d8e8",
  // Caged Imp (demon NPC)
  demonSkin: "#703848",
  demonSkinDark: "#502030",
  demonSkinHi: "#a04058",
  demonHorn: "#c02838",
  demonTunic: "#383048",
  demonTunicDark: "#282038",
  // Hermit shopkeeper robes
  hermitRobe: "#302040",
  hermitRobeMid: "#403050",
  hermitRobeDark: "#201828",
  // Bosses — Colossus bone + Wraith clockwork
  bossBone: "#d8d0b8",
  bossBoneMid: "#b0a888",
  bossBoneShade: "#989078",
  bossBoneDark: "#585048",
  bossBoneDeep: "#3a3428",
  wraithBody: "#4a6870",
  wraithBodyMid: "#3a5860",
  wraithBodyDark: "#2a4048",
  wraithGlow: "#a8d0d8",
  wraithCyan: "#68a0b0",
  wraithGear: "#c8a038",

  // Candles & pickups
  candleBrass: "#a08030",
  candleBrassHi: "#d0b060",
  flameCore: "#fff0a0",
  flameMid: "#ffa030",
  flameOut: "#e04010",
  heartPink: "#e05070",
  heartHi: "#ff90a8",
  gold: "#e8c040",
  goldHi: "#fff0a0",
  goldShade: "#907020",
  potionRed: "#c03040",
  potionGlass: "#a0c0d0",

  // UI
  uiFrame: "#8878a0",
  uiFrameDark: "#403852",
  hpRed: "#d02838",
  hpRedHi: "#f06858",
  mpBlue: "#3858c8",
  mpBlueHi: "#68a0f0",
  barBack: "#181020",
  textWhite: "#f0ecf8",
  textGold: "#e8c860",
  dmgWhite: "#ffffff",
  dmgCrit: "#ffd040",
  dmgPlayer: "#ff6060",

  spellCyan: "#60d0ff",
  spellWhite: "#e0f8ff",

  // Water (Underground Lake)
  waterDeep: "#142848",
  waterMid: "#1e4a6e",
  waterHi: "#3a7a98",
} as const;
