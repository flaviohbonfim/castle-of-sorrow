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
  g: "#2a6a58",
  m: "#3e8a6e",
  d: "#1a4038",
  s: PAL.skin,
  r: PAL.eyeRed,
  f: "#c8a060",
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

export function buildAxeKnightSprites(): SpriteSet {
  const A = {
    a: "#5a6068",
    m: "#3a4048",
    s: PAL.skin,
    r: PAL.eyeRed,
    g: PAL.gold,
    d: PAL.stoneDark,
  };
  // 16×32 armored walker
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

export function buildWraithSprites(): SpriteSet {
  const W = {
    c: "#4a6870",
    d: "#2a4048",
    h: "#a8d0d8",
    r: PAL.eyeRed,
    g: PAL.gold,
    s: "#68a0b0",
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

const FORM = {
  f: PAL.coat,
  w: PAL.coatShade,
  g: PAL.coatTrim,
  r: PAL.eyeRed,
  h: PAL.hair,
  s: PAL.stoneLight,
};

export function buildPlayerBatSprites(): SpriteSet {
  const up = pixelMap(
    [
      "ww          ww",
      "www   gg   www",
      "wwww ffff wwww",
      " wwwwfrffwwww ",
      "  wwwffffwww  ",
      "     ffff     ",
      "      ff      ",
    ],
    FORM,
  );
  const down = pixelMap(
    [
      "      gg      ",
      "  ww ffff ww  ",
      " wwwwfrffwwww ",
      "wwwwwffffwwwww",
      "www   ff   www",
      "w     ff     w",
    ],
    FORM,
  );
  return makeSet([up, down]);
}

export function buildPlayerWolfSprites(): SpriteSet {
  const runA = pixelMap(
    [
      "                    hh    ",
      "  ff ffffffffffff  fhh    ",
      " ffffffffffffffffffffr    ",
      " fwffffffffffffffffff     ",
      "  wwfffffffffffffffgg     ",
      "   ff          fff        ",
      "  ff            fff       ",
      " ff              ff       ",
    ],
    FORM,
  );
  const runB = pixelMap(
    [
      "                    hh    ",
      "  ff ffffffffffff  fhh    ",
      " ffffffffffffffffffffr    ",
      " fwffffffffffffffffff     ",
      "  wwfffffffffffffffgg     ",
      "    fff        ff         ",
      "   fff        ff          ",
      "   ff          ff         ",
    ],
    FORM,
  );
  return makeSet([runA, runB]);
}

const BOSS = {
  b: PAL.bone,
  s: PAL.boneShade,
  d: PAL.boneDark,
  r: PAL.eyeRed,
  g: PAL.coatTrim,
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
      c: "rgba(180, 200, 220, 0.9)",
      w: "#e8f0f8",
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
  return { hermit, ghost, demon };
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
