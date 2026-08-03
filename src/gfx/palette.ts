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

  // Background depths
  skyTop: "#0c0a18",
  skyBottom: "#241b3e",
  moon: "#e8e4d0",
  moonGlow: "#54487035",
  castleFar: "#171226",
  castleMid: "#221a38",
  cloudDark: "#2c2248",

  // Player (Alucard-ish: pale, black-and-gold coat)
  hair: "#e8e0c8",
  hairShade: "#b0a888",
  skin: "#e0b898",
  coat: "#26202f",
  coatTrim: "#c8a038",
  coatShade: "#161020",
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
  batFur: "#483058",
  batWing: "#302040",
  batEye: "#ff4040",
  eyeRed: "#d02020",

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
