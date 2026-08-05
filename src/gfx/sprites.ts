import { makeSurface } from "../engine/renderer";
import { PAL } from "./palette";

export type Frame = HTMLCanvasElement;

/** Draw an ASCII pixel map onto a fresh canvas. Legend maps char -> color. */
function pixelMap(rows: string[], legend: Record<string, string>): Frame {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, ctx] = makeSurface(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = legend[row[x]];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

function flipped(f: Frame): Frame {
  const [c, ctx] = makeSurface(f.width, f.height);
  ctx.translate(f.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(f, 0, 0);
  return c;
}

export interface SpriteSet {
  right: Frame[];
  left: Frame[];
}

function makeSet(frames: Frame[]): SpriteSet {
  return { right: frames, left: frames.map(flipped) };
}

/* ------------------------------------------------------------------ */
/* Player: part-based composition on a 40x36 canvas. The hero faces    */
/* right; feet rest at y=35. Poses vary legs/arm/sword/body offset.    */
/* ------------------------------------------------------------------ */

interface Pose {
  bodyY: number; // vertical bob
  legs: "stand" | "walkA" | "walkB" | "walkC" | "air" | "crouch" | "dash" | "kneel";
  arm: "rest" | "windup" | "slash" | "follow" | "up" | "back";
  lean: number; // torso x offset
  crouched?: boolean;
}

export const PLAYER_W = 40;
export const PLAYER_H = 36;

function drawPlayerPose(p: Pose): Frame {
  const [c, ctx] = makeSurface(PLAYER_W, PLAYER_H);
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  // Anchor: character occupies roughly x 12..28, feet at y=35.
  const bx = 16 + p.lean;
  const by = (p.crouched ? 8 : 0) + p.bodyY;

  // --- legs ---
  const legCol = PAL.pants;
  const bootCol = PAL.boots;
  switch (p.legs) {
    case "stand":
      px(bx + 1, 24 + by, 3, 8, legCol);
      px(bx + 6, 24 + by, 3, 8, legCol);
      px(bx + 0, 32 + by, 4, 4, bootCol);
      px(bx + 6, 32 + by, 4, 4, bootCol);
      break;
    case "walkA":
      px(bx - 1, 24 + by, 3, 8, legCol);
      px(bx + 7, 24 + by, 3, 7, legCol);
      px(bx - 3, 32 + by, 4, 4, bootCol);
      px(bx + 8, 31 + by, 4, 4, bootCol);
      break;
    case "walkB":
      px(bx + 2, 24 + by, 3, 8, legCol);
      px(bx + 5, 24 + by, 3, 8, legCol);
      px(bx + 1, 32 + by, 4, 4, bootCol);
      px(bx + 5, 32 + by, 4, 4, bootCol);
      break;
    case "walkC":
      px(bx + 6, 24 + by, 3, 8, legCol);
      px(bx - 1, 24 + by, 3, 7, legCol);
      px(bx + 7, 32 + by, 4, 4, bootCol);
      px(bx - 3, 31 + by, 4, 4, bootCol);
      break;
    case "air":
      px(bx + 0, 24 + by, 3, 6, legCol);
      px(bx + 6, 23 + by, 3, 8, legCol);
      px(bx - 2, 29 + by, 4, 4, bootCol);
      px(bx + 7, 30 + by, 4, 4, bootCol);
      break;
    case "crouch":
      px(bx + 0, 26 + by, 4, 6, legCol);
      px(bx + 6, 26 + by, 4, 6, legCol);
      px(bx - 1, 31 + by, 4, 4, bootCol);
      px(bx + 7, 31 + by, 4, 4, bootCol);
      break;
    case "dash":
      px(bx + 3, 25 + by, 3, 7, legCol);
      px(bx + 9, 24 + by, 4, 6, legCol);
      px(bx + 1, 31 + by, 4, 4, bootCol);
      px(bx + 11, 29 + by, 4, 4, bootCol);
      break;
    case "kneel":
      px(bx + 0, 27 + by, 8, 5, legCol);
      px(bx - 1, 31 + by, 4, 4, bootCol);
      px(bx + 7, 31 + by, 4, 4, bootCol);
      break;
  }

  // --- coat / torso ---
  px(bx - 1, 12 + by, 12, 13, PAL.coat);
  px(bx - 1, 12 + by, 12, 2, PAL.coatTrim); // collar trim
  px(bx - 1, 22 + by, 12, 2, PAL.coatShade);
  px(bx - 2, 14 + by, 2, 9, PAL.coatShade); // cape hint behind
  px(bx + 9, 13 + by, 2, 10, PAL.coatShade);

  // --- head ---
  px(bx + 1, 3 + by, 8, 7, PAL.skin); // face
  px(bx + 0, 1 + by, 10, 4, PAL.hair); // hair top
  px(bx - 1, 3 + by, 3, 9, PAL.hair); // long hair back
  px(bx - 1, 9 + by, 3, 4, PAL.hairShade);
  px(bx + 7, 5 + by, 1, 1, PAL.eyeRed); // eye
  px(bx + 1, 8 + by, 7, 2, PAL.skin);

  // --- arm + sword ---
  const sword = (x: number, y: number, horiz: boolean, len: number) => {
    if (horiz) {
      px(x, y, len, 2, PAL.blade);
      px(x, y, len, 1, PAL.bladeHi);
      px(x - 2, y - 1, 2, 4, PAL.coatTrim); // guard
    } else {
      px(x, y - len, 2, len, PAL.blade);
      px(x, y - len, 1, len, PAL.bladeHi);
      px(x - 1, y - 1, 4, 2, PAL.coatTrim);
    }
  };
  switch (p.arm) {
    case "rest":
      px(bx + 7, 14 + by, 3, 8, PAL.coat);
      px(bx + 8, 21 + by, 2, 2, PAL.skin);
      sword(bx + 10, 22 + by, false, 12);
      break;
    case "windup":
      px(bx + 4, 12 + by, 3, 5, PAL.coat);
      px(bx + 3, 10 + by, 2, 3, PAL.skin);
      sword(bx + 3, 10 + by, false, 14);
      break;
    case "slash":
      px(bx + 9, 15 + by, 6, 3, PAL.coat);
      px(bx + 14, 15 + by, 2, 3, PAL.skin);
      sword(bx + 17, 15 + by, true, 16);
      break;
    case "follow":
      px(bx + 8, 18 + by, 5, 3, PAL.coat);
      px(bx + 12, 19 + by, 2, 2, PAL.skin);
      sword(bx + 14, 21 + by, true, 13);
      break;
    case "up":
      px(bx + 6, 8 + by, 3, 6, PAL.coat);
      px(bx + 6, 6 + by, 2, 3, PAL.skin);
      sword(bx + 6, 6 + by, false, 15);
      break;
    case "back":
      px(bx - 2, 15 + by, 4, 3, PAL.coat);
      px(bx - 3, 16 + by, 2, 2, PAL.skin);
      break;
  }
  return c;
}

export interface PlayerSprites {
  idle: SpriteSet;
  walk: SpriteSet;
  jump: SpriteSet;
  fall: SpriteSet;
  attack: SpriteSet; // [windup, slash, follow]
  attackUp: SpriteSet;
  crouch: SpriteSet;
  crouchAttack: SpriteSet;
  backdash: SpriteSet;
  hurt: SpriteSet;
  die: SpriteSet;
}

export function buildPlayerSprites(): PlayerSprites {
  const pose = (p: Partial<Pose>): Frame =>
    drawPlayerPose({ bodyY: 0, legs: "stand", arm: "rest", lean: 0, ...p });
  return {
    idle: makeSet([pose({}), pose({ bodyY: 1 })]),
    walk: makeSet([
      pose({ legs: "walkA", lean: 1 }),
      pose({ legs: "walkB", lean: 1, bodyY: 1 }),
      pose({ legs: "walkC", lean: 1 }),
      pose({ legs: "walkB", lean: 1, bodyY: 1 }),
    ]),
    jump: makeSet([pose({ legs: "air", bodyY: -1 })]),
    fall: makeSet([pose({ legs: "air", bodyY: 1 })]),
    attack: makeSet([
      pose({ arm: "windup", lean: -1 }),
      pose({ arm: "slash", lean: 2 }),
      pose({ arm: "follow", lean: 1 }),
    ]),
    attackUp: makeSet([pose({ arm: "windup" }), pose({ arm: "up" }), pose({ arm: "up" })]),
    crouch: makeSet([pose({ legs: "crouch", crouched: true })]),
    crouchAttack: makeSet([
      pose({ legs: "crouch", crouched: true, arm: "windup" }),
      pose({ legs: "crouch", crouched: true, arm: "slash" }),
      pose({ legs: "crouch", crouched: true, arm: "follow" }),
    ]),
    backdash: makeSet([pose({ legs: "dash", arm: "back", lean: -2 })]),
    hurt: makeSet([pose({ legs: "air", arm: "back", lean: -2, bodyY: 1 })]),
    die: makeSet([pose({ legs: "kneel", arm: "back", bodyY: 2 })]),
  };
}

/* ------------------------------------------------------------------ */
/* Enemies, candles, pickups: ASCII pixel maps                         */
/* ------------------------------------------------------------------ */

const SKEL = {
  b: PAL.bone,
  s: PAL.boneShade,
  d: PAL.boneDark,
  r: PAL.eyeRed,
};

export function buildSkeletonSprites(): SpriteSet {
  // 16×32 — same ballpark as the player figure (~32px tall).
  const walkA = pixelMap(
    [
      "    bbbb    ",
      "   bbbbbb   ",
      "   bsbrbb   ",
      "   bbbbbb   ",
      "    bssb    ",
      "     bb     ",
      "   bbbbbb   ",
      "  sbbbbbbs  ",
      "  s bbbb s  ",
      "  s bssb s  ",
      "  d bbbb d  ",
      "    bssb    ",
      "    bbbb    ",
      "    bssb    ",
      "    bbbb    ",
      "    bssb    ",
      "     ss     ",
      "    b  b    ",
      "    b  b    ",
      "    b  b    ",
      "    b  b    ",
      "   sb  bs   ",
      "   b    b   ",
      "   b    b   ",
      "   b    b   ",
      "  db    bd  ",
      "  b      b  ",
      " bb      bb ",
      "bb        bb",
      " b        b ",
      "bb        bb",
      "bb        bb",
    ],
    SKEL,
  );
  const walkB = pixelMap(
    [
      "    bbbb    ",
      "   bbbbbb   ",
      "   bsbrbb   ",
      "   bbbbbb   ",
      "    bssb    ",
      "     bb     ",
      "   bbbbbb   ",
      "  sbbbbbbs  ",
      "  s bbbb s  ",
      "  s bssb s  ",
      "  d bbbb d  ",
      "    bssb    ",
      "    bbbb    ",
      "    bssb    ",
      "    bbbb    ",
      "    bssb    ",
      "     ss     ",
      "    b b     ",
      "    b b     ",
      "    b  b    ",
      "    b  b    ",
      "    b  s    ",
      "   sb   b   ",
      "   b    b   ",
      "  bb    b   ",
      "  b     bb  ",
      " bb      b  ",
      "bb       bb ",
      "b         b ",
      "bb       bb ",
      " b       bb ",
      "bb        b ",
    ],
    SKEL,
  );
  return makeSet([walkA, walkB]);
}

const BAT = {
  f: PAL.batFur,
  w: PAL.batWing,
  r: PAL.batEye,
  d: PAL.stoneDark,
};

export function buildBatSprites(): SpriteSet {
  const up = pixelMap(
    [
      "ww          ww",
      "www        www",
      "wwww  ff  wwww",
      " wwwwffffwwww ",
      "  wwwfrffwww  ",
      "     ffff     ",
      "      ff      ",
    ],
    BAT,
  );
  const down = pixelMap(
    [
      "      ff      ",
      "  ww ffff ww  ",
      " wwwwfrffwwww ",
      "wwwwwffffwwwww",
      "www   ff   www",
      "w     ff     w",
    ],
    BAT,
  );
  return makeSet([up, down]);
}

const FISH = {
  g: PAL.fishScaleMid,
  m: PAL.fishScale,
  d: PAL.fishScaleDark,
  s: PAL.fishBelly,
  r: PAL.eyeRed,
  f: PAL.fishFin,
};

/** Classic merman: green body, fins, facing right (~16x24). */
export function buildMedusaHeadSprites(): SpriteSet {
  const M = {
    g: "#6a8a58",
    d: "#3a5030",
    s: PAL.skin,
    r: PAL.eyeRed,
    h: "#c8b070",
  };
  const a = pixelMap(
    [
      "   hhhhhh   ",
      "  hggggggh  ",
      " hgssrrssgh ",
      "  gssssssg  ",
      "   gggggg   ",
      "    d  d    ",
    ],
    M,
  );
  const b = pixelMap(
    [
      "  h hhhh h  ",
      "  hggggggh  ",
      " hgssrrssgh ",
      "  gssssssg  ",
      "   gggggg   ",
      "   d    d   ",
    ],
    M,
  );
  return makeSet([a, b]);
}

const AXE_ARMOR = {
  a: PAL.armor,
  m: PAL.armorMid,
  s: PAL.skin,
  r: PAL.eyeRed,
  g: PAL.gold,
  d: PAL.armorDark,
};

export function buildAxeKnightSprites(): SpriteSet {
  const A = AXE_ARMOR;
  // 16×32 armored walker (procedural has no held axe — AI override adds one)
  const walkA = pixelMap(
    [
      "    aaaa    ",
      "   aaaaaa   ",
      "   asrrsa   ",
      "   aaaaaa   ",
      "    aaaa    ",
      "  aaaaaaaa  ",
      " aaaaaaaaaa ",
      " aa aaaa aa ",
      " g  aaaa  g ",
      " g  aaaa  g ",
      "    aaaa    ",
      "    aaaa    ",
      "    aaaa    ",
      "    aaaa    ",
      "   aaaaaa   ",
      "   aa  aa   ",
      "   aa  aa   ",
      "   aa  aa   ",
      "   aa  aa   ",
      "  mm    mm  ",
      "  mm    mm  ",
      "  mm    mm  ",
      " dd      dd ",
      "dd        dd",
      " d        d ",
      "dd        dd",
      " d        d ",
      "dd        dd",
      "dd        dd",
      " d        d ",
      "dd        dd",
      " d        d ",
    ],
    A,
  );
  const walkB = pixelMap(
    [
      "    aaaa    ",
      "   aaaaaa   ",
      "   asrrsa   ",
      "   aaaaaa   ",
      "    aaaa    ",
      "  aaaaaaaa  ",
      " aaaaaaaaaa ",
      " aa aaaa aa ",
      " g  aaaa  g ",
      " g  aaaa  g ",
      "    aaaa    ",
      "    aaaa    ",
      "    aaaa    ",
      "    aaaa    ",
      "   aaaaaa   ",
      "    aa aa   ",
      "    aa  aa  ",
      "   aa   aa  ",
      "   aa   aa  ",
      "  mm    mm  ",
      "  mm    mm  ",
      "  mm    mm  ",
      " dd      dd ",
      " d       dd ",
      "dd        d ",
      " d       dd ",
      "dd        d ",
      "dd       dd ",
      " d        d ",
      "dd       dd ",
      " d        d ",
      "dd        d ",
    ],
    A,
  );
  return makeSet([walkA, walkB]);
}

/** Same armor walker with empty hands (used while the thrown axe is out). */
export function buildAxeKnightEmptySprites(): SpriteSet {
  // Procedural walk already has empty hands — reuse as empty-set fallback.
  return buildAxeKnightSprites();
}

export function buildWraithSprites(): SpriteSet {
  const W = {
    c: PAL.wraithBody,
    d: PAL.wraithBodyDark,
    h: PAL.wraithGlow,
    r: PAL.eyeRed,
    g: PAL.wraithGear,
    s: PAL.wraithCyan,
  };
  // 16×34 ethereal humanoid (slightly taller than player)
  const a = pixelMap(
    [
      "     hhhh     ",
      "    hhhhhh    ",
      "    hrrrrh    ",
      "    hhhhhh    ",
      "     ssss     ",
      "   cccccccc   ",
      "  cccccccccc  ",
      "  cc gggg cc  ",
      "  cc  cccc cc ",
      "  c   cccc  c ",
      "      cccc    ",
      "      cccc    ",
      "      cccc    ",
      "      cccc    ",
      "     cccccc   ",
      "     cc  cc   ",
      "     cc  cc   ",
      "    cc    cc  ",
      "    cc    cc  ",
      "    cc    cc  ",
      "   cc      cc ",
      "   dd      dd ",
      "  d          d",
      " d            ",
      "d              ",
      " d            ",
      "  d          d",
      "   d        d ",
      "  d          d",
      " d            ",
      "d              ",
      " d            ",
      "  dd        dd",
      "   d        d ",
    ],
    W,
  );
  const b = pixelMap(
    [
      "     hhhh     ",
      "    hhhhhh    ",
      "    hrrrrh    ",
      "    hhhhhh    ",
      "     ssss     ",
      "   cccccccc   ",
      "  cccccccccc  ",
      "  cc gggg cc  ",
      " cc   cccc  cc",
      "  c   cccc  c ",
      "      cccc    ",
      "      cccc    ",
      "      cccc    ",
      "      cccc    ",
      "     cccccc   ",
      "     c c  c   ",
      "    cc    cc  ",
      "    cc    cc  ",
      "   cc      cc ",
      "   cc      cc ",
      "  cc        cc",
      "  d          d",
      " d            ",
      "d              ",
      " d            ",
      "  d          d",
      "   d        d ",
      "  d          d",
      " d            ",
      "d              ",
      " d            ",
      "  d          d",
      "   dd      dd ",
      "    d      d  ",
    ],
    W,
  );
  return makeSet([a, b]);
}

export function buildFishmanSprites(): SpriteSet {
  // 14×32 classic merman
  const walkA = pixelMap(
    [
      "   mmmm   ",
      "  mmmmmm  ",
      "  msrrmm  ",
      "  mmmmmm  ",
      "   mssm   ",
      "  gggggg  ",
      " gggggggg ",
      " f gggg f ",
      " f gggg f ",
      "  gggggg  ",
      "  gggggg  ",
      "  gggggg  ",
      "  gggggg  ",
      "  gg  gg  ",
      "  gg  gg  ",
      "  g    g  ",
      "  g    g  ",
      "  g    g  ",
      "  g    g  ",
      " ff    ff ",
      " ff    ff ",
      "fff    fff",
      "ff      ff",
      " f      f ",
      "ff      ff",
      " f      f ",
      "ff      ff",
      "fff    fff",
      " ff    ff ",
      "  f    f  ",
      " ff    ff ",
      "  f    f  ",
    ],
    FISH,
  );
  const walkB = pixelMap(
    [
      "   mmmm   ",
      "  mmmmmm  ",
      "  msrrmm  ",
      "  mmmmmm  ",
      "   mssm   ",
      "  gggggg  ",
      " gggggggg ",
      " f gggg f ",
      " f gggg f ",
      "  gggggg  ",
      "  gggggg  ",
      "  gggggg  ",
      "  gggggg  ",
      "  gg gg   ",
      "  g  gg   ",
      "  g   g   ",
      "  g   g   ",
      "  g   g   ",
      "  g   g   ",
      " ff   ff  ",
      " ff   ff  ",
      "fff   fff ",
      "ff     ff ",
      " f     ff ",
      "ff      f ",
      " f     ff ",
      "ff      f ",
      "fff    ff ",
      " ff    f  ",
      "  f   ff  ",
      " ff    f  ",
      "  f   ff  ",
    ],
    FISH,
  );
  return makeSet([walkA, walkB]);
}

const CANDLE = {
  o: PAL.flameOut,
  m: PAL.flameMid,
  c: PAL.flameCore,
  b: PAL.candleBrass,
  h: PAL.candleBrassHi,
  w: PAL.bone,
};

export function buildCandleSprites(): { lit: Frame[]; broken: Frame } {
  const lit1 = pixelMap(
    [
      "   c  ",
      "  cm  ",
      "  mmo ",
      "  cmo ",
      "   m  ",
      "  ww  ",
      "  ww  ",
      " hbbh ",
      "  bb  ",
      "  bb  ",
      " hbbh ",
      "bbbbbb",
    ],
    CANDLE,
  );
  const lit2 = pixelMap(
    [
      "  c   ",
      "  mc  ",
      " omm  ",
      " omc  ",
      "  m   ",
      "  ww  ",
      "  ww  ",
      " hbbh ",
      "  bb  ",
      "  bb  ",
      " hbbh ",
      "bbbbbb",
    ],
    CANDLE,
  );
  const broken = pixelMap(
    [
      "      ",
      "      ",
      "      ",
      "      ",
      "      ",
      "      ",
      "      ",
      "      ",
      "  b   ",
      "   b  ",
      " hb h ",
      "bbbbbb",
    ],
    CANDLE,
  );
  return { lit: [lit1, lit2], broken };
}

const PICKUP = {
  p: PAL.heartPink,
  i: PAL.heartHi,
  g: PAL.gold,
  y: PAL.goldHi,
  s: PAL.goldShade,
  r: PAL.potionRed,
  l: PAL.potionGlass,
};

export function buildPickupSprites(): { heart: Frame; bigHeart: Frame; gold: Frame; potion: Frame } {
  const heart = pixelMap(
    [
      " ii pp ",
      "iippppp",
      "ippppp ",
      " ppppp ",
      "  ppp  ",
      "   p   ",
    ],
    PICKUP,
  );
  const bigHeart = pixelMap(
    [
      "  iii  ppp  ",
      " iiipppppppp",
      "iiippppppppp",
      "ippppppppppp",
      " pppppppppp ",
      "  pppppppp  ",
      "   pppppp   ",
      "    pppp    ",
      "     pp     ",
    ],
    PICKUP,
  );
  const gold = pixelMap(
    [
      " ggg ",
      "gyygs",
      "gyggs",
      "gggss",
      " sss ",
    ],
    PICKUP,
  );
  const potion = pixelMap(
    [
      "  ll  ",
      "  ll  ",
      " lrrl ",
      "lrrrrl",
      "lrrrrl",
      " llll ",
    ],
    PICKUP,
  );
  return { heart, bigHeart, gold, potion };
}

const SUBW = {
  b: PAL.blade,
  h: PAL.bladeHi,
  e: PAL.bladeEdge,
  w: PAL.candleBrass,
};

/* ------------------- transformation forms & NPCs ------------------- */

/**
 * Player bat/wolf — part-based (same technique as the human hero) so silhouettes
 * stay clean. Distinct from enemy fodder bats.
 *
 * Bat canvas 40×22, feet-ish at bottom. Wolf canvas 40×20, paws on bottom row.
 */

const BAT_WING = "#503868";
const BAT_WING_D = "#281430";
const BAT_WING_H = "#785898";
const BAT_BODY = PAL.coat;
const BAT_BODY_D = PAL.coatShade;
const BAT_BELLY = "#3a3450";

/**
 * Scalloped membrane wing. `side` +1 = right, -1 = left.
 * phase 0 raised / 1 open / 2 down.
 */
function drawBatWing(
  px: (x: number, y: number, w: number, h: number, col: string) => void,
  ox: number,
  oy: number,
  side: 1 | -1,
  phase: 0 | 1 | 2,
): void {
  const s = side;
  // Leading edge height and outer span per phase
  const top = phase === 0 ? oy - 5 : phase === 1 ? oy - 2 : oy + 1;
  const span = phase === 0 ? 11 : phase === 1 ? 15 : 13;
  const bottom = phase === 0 ? oy + 3 : phase === 1 ? oy + 8 : oy + 12;

  // Soft membrane fill (horizontal bands that taper)
  const bands = bottom - top;
  for (let i = 0; i < bands; i++) {
    const t = i / Math.max(1, bands - 1);
    const y = top + i;
    // Taper: widest mid-open, shorter near tip row
    const widen = phase === 0 ? 0.55 + t * 0.35 : phase === 1 ? 0.7 + t * 0.3 : 0.5 + t * 0.45;
    const w = Math.max(3, Math.round(span * widen) - Math.floor(t * 2));
    const x = s > 0 ? ox : ox - w;
    const col = i < 2 ? BAT_WING_H : i > bands - 3 ? BAT_WING_D : BAT_WING;
    px(x, y, w, 1, col);
  }

  // Finger bones radiating from shoulder
  const fingers = phase === 0 ? 3 : 4;
  for (let f = 0; f < fingers; f++) {
    const ft = f / (fingers - 1);
    const endX = s > 0 ? ox + Math.round(span * (0.55 + ft * 0.45)) : ox - Math.round(span * (0.55 + ft * 0.45));
    const endY = top + Math.round((bottom - top) * (0.25 + ft * 0.7));
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = Math.round(ox + (endX - ox) * u);
      const y = Math.round(oy + (endY - oy) * u);
      px(x, y, 1, 1, BAT_WING_D);
    }
  }
  // Wing tip claw
  const tipX = s > 0 ? ox + span : ox - span - 1;
  px(tipX, top + 1, 2, 2, BAT_WING_H);
  px(tipX + (s > 0 ? 1 : 0), top, 1, 1, PAL.coatTrim);
}

function drawPlayerBatFrame(phase: 0 | 1 | 2): Frame {
  const W = 42;
  const H = 24;
  const [c, ctx] = makeSurface(W, H);
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  const cx = 17;
  const cy = 9 + (phase === 2 ? 1 : phase === 0 ? -1 : 0);

  // Wings behind body
  drawBatWing(px, cx + 1, cy + 3, -1, phase);
  drawBatWing(px, cx + 7, cy + 3, 1, phase);

  // Torso (compact humanoid-bat)
  px(cx + 1, cy + 2, 8, 9, BAT_BODY);
  px(cx + 2, cy + 4, 6, 5, BAT_BELLY);
  px(cx + 1, cy + 10, 8, 2, BAT_BODY_D);
  // Gold collar band
  px(cx + 1, cy + 2, 8, 2, PAL.coatTrim);
  px(cx + 2, cy + 2, 6, 1, PAL.goldHi);
  // Shoulder pads
  px(cx, cy + 3, 2, 3, BAT_BODY_D);
  px(cx + 8, cy + 3, 2, 3, BAT_BODY_D);

  // Legs tucked under
  px(cx + 2, cy + 11, 2, 3, BAT_BODY_D);
  px(cx + 6, cy + 11, 2, 3, BAT_BODY_D);
  px(cx + 2, cy + 13, 2, 1, PAL.boots);
  px(cx + 6, cy + 13, 2, 1, PAL.boots);

  // Head
  px(cx + 2, cy - 3, 7, 6, BAT_BODY);
  px(cx + 3, cy - 2, 5, 4, "#403850");
  // Blonde hair (Alucard tell) — longer back locks
  px(cx + 2, cy - 5, 6, 3, PAL.hair);
  px(cx + 1, cy - 4, 2, 4, PAL.hair);
  px(cx + 1, cy - 1, 2, 2, PAL.hairShade);
  px(cx + 6, cy - 5, 2, 2, PAL.hairShade);
  // Pointed ears
  px(cx + 1, cy - 5, 2, 4, BAT_BODY_D);
  px(cx + 8, cy - 5, 2, 4, BAT_BODY_D);
  px(cx + 1, cy - 7, 1, 3, BAT_WING_H);
  px(cx + 9, cy - 7, 1, 3, BAT_WING_H);
  // Face
  px(cx + 4, cy - 1, 1, 1, "#ff6060");
  px(cx + 6, cy - 1, 1, 1, PAL.eyeRed);
  px(cx + 4, cy + 1, 3, 1, "#e8d0b0");
  // Fangs
  px(cx + 4, cy + 2, 1, 2, PAL.textWhite);
  px(cx + 6, cy + 2, 1, 2, PAL.textWhite);

  // Short cape tip
  px(cx + 3, cy + 12, 4, 2, BAT_BODY_D);
  px(cx + 2, cy + 14, 6, 1, BAT_WING_D);

  return c;
}

/** Large Alucard-style bat — 3-frame wing flap, not the enemy bat. */
export function buildPlayerBatSprites(): SpriteSet {
  return makeSet([drawPlayerBatFrame(0), drawPlayerBatFrame(1), drawPlayerBatFrame(2)]);
}

const WOLF_FUR = "#403850";
const WOLF_FUR_D = "#201828";
const WOLF_FUR_L = "#686078";
const WOLF_BELLY = "#504868";
const WOLF_MUZZLE = "#d0c4a8";

type WolfLeg = { footX: number; raised: number };

type WolfPose = {
  bob: number;
  headDip: number;
  tailTipY: number;
  /** Side-view: one hind + one fore leg (classic 16-bit silhouette). */
  hind: WolfLeg;
  fore: WolfLeg;
  /** Ghost far-side legs (darker, offset) for volume. */
  hindFar: WolfLeg;
  foreFar: WolfLeg;
};

function drawPlayerWolfFrame(pose: WolfPose): Frame {
  const W = 40;
  const H = 18;
  const [c, ctx] = makeSurface(W, H);
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, w), Math.max(1, h));
  };

  const ground = H - 1;
  const by = 3 + pose.bob;

  // Far-side legs first (darker, behind body)
  const farLeg = (hipX: number, footX: number, raised: number, dark: boolean) => {
    const footY = ground - raised;
    const col = dark ? "#16101c" : WOLF_FUR_D;
    const midY = by + 9 - Math.floor(raised / 2);
    px(hipX, by + 7, 2, 3, col);
    px(Math.round((hipX + footX) / 2), midY, 2, 3, col);
    px(footX, footY - 2, 2, 2, col);
    px(footX - 1, footY, 3, 1, col);
  };
  farLeg(10, 10 + pose.hindFar.footX, pose.hindFar.raised, true);
  farLeg(20, 20 + pose.foreFar.footX, pose.foreFar.raised, true);

  // --- Tail ---
  const ty = by + 5 + pose.tailTipY;
  px(1, ty + 1, 2, 2, WOLF_FUR_L);
  px(3, ty, 3, 3, WOLF_FUR);
  px(5, ty, 3, 3, WOLF_FUR_D);
  px(6, by + 4, 2, 2, WOLF_FUR_D);

  // --- Body mass (clean sausage + chest) ---
  px(7, by + 3, 16, 7, WOLF_FUR);
  px(8, by + 4, 14, 5, WOLF_FUR_L);
  px(9, by + 6, 12, 3, WOLF_BELLY);
  px(7, by + 9, 16, 1, WOLF_FUR_D);
  // shoulder hump
  px(18, by + 2, 6, 3, WOLF_FUR);
  px(19, by + 2, 4, 1, WOLF_FUR_L);
  // pale chest blaze
  px(17, by + 5, 3, 3, "#b8b090");
  // gold collar
  px(21, by + 3, 4, 4, PAL.coatTrim);
  px(22, by + 3, 2, 1, PAL.goldHi);
  px(21, by + 6, 4, 1, "#a08028");

  // --- Neck + head ---
  const hy = by + 1 + pose.headDip;
  px(23, hy + 2, 4, 5, WOLF_FUR);
  px(24, hy + 3, 3, 3, WOLF_FUR_L);
  // skull
  px(26, hy, 7, 6, WOLF_FUR);
  px(27, hy + 1, 5, 4, WOLF_FUR_L);
  // ear
  px(27, hy - 3, 3, 4, WOLF_FUR);
  px(28, hy - 2, 1, 2, WOLF_MUZZLE);
  px(27, hy - 4, 2, 2, WOLF_FUR_D);
  // snout + nose
  px(31, hy + 2, 5, 3, WOLF_FUR);
  px(32, hy + 3, 4, 2, WOLF_MUZZLE);
  px(35, hy + 3, 2, 2, WOLF_FUR_D);
  px(36, hy + 3, 1, 1, "#08060c");
  // eye + brow
  px(29, hy + 2, 2, 1, "#1a1018");
  px(29, hy + 2, 1, 1, "#ff4040");
  px(30, hy + 2, 1, 1, PAL.eyeRed);
  // mouth + fang
  px(32, hy + 5, 3, 1, WOLF_FUR_D);
  px(33, hy + 5, 1, 1, PAL.textWhite);

  // Near-side legs (readable)
  const nearLeg = (hipX: number, footX: number, raised: number) => {
    const footY = ground - raised;
    const midX = Math.round((hipX + footX) / 2);
    const midY = by + 9 - Math.floor(raised * 0.4);
    // upper thigh
    px(hipX, by + 7, 3, 3, WOLF_FUR_D);
    px(hipX, by + 8, 3, 2, WOLF_FUR);
    // shin
    px(midX, midY, 2, 3, WOLF_FUR);
    px(midX, midY + 1, 2, 2, WOLF_FUR_D);
    // paw
    px(footX - 1, footY - 1, 4, 2, WOLF_FUR_D);
    px(footX, footY, 3, 1, "#0a0810");
    // claw ticks
    px(footX, footY, 1, 1, "#2a2438");
    px(footX + 2, footY, 1, 1, "#2a2438");
  };
  nearLeg(9, 9 + pose.hind.footX, pose.hind.raised);
  nearLeg(19, 19 + pose.fore.footX, pose.fore.raised);

  // Spine highlight
  px(9, by + 3, 12, 1, WOLF_FUR_L);

  return c;
}

/** Detailed wolf form — idle + 3-step run cycle. */
export function buildPlayerWolfSprites(): SpriteSet {
  const idle: WolfPose = {
    bob: 0,
    headDip: 0,
    tailTipY: 1,
    hind: { footX: 0, raised: 0 },
    fore: { footX: 0, raised: 0 },
    hindFar: { footX: 2, raised: 0 },
    foreFar: { footX: -2, raised: 0 },
  };
  const runA: WolfPose = {
    bob: -1,
    headDip: 0,
    tailTipY: 0,
    hind: { footX: -4, raised: 0 },
    fore: { footX: 4, raised: 1 },
    hindFar: { footX: 2, raised: 2 },
    foreFar: { footX: -3, raised: 0 },
  };
  const runB: WolfPose = {
    bob: -2,
    headDip: -1,
    tailTipY: -1,
    hind: { footX: 1, raised: 3 },
    fore: { footX: -1, raised: 3 },
    hindFar: { footX: -2, raised: 2 },
    foreFar: { footX: 2, raised: 2 },
  };
  const runC: WolfPose = {
    bob: -1,
    headDip: 0,
    tailTipY: 0,
    hind: { footX: 4, raised: 1 },
    fore: { footX: -4, raised: 0 },
    hindFar: { footX: -3, raised: 0 },
    foreFar: { footX: 2, raised: 2 },
  };
  return makeSet([
    drawPlayerWolfFrame(idle),
    drawPlayerWolfFrame(runA),
    drawPlayerWolfFrame(runB),
    drawPlayerWolfFrame(runC),
  ]);
}

/* ------------------- new enemies (zombie / guard / flea) ------------------- */

export function buildZombieSprites(): SpriteSet {
  const Z = {
    s: "#6a7a58",
    d: "#3a4830",
    r: PAL.eyeRed,
    t: "#4a4038",
    p: "#2a2830",
  };
  const a = pixelMap(
    [
      "   ssss   ",
      "  ssssss  ",
      "  srrss   ",
      "  sssss   ",
      "   sss    ",
      "  tttttt  ",
      " tttttttt ",
      " t tttt t ",
      " t tttt t ",
      "  tttttt  ",
      "  tttttt  ",
      "  tt  tt  ",
      "  tt  tt  ",
      "  tt  tt  ",
      "  tt  tt  ",
      "  pp  pp  ",
      "  pp  pp  ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
      "          ",
    ],
    Z,
  );
  // Trim to 32 height by only using first 32 - the map is padded; actually use shorter
  const walkB = pixelMap(
    [
      "   ssss   ",
      "  ssssss  ",
      "  srrss   ",
      "  sssss   ",
      "   sss    ",
      "  tttttt  ",
      " tttttttt ",
      "tt tttt t ",
      " t tttt t ",
      "  tttttt  ",
      "  tttttt  ",
      "  tt tt   ",
      "  tt  tt  ",
      "  tt  tt  ",
      " tt    tt ",
      " pp    pp ",
      " pp    pp ",
    ],
    Z,
  );
  const walkA = pixelMap(
    [
      "   ssss   ",
      "  ssssss  ",
      "  srrss   ",
      "  sssss   ",
      "   sss    ",
      "  tttttt  ",
      " tttttttt ",
      " t tttt t ",
      " t tttt t ",
      "  tttttt  ",
      "  tttttt  ",
      "  tt  tt  ",
      "  tt  tt  ",
      "  tt  tt  ",
      "  tt  tt  ",
      "  pp  pp  ",
      "  pp  pp  ",
    ],
    Z,
  );
  void a;
  return makeSet([walkA, walkB]);
}

export function buildSpearGuardSprites(): SpriteSet {
  const G = {
    a: "#686878",
    d: "#383848",
    s: PAL.skin,
    r: PAL.eyeRed,
    p: "#282030",
    g: PAL.coatTrim,
    b: PAL.blade,
  };
  // walk + lunge (spear extended)
  const walk = pixelMap(
    [
      "    aaaa    ",
      "   aaaaaa   ",
      "   asrrsa   ",
      "   aaaaaa   ",
      "    aaaa    ",
      "  aaaaaaaa  ",
      " aaaaaaaaaa ",
      " aa gggg aa ",
      " aa aaaa aa ",
      "  aaaaaaaa  ",
      "  aaaaaaaa  ",
      "  aa    aa  ",
      "  aa    aa  ",
      "  aa    aa  ",
      "  aa    aa  ",
      "  pp    pp  ",
      "b           ",
      "b           ",
      "b           ",
      "bb          ",
    ],
    G,
  );
  const lunge = pixelMap(
    [
      "    aaaa    ",
      "   aaaaaa   ",
      "   asrrsa   ",
      "   aaaaaa   ",
      "    aaaa    ",
      "  aaaaaaaa  ",
      " aaaaaaaaaa ",
      " aa gggg aa ",
      " aa aaaa aa ",
      "  aaaaaaaa  ",
      "  aaaaaaaa  ",
      "  aa    aa  ",
      "  aa    aa  ",
      "  aa    aa  ",
      "  aa    aa  ",
      "  pp    pp  ",
      "          bb",
      "         bbb",
      "bbbbbbbbbbb ",
      "         bb ",
    ],
    G,
  );
  return makeSet([walk, lunge]);
}

export function buildFleaManSprites(): SpriteSet {
  const F = {
    f: "#584068",
    d: "#302038",
    r: PAL.eyeRed,
    l: "#706088",
  };
  const ground = pixelMap(
    [
      "  ffff  ",
      " frrff  ",
      " fffff  ",
      "ffffffff",
      "ff ff ff",
      " f    f ",
      "ff    ff",
      "d      d",
    ],
    F,
  );
  const air = pixelMap(
    [
      "  ffff  ",
      " frrff  ",
      " fffff  ",
      "ffffffff",
      "f f  f f",
      "f      f",
      " f    f ",
      "d      d",
    ],
    F,
  );
  return makeSet([ground, air]);
}

/** Dracula human + beast forms. */
export function buildDraculaSprites(): {
  human: SpriteSet;
  beast: SpriteSet;
} {
  const H = {
    c: PAL.dracCape,
    d: PAL.dracCapeDark,
    s: PAL.skin,
    h: PAL.dracHair,
    r: PAL.eyeRed,
    g: PAL.coatTrim,
    b: PAL.dracSash,
    w: PAL.dracHairShade,
  };
  // Human idle A/B, cast, lunge
  const humanIdleA = pixelMap(
    [
      "    hhhhhh    ",
      "   hhhhhhhh   ",
      "   hhsssshh   ",
      "   hhsrrshh   ",
      "    ssssss    ",
      "   cccccccc   ",
      "  cccccccccc  ",
      " ccc gggg ccc ",
      " cccccccccccc ",
      " ccc bbbb ccc ",
      "  cccccccccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ddd    ddd  ",
      "  ddd    ddd  ",
    ],
    H,
  );
  const humanIdleB = pixelMap(
    [
      "    hhhhhh    ",
      "   hhhhhhhh   ",
      "   hhsssshh   ",
      "   hhsrrshh   ",
      "    ssssss    ",
      "   cccccccc   ",
      "  cccccccccc  ",
      " ccc gggg ccc ",
      " cccccccccccc ",
      " ccc bbbb ccc ",
      "  cccccccccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      "  ccc    ccc  ",
      " ddd      ddd ",
      " ddd      ddd ",
    ],
    H,
  );
  const humanCast = pixelMap(
    [
      "    hhhhhh    ",
      "   hhhhhhhh   ",
      "   hhsssshh   ",
      "   hhsrrshh   ",
      "    ssssss    ",
      "   cccccccc   ",
      "  cccccccccc  ",
      "ccc  gggg  ccc",
      "cc cccccc cc  ",
      "c  c bbbb c  b",
      "   cccccccc  b",
      "   ccc  ccc  b",
      "   ccc  ccc   ",
      "   ccc  ccc   ",
      "   ccc  ccc   ",
      "   ccc  ccc   ",
      "   ddd  ddd   ",
      "   ddd  ddd   ",
    ],
    H,
  );
  const humanLunge = pixelMap(
    [
      "   hhhhhh     ",
      "  hhhhhhhh    ",
      "  hhsssshh    ",
      "  hhsrrshh    ",
      "   ssssss     ",
      "  cccccccc    ",
      " cccccccccc   ",
      "ccc gggg cccc ",
      " cccccccccccc ",
      " cccbbbb cccc ",
      "  cccccccccc  ",
      "   ccc  cccc  ",
      "   ccc   cccc ",
      "   ccc    ccc ",
      "   ccc    ccc ",
      "  ddd     ddd ",
      " ddd      ddd ",
      "              ",
    ],
    H,
  );

  const B = {
    c: PAL.dracBeastDark,
    d: PAL.dracBeast,
    s: PAL.skinShade,
    h: PAL.dracHair,
    r: PAL.batEye,
    g: PAL.coatTrim,
    f: PAL.dracBeastMid,
    w: PAL.dracHairShade,
  };
  const beastIdleA = pixelMap(
    [
      "   f  hhhh  f ",
      "  ff hhhhhh ff",
      "  f hsssssh f ",
      "    hsrrssh   ",
      "    ssssss    ",
      "   cccccccc   ",
      "  cccccccccc  ",
      " cccccccccccc ",
      " ccc gggg ccc ",
      " cccccccccccc ",
      "  cccccccccc  ",
      "  cc ffff cc  ",
      "  cc      cc  ",
      "  cc      cc  ",
      "  cc      cc  ",
      "  dd      dd  ",
      "  dd      dd  ",
      "              ",
    ],
    B,
  );
  const beastIdleB = pixelMap(
    [
      "  f  hhhh  f  ",
      " ff hhhhhh ff ",
      " f hsssssh f  ",
      "   hsrrssh    ",
      "   ssssss     ",
      "  cccccccc    ",
      " cccccccccc   ",
      "cccccccccccc  ",
      "ccc gggg ccc  ",
      "cccccccccccc  ",
      " cccccccccc   ",
      " cc ffff cc   ",
      " cc      cc   ",
      " cc      cc   ",
      " cc      cc   ",
      "dd        dd  ",
      "dd        dd  ",
      "              ",
    ],
    B,
  );
  const beastCast = pixelMap(
    [
      "   f hhhh f   ",
      "  ffhhhhhhff  ",
      "  f hssssh f  ",
      "    hsrrsh    ",
      "    ssssss    ",
      "   cccccccc   ",
      "  cccccccccc  ",
      "ccc      ccc  ",
      "cc  gggg  cc r",
      "c  cccccc c  r",
      "   cccccccc  r",
      "   cc ff cc   ",
      "   cc    cc   ",
      "   cc    cc   ",
      "   cc    cc   ",
      "   dd    dd   ",
      "   dd    dd   ",
      "              ",
    ],
    B,
  );
  const beastLunge = pixelMap(
    [
      "  f hhhh f    ",
      " ffhhhhhhff   ",
      " f hssssh f   ",
      "   hsrrsh     ",
      "   ssssss     ",
      "  cccccccc    ",
      " cccccccccc   ",
      "cccccccccccc  ",
      "cccggggcccccc ",
      " cccccccccccc ",
      "  cccccccccc  ",
      "  ccffffcccc  ",
      "  cc    cccc  ",
      "  cc     ccc  ",
      "  cc     ccc  ",
      " dd      ddd  ",
      "dd       ddd  ",
      "              ",
    ],
    B,
  );

  return {
    human: makeSet([humanIdleA, humanIdleB, humanCast, humanLunge]),
    beast: makeSet([beastIdleA, beastIdleB, beastCast, beastLunge]),
  };
}

const BOSS = {
  b: PAL.bossBone,
  s: PAL.bossBoneShade,
  d: PAL.bossBoneDark,
  r: PAL.eyeRed,
  g: PAL.gold,
};

export function buildBossSprites(): { walk: SpriteSet; windup: SpriteSet } {
  // Bone Colossus, ~28x40, facing right.
  const base = (armsUp: boolean) => {
    const arms = armsUp
      ? [
          "  ss              ss  ",
          " sbb   bbbbbb   bbs   ",
          " sbb  bbbbbbbb  bbs   ",
          " sbb  bsbrrbsb  bbs   ",
        ]
      : [
          "       bbbbbb         ",
          "      bbbbbbbb        ",
          " ss   bsbrrbsb   ss   ",
          " sbb  bbbbbbbb  bbs   ",
        ];
    return pixelMap(
      [
        ...arms,
        " sbb  bbsbbsbb  bbs   ",
        " sbb   bbbbbb   bbs   ",
        " sbb    gbbg    bbs   ",
        " sbb  bbbbbbbb  bbs   ",
        " sbbs bbbbbbbb sbbs   ",
        "  sbbsbsbbbbsbsbbs    ",
        "   sbb bbbbbb bbs     ",
        "    s  bsbbsb  s      ",
        "       bbbbbb         ",
        "        bssb          ",
        "       bbbbbb         ",
        "      bbsbbsbb        ",
        "      bb bb bb        ",
        "     sbb bb bbs       ",
        "     bb  bb  bb       ",
        "    sbb  bb  bbs      ",
        "    bb   bb   bb      ",
        "   dbb  sbbs  bbd     ",
        "   bb   bbbb   bb     ",
        "  dbbd  bbbb  dbbd    ",
        " bbbbb dbbbbd bbbbb   ",
      ],
      BOSS,
    );
  };
  const walkA = base(false);
  const walkB = base(false);
  const windup = base(true);
  return { walk: makeSet([walkA, walkB]), windup: makeSet([windup]) };
}

const KEEPER = {
  k: "#2e2440",
  d: "#1c1630",
  g: PAL.coatTrim,
  e: "#ffd040",
  s: PAL.skin,
};

/** 32×32 dialogue portraits. */
export function buildPortraitSprites(): {
  hermit: Frame;
  ghost: Frame;
  demon: Frame;
  dracula: Frame;
  hero: Frame;
} {
  const hermit = pixelMap(
    [
      "        hhhh        ",
      "      hhhhhhhh      ",
      "     hhsssssshh     ",
      "     hssrrrssh     ",
      "     hsssssssh     ",
      "      hsssshh      ",
      "     rrrrrrrrr     ",
      "    r  rrrr  r    ",
      "   rr  rrrr  rr   ",
      "      rrrrrr      ",
      "     rrrrrrrr     ",
      "    rr      rr    ",
    ],
    {
      h: "#c8b898",
      s: PAL.skin,
      r: "#6a5040",
    },
  );
  const ghost = pixelMap(
    [
      "      cccccc      ",
      "    cccccccccc    ",
      "   ccwwrrwwccc   ",
      "   ccwwwwwwccc   ",
      "    ccwwwwccc    ",
      "     cccccccc     ",
      "    ccc  cccc    ",
      "   ccc    cccc   ",
      "  ccc      ccc  ",
      "  cc   cc   cc  ",
      "  c   c  c   c  ",
    ],
    {
      // Solid colors only — rgba faded against the dialogue barBack
      // and looked like an empty portrait frame.
      c: PAL.ghostCloak,
      w: PAL.ghostHi,
      r: PAL.eyeRed,
    },
  );
  const demon = pixelMap(
    [
      "   r          r   ",
      "  rr   dddd   rr  ",
      "   r  dddddd  r   ",
      "     dyryryd     ",
      "     dddddd     ",
      "      dddd      ",
      "     gggggg     ",
      "    gg gggg gg    ",
      "   g   gggg   g   ",
      "      g  g      ",
      "     gg  gg     ",
    ],
    {
      d: "#603040",
      y: PAL.eyeRed,
      r: "#a02030",
      g: "#403050",
    },
  );
  // Lord of the castle — white hair, pale face, red eyes, dark collar.
  const dracula = pixelMap(
    [
      "    wwwwwwww    ",
      "   wwwwwwwwww   ",
      "  wwssssssssww  ",
      "  wssrrssrrssw  ",
      "  wssssssssssw  ",
      "   wssssssssw   ",
      "    ssssssss    ",
      "   cccccccccc   ",
      "  cccbbbbbbccc  ",
      "  cccccccccccc  ",
      "   cccccccccc   ",
      "    cccccccc    ",
    ],
    {
      w: PAL.dracHair,
      s: PAL.skin,
      r: PAL.eyeRed,
      c: PAL.dracCape,
      b: PAL.dracSash,
    },
  );
  // Night-walker — pale hair, dark coat, gold trim (hero portrait).
  const hero = pixelMap(
    [
      "    hhhhhhhh    ",
      "   hhhhhhhhhh   ",
      "  hhsssssssshh  ",
      "  hss.ssss.ssh  ",
      "  hssssssssssh  ",
      "   hssssssssh   ",
      "    ssssssss    ",
      "   cccccccccc   ",
      "  cccggggggccc  ",
      "  cccccccccccc  ",
      "   cccccccccc   ",
      "    cccccccc    ",
    ],
    {
      h: PAL.hair,
      s: PAL.skin,
      ".": PAL.skinShade,
      c: PAL.coat,
      g: PAL.coatTrim,
    },
  );
  return { hermit, ghost, demon, dracula, hero };
}

export function buildGhostSprites(): SpriteSet {
  // Pale Knight — solid ethereal humanoid (14×32). Draw path applies alpha.
  // All rows exactly 14 chars so the silhouette stays readable (no stray bars).
  const G = {
    c: "#8aa0b8", // cloak mid
    d: "#6a8098", // cloak dark
    w: "#c8d8e8", // face / highlight
    r: PAL.eyeRed,
    s: "#b0c0d0", // sword
  };
  const a = pixelMap(
    [
      "   dddddd    ",
      "  dccccccd   ",
      " dccccccccd  ",
      " dccwrrwccd  ",
      "  dcwwwwcd   ",
      "  dccccccd   ",
      "   dccccd    ",
      "  dcccccccd  ",
      " dccccccccd  ",
      "dcc dccc dccd",
      "dc  dcccd  cd",
      "d   dcccd   d",
      "    dcccd    ",
      "    dcccd    ",
      "   ddcccdd   ",
      "  dcccccccd  ",
      "  dcc  cccd  ",
      "  dcc  cccd  ",
      "  dc    ccd  ",
      "  dc    ccd  ",
      "  dcc  cccd  ",
      "  dcccccccd  ",
      "  ddcccccdd  ",
      "   dccccd    ",
      "   dccccd    ",
      "  dd    dd   ",
      "  d      d   ",
      " dd      dd  ",
      " d        d  ",
      "d          d ",
      "             ",
      "             ",
    ],
    G,
  );
  // Idle bob: cloak flares, sword tip dips
  const b = pixelMap(
    [
      "   dddddd    ",
      "  dccccccd   ",
      " dccccccccd  ",
      " dccwrrwccd  ",
      "  dcwwwwcd   ",
      "  dccccccd   ",
      "   dccccd    ",
      "  dcccccccd  ",
      " dccccccccd  ",
      "dcc dccc dccd",
      "dc  dcccd  cd",
      "d   dcccd   d",
      "    dcccd    ",
      "    dcccd    ",
      "   ddcccdd   ",
      "  dcccccccd  ",
      "  dcc  cccd  ",
      "  dcc  cccd  ",
      "  dc    ccd  ",
      "  dc    ccd  ",
      "  dcc  cccd  ",
      "  dcccccccd  ",
      " ddccccccdd  ",
      "  dcccccd    ",
      "  dccccd     ",
      " dd    dd    ",
      " d      d    ",
      "d        d   ",
      "d         d  ",
      "           d ",
      "             ",
      "             ",
    ],
    G,
  );
  return makeSet([a, b]);
}

export function buildDemonSprites(): SpriteSet {
  // Caged imp — compact body + horns (14×32). Cage bars drawn in Npc.draw.
  const D = {
    d: "#703848", // skin mid
    k: "#502030", // skin dark
    r: PAL.eyeRed,
    h: "#c02838", // horn
    g: "#383048", // tunic
    t: "#282038", // tunic dark
  };
  const a = pixelMap(
    [
      " h        h  ",
      "hh  kkkk  hh ",
      "h  kddddk  h ",
      "  kddddddk   ",
      "  kdrdrdk    ",
      "  kdddddk    ",
      "   kdddk     ",
      "  tgggggt    ",
      " tgggggggt   ",
      " tg gggg gt  ",
      " tg gggg gt  ",
      "  tgggggt    ",
      "  tgggggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      " ttg  ggtt   ",
      " t      t    ",
      "tt      tt   ",
      "t        t   ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
    ],
    D,
  );
  const b = pixelMap(
    [
      " h        h  ",
      "hh  kkkk  hh ",
      "h  kddddk  h ",
      "  kddddddk   ",
      "  kdrdrdk    ",
      "  kdddddk    ",
      "   kdddk     ",
      "  tgggggt    ",
      " tgggggggt   ",
      "g tg ggg tg  ",
      " tg gggg gt  ",
      "  tgggggt    ",
      "  tgggggt    ",
      "  tgg ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      "  tg  ggt    ",
      " ttg  ggtt   ",
      " t      t    ",
      "tt      tt   ",
      " t      t    ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
      "             ",
    ],
    D,
  );
  return makeSet([a, b]);
}

export function buildShopkeeperSprites(): SpriteSet {
  // 14×32 robed hermit
  const a = pixelMap(
    [
      "   kkkk   ",
      "  kkkkkk  ",
      " kkkkkkkk ",
      " kkddddkk ",
      " kkdedekk ",
      " kkddddkk ",
      "  kkkkkk  ",
      " kkkkkkkk ",
      "kgkkkkkgkk",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " skkkkkks ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      "kk kkkk kk",
      "kk  kk  kk",
      "kk      kk",
      "k        k",
      "kk      kk",
      "k        k",
      "kk      kk",
      "k        k",
      "kk      kk",
      " kk    kk ",
      "kk      kk",
      "k        k",
    ],
    KEEPER,
  );
  const b = pixelMap(
    [
      "   kkkk   ",
      "  kkkkkk  ",
      " kkkkkkkk ",
      " kkddddkk ",
      " kkdedekk ",
      " kkddddkk ",
      "  kkkkkk  ",
      " kkkkkkkk ",
      "kgkkkkkgkk",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " skkkkkks ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kkkkkkkk ",
      " kk kk kk ",
      " kk  k kk ",
      "kk      kk",
      " k      k ",
      "kk      kk",
      " k      k ",
      "kk      kk",
      " k      k ",
      "kk      kk",
      "kk     kk ",
      " k      kk",
      "kk      k ",
    ],
    KEEPER,
  );
  return makeSet([a, b]);
}

export function buildBoneSprites(): Frame[] {
  const a = pixelMap(
    [
      "bs    ",
      " bb   ",
      "  bb  ",
      "   bb ",
      "    sb",
    ],
    BOSS,
  );
  const b = pixelMap(
    [
      "    sb",
      "   bb ",
      "  bb  ",
      " bb   ",
      "bs    ",
    ],
    BOSS,
  );
  return [a, b];
}

const INTER = {
  c: PAL.spellCyan,
  w: PAL.spellWhite,
  r: PAL.hpRed,
  o: PAL.hpRedHi,
  b: PAL.candleBrass,
  h: PAL.candleBrassHi,
  s: PAL.stoneLight,
  d: PAL.stoneMid,
};

export function buildInteractableSprites(): { relic: Frame; warp: Frame[]; save: Frame[] } {
  const relic = pixelMap(
    [
      "   ww   ",
      "  wccw  ",
      " wccccw ",
      " ccwccc ",
      " cccccc ",
      "  cccc  ",
      "   cc   ",
    ],
    INTER,
  );
  const warpA = pixelMap(
    [
      "  cwwccwwc  ",
      " cccccccccc ",
      "ssssssssssss",
      " dddddddddd ",
    ],
    INTER,
  );
  const warpB = pixelMap(
    [
      "  wccwwccw  ",
      " cccccccccc ",
      "ssssssssssss",
      " dddddddddd ",
    ],
    INTER,
  );
  const saveA = pixelMap(
    [
      "    oo    ",
      "   orro   ",
      "   rrrr   ",
      "   orro   ",
      "    oo    ",
      "   hbbh   ",
      "    bb    ",
      "    bb    ",
      "   hbbh   ",
      "  ssssss  ",
      " sdddddds ",
    ],
    INTER,
  );
  const saveB = pixelMap(
    [
      "    ro    ",
      "   roor   ",
      "   oorr   ",
      "   rroo   ",
      "    or    ",
      "   hbbh   ",
      "    bb    ",
      "    bb    ",
      "   hbbh   ",
      "  ssssss  ",
      " sdddddds ",
    ],
    INTER,
  );
  return { relic, warp: [warpA, warpB], save: [saveA, saveB] };
}

export function buildSubweaponSprites(): { dagger: SpriteSet; axe: Frame[] } {
  const dagger = pixelMap(
    [
      "        h ",
      "whbbbbbbhh",
      "        h ",
    ],
    SUBW,
  );
  // Axe spins: 4 rotation frames
  const axeA = pixelMap(
    [
      "  bh  ",
      " bbhh ",
      "  ww  ",
      "  ww  ",
      "  ww  ",
    ],
    SUBW,
  );
  const axeB = pixelMap(
    [
      "      ",
      "  wwbh",
      "wwwbbh",
      "      ",
      "      ",
    ],
    SUBW,
  );
  const axeC = pixelMap(
    [
      "  ww  ",
      "  ww  ",
      "  ww  ",
      " hbb  ",
      "  hb  ",
    ],
    SUBW,
  );
  const axeD = pixelMap(
    [
      "      ",
      "      ",
      "hbbwww",
      "hbww  ",
      "      ",
    ],
    SUBW,
  );
  return { dagger: makeSet([dagger]), axe: [axeA, axeB, axeC, axeD] };
}

const AXE_THROW = {
  a: PAL.armorHi,
  m: PAL.armor,
  d: PAL.armorDark,
  g: PAL.gold,
  h: PAL.goldHi,
  w: PAL.boots,
};

/** Hostile double-bit axe spin (Axe Knight). Larger than the player subweapon. */
export function buildAxeThrowSprites(): Frame[] {
  const a = pixelMap(
    [
      "  aaha  ",
      " aaggha ",
      "aam  maa",
      "  wwww  ",
      "  wwww  ",
      "  wwww  ",
      "   ww   ",
    ],
    AXE_THROW,
  );
  const b = pixelMap(
    [
      "     aah",
      "   aaggh",
      " wwwamaa",
      "wwww    ",
      "www     ",
      "        ",
      "        ",
    ],
    AXE_THROW,
  );
  const c = pixelMap(
    [
      "   ww   ",
      "  wwww  ",
      "  wwww  ",
      "  wwww  ",
      "aam  maa",
      " aaggha ",
      "  aaha  ",
    ],
    AXE_THROW,
  );
  const d = pixelMap(
    [
      "haa     ",
      "hggaa   ",
      "aama www",
      "    wwww",
      "     www",
      "        ",
      "        ",
    ],
    AXE_THROW,
  );
  return [a, b, c, d];
}

/* ------------------------------------------------------------------ */
/* Throne-room scenery props (procedural fallbacks; PNG overridable). */
/* ------------------------------------------------------------------ */

export type PropId = "throne" | "banner" | "chandelier" | "column";

/** Static/short-loop scenery for the Throne of Night and future rooms. */
export function buildPropSprites(): Record<PropId, Frame[]> {
  const T = {
    wood: "#3a2430",
    woodMid: "#4a3040",
    woodDark: "#241018",
    gold: PAL.gold,
    goldHi: PAL.goldHi,
    goldShade: PAL.goldShade,
    cloth: PAL.dracSash,
    clothHi: PAL.dracSashHi,
    clothDark: "#501018",
    stone: PAL.towerStoneMid,
    stoneHi: PAL.towerStoneLight,
    stoneDark: PAL.towerStoneDark,
    brass: PAL.candleBrass,
    brassHi: PAL.candleBrassHi,
    flame: PAL.flameMid,
    flameHi: PAL.flameCore,
    black: "#0a0608",
  };

  // Gothic high-back throne ~36×48 — gold finials, crimson cushion, dark wood.
  const throne = pixelMap(
    [
      "      G    G      ",
      "     GgG  GgG     ",
      "     GGG  GGG     ",
      "    wDDDDDDDDw    ",
      "   wDmmmmmCmmDw   ",
      "   wDmCCCCCCmDw   ",
      "   wDmCcccCCmDw   ",
      "   wDmCCCCCCmDw   ",
      "   wDmCcccCCmDw   ",
      "   wDmCCCCCCmDw   ",
      "   wDmmmmmCmmDw   ",
      "   wDDDDDDDDDDw   ",
      "   wwDwwwwwwDww   ",
      "    wDwwwwwwDw    ",
      "    wDwwCCwwDw    ",
      "    wDwwCCwwDw    ",
      "   wwDDCCCCDDww   ",
      "  wDDDDCCCCDDDDw  ",
      "  wDDccccccccDDw  ",
      "  wDDCCCCCCCCDDw  ",
      "  wDDDDDDDDDDDDw  ",
      "  wwDwwwwwwwwDww  ",
      "   wDw      wDw   ",
      "   wDw      wDw   ",
      "   wDw      wDw   ",
      "   wDw      wDw   ",
      "   wDw      wDw   ",
      "   wDw      wDw   ",
      "  wwDww    wwDww  ",
      "  wDDDDw  wDDDDw  ",
      "  wwwwww  wwwwww  ",
    ],
    {
      G: T.goldHi,
      g: T.gold,
      w: T.wood,
      D: T.woodDark,
      m: T.woodMid,
      C: T.cloth,
      c: T.clothHi,
    },
  );

  // Hanging crimson banner with gold crest ~18×40.
  const banner = pixelMap(
    [
      " GGGGGGGGGGGG ",
      "GggggggggggggG",
      "GccccccccccccG",
      "GcCCCCCCCCCCcG",
      "GcC  GGGG  CcG",
      "GcC GggggG CcG",
      "GcC GgGGgG CcG",
      "GcC GggggG CcG",
      "GcC  GGGG  CcG",
      "GcCCCCCCCCCCcG",
      "GcCccccccccCcG",
      "GcCCCCCCCCCCcG",
      "GcCccccccccCcG",
      "GcCCCCCCCCCCcG",
      "GcC  D  D  CcG",
      "GcC DDDDDD CcG",
      "GcC  DDDD  CcG",
      "GcC   DD   CcG",
      "GcCCCCCCCCCCcG",
      "GccccccccccccG",
      " GcCCCCCCCCCc ",
      "  GcCCCCCCc  ",
      "   GcCCCCc   ",
      "    GcCCc    ",
      "     GcG     ",
      "      G      ",
    ],
    {
      G: T.gold,
      g: T.goldShade,
      C: T.cloth,
      c: T.clothDark,
      D: T.goldHi,
    },
  );

  // Twin-candle chandelier, frame A/B for gentle flicker sway.
  const chA = pixelMap(
    [
      "      bb      ",
      "      bb      ",
      "     bBBb     ",
      "   bbBBBBBb   ",
      "  bB  bb  Bb  ",
      " bB   bb   Bb ",
      "bB  f  f  f Bb",
      "B  fFf fF fF B",
      "b   f   f  f b",
      " Bb        bB ",
      "  BbbbbbbbbB  ",
      "   bBBbBBbB   ",
      "    b    b    ",
    ],
    {
      b: T.brass,
      B: T.brassHi,
      f: T.flame,
      F: T.flameHi,
    },
  );
  const chB = pixelMap(
    [
      "      bb      ",
      "      bb      ",
      "     bBBb     ",
      "   bbBBBBBb   ",
      "  bB  bb  Bb  ",
      " bB   bb   Bb ",
      "bB f   f   fBb",
      "B fFf fF  fF B",
      "b  f   f   f b",
      " Bb        bB ",
      "  BbbbbbbbbB  ",
      "   bBBbBBbB   ",
      "    b    b    ",
    ],
    {
      b: T.brass,
      B: T.brassHi,
      f: T.flame,
      F: T.flameHi,
    },
  );

  // Tall stone column (fallback) — thick shaft, capital, base.
  const column = pixelMap(
    [
      "  LLLLLL  ",
      " LMMMMMML ",
      "LMMDDDMML",
      " LMMMMMML ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      "  MMMMMM  ",
      "  MDDDDM  ",
      " LMMMMMML ",
      "LMMDDDDMML",
      "LMMMMMMMML",
      " DDDDDDDD ",
    ],
    {
      L: T.stoneHi,
      M: T.stone,
      D: T.stoneDark,
    },
  );

  return {
    throne: [throne],
    banner: [banner],
    chandelier: [chA, chB],
    column: [column],
  };
}
