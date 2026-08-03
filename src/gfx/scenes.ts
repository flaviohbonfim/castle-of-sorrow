import { VIEW_W, VIEW_H } from "../engine/renderer";
import { PAL } from "./palette";

export type SceneId = "throneCollapse" | "castleCrumbles" | "dawn" | "sealedGate" | "closing";

/**
 * Full-screen ending panels, drawn procedurally like everything else.
 * Each is a pure function of (ctx, age-in-ticks) — no game state — so they
 * animate on their own and are trivial to preview in isolation.
 */
export const SCENES: Record<SceneId, (ctx: CanvasRenderingContext2D, age: number) => void> = {
  throneCollapse: drawThroneCollapse,
  castleCrumbles: drawCastleCrumbles,
  dawn: drawDawn,
  sealedGate: drawSealedGate,
  closing: drawClosing,
};

/**
 * CutsceneUI letterboxes the panel: a bar covers the top 18px and everything
 * below `VIEW_H - 62` (the narration box). Keep every subject above
 * `STAGE_FLOOR` or it gets swallowed by the text bar.
 */
export const STAGE_FLOOR = VIEW_H - 70; // 200

/** Deterministic pseudo-random so debris fields are stable across frames. */
function rnd(i: number): number {
  const n = Math.sin(i * 127.1) * 43758.5453;
  return n - Math.floor(n);
}

function skyGradient(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function stars(ctx: CanvasRenderingContext2D, count: number, maxY: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd(i) * VIEW_W);
    const y = Math.floor(rnd(i + 99) * maxY);
    ctx.fillStyle = i % 5 === 0 ? "#c8c0e0" : "#5a5280";
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Falling rubble shared by the collapse panels. */
function debris(ctx: CanvasRenderingContext2D, age: number, count: number, color: string): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd(i) * VIEW_W);
    const speed = 0.6 + rnd(i + 7) * 1.4;
    const size = rnd(i + 31) > 0.7 ? 3 : 2;
    const y = ((rnd(i + 13) * VIEW_H + age * speed) % (VIEW_H + 40)) - 20;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.floor(y), size, size);
  }
}

/** Panel 1 — the throne splits as the Sovereign falls. */
function drawThroneCollapse(ctx: CanvasRenderingContext2D, age: number): void {
  skyGradient(ctx, "#120c1e", "#241a30");

  // Hall pillars receding into the dark.
  for (let i = 0; i < 5; i++) {
    const x = 40 + i * 100;
    ctx.fillStyle = i % 2 === 0 ? PAL.stoneDark : "#1a1528";
    ctx.fillRect(x, 30, 22, STAGE_FLOOR - 30);
    ctx.fillStyle = PAL.stoneMid;
    ctx.fillRect(x, 30, 3, STAGE_FLOOR - 30);
  }

  // Floor.
  ctx.fillStyle = PAL.stoneDark;
  ctx.fillRect(0, STAGE_FLOOR, VIEW_W, VIEW_H - STAGE_FLOOR);
  ctx.fillStyle = PAL.stoneMid;
  ctx.fillRect(0, STAGE_FLOOR, VIEW_W, 2);

  // Throne, centre, splitting down the middle as `age` grows.
  const split = Math.min(9, age * 0.04);
  const cx = VIEW_W / 2;
  const seatY = STAGE_FLOOR - 46;
  const drawHalf = (dir: number) => {
    ctx.save();
    ctx.translate(dir * split, 0);
    ctx.fillStyle = "#2b2340";
    // Tall back, tapering to a spire.
    ctx.beginPath();
    ctx.moveTo(cx, 58);
    ctx.lineTo(cx + dir * 26, 82);
    ctx.lineTo(cx + dir * 26, seatY);
    ctx.lineTo(cx, seatY);
    ctx.closePath();
    ctx.fill();
    // Seat slab + pedestal + armrest.
    ctx.fillRect(cx + (dir > 0 ? 0 : -44), seatY, 44, 9);
    ctx.fillRect(cx + (dir > 0 ? 0 : -20), seatY + 9, 20, STAGE_FLOOR - seatY - 9);
    ctx.fillStyle = "#231c34";
    ctx.fillRect(cx + (dir > 0 ? 36 : -44), seatY - 16, 8, 16);
    // Gilt trim along the back and the seat lip.
    ctx.fillStyle = PAL.coatTrim;
    ctx.fillRect(cx + (dir > 0 ? 2 : -26), 84, 24, 2);
    ctx.fillRect(cx + (dir > 0 ? 0 : -44), seatY, 44, 2);
    ctx.restore();
  };
  drawHalf(-1);
  drawHalf(1);

  // A fallen crown at the foot of the throne.
  ctx.fillStyle = PAL.coatTrim;
  ctx.fillRect(cx + 44, STAGE_FLOOR - 6, 16, 4);
  ctx.fillRect(cx + 45, STAGE_FLOOR - 10, 3, 4);
  ctx.fillRect(cx + 50, STAGE_FLOOR - 11, 3, 5);
  ctx.fillRect(cx + 55, STAGE_FLOOR - 10, 3, 4);

  // Light bleeding through the crack.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createLinearGradient(cx - 20, 0, cx + 20, 0);
  glow.addColorStop(0, "rgba(200, 60, 60, 0)");
  glow.addColorStop(0.5, `rgba(255, 120, 80, ${Math.min(0.5, age / 220)})`);
  glow.addColorStop(1, "rgba(200, 60, 60, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 20, 52, 40, STAGE_FLOOR - 52);
  ctx.restore();

  debris(ctx, age, 26, PAL.stoneMid);
}

/** Panel 2 — the castle skyline gives way. */
function drawCastleCrumbles(ctx: CanvasRenderingContext2D, age: number): void {
  skyGradient(ctx, PAL.skyTop, "#2a1c3a");
  stars(ctx, 70, VIEW_H * 0.6);

  // Moon.
  ctx.fillStyle = PAL.moon;
  ctx.beginPath();
  ctx.arc(VIEW_W - 78, 54, 18, 0, Math.PI * 2);
  ctx.fill();

  // Towers sinking at different rates.
  const towers: [number, number, number][] = [
    [20, 110, 40], [70, 80, 30], [120, 130, 46], [186, 96, 34],
    [250, 120, 40], [312, 76, 36], [372, 126, 30], [420, 100, 44],
  ];
  towers.forEach(([x, top, w], i) => {
    // Staggered, unhurried collapse so the panel is mid-fall while it reads.
    const sink = Math.min(52, Math.max(0, (age - i * 16) * 0.16));
    const y = top + sink;
    // Lit enough to read as a silhouette against the night sky.
    ctx.fillStyle = "#2c2145";
    ctx.fillRect(x, y, w, STAGE_FLOOR - y);
    for (let s = 0; s < w / 2; s++) ctx.fillRect(x + s, y - s, w - s * 2, 1);
    // Moonlit edge down the left face.
    ctx.fillStyle = "#3b2f5c";
    ctx.fillRect(x, y, 2, STAGE_FLOOR - y);
    // Windows guttering out as the tower goes down.
    ctx.fillStyle = sink > 30 ? "#2a2340" : "#6a4a24";
    for (let wy = y + 20; wy < STAGE_FLOOR - 10; wy += 26) ctx.fillRect(x + w / 2 - 1, wy, 2, 5);
  });

  // Dust boiling up along the hill — a thin band so the towers stay visible.
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#2a2038";
  ctx.fillRect(0, STAGE_FLOOR - 6, VIEW_W, VIEW_H - STAGE_FLOOR + 6);
  for (let i = 0; i < 12; i++) {
    const x = (i * 43 + Math.sin(age * 0.02 + i) * 10) % VIEW_W;
    const r = 6 + ((i * 5) % 9);
    ctx.beginPath();
    ctx.arc(x, STAGE_FLOOR - 4 - (i % 3) * 3, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  debris(ctx, age, 34, "#2e2440");
}

/** Panel 3 — the survivor walks into the sunrise. */
function drawDawn(ctx: CanvasRenderingContext2D, age: number): void {
  const t = Math.min(1, age / 260);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, t > 0.5 ? "#2a3050" : "#141830");
  g.addColorStop(0.55, "#7a4a58");
  g.addColorStop(1, "#e8a05c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Sun climbing out of the horizon.
  const sunY = STAGE_FLOOR - 18 - t * 40;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(VIEW_W / 2, sunY, 4, VIEW_W / 2, sunY, 90);
  halo.addColorStop(0, "rgba(255, 236, 180, 0.85)");
  halo.addColorStop(1, "rgba(255, 160, 60, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(VIEW_W / 2 - 90, sunY - 90, 180, 180);
  ctx.restore();
  ctx.fillStyle = "#ffeaa8";
  ctx.beginPath();
  ctx.arc(VIEW_W / 2, sunY, 16, 0, Math.PI * 2);
  ctx.fill();

  // Ruined skyline far behind, kept off-centre so the walker reads.
  ctx.fillStyle = "#3a2438";
  const ruins: [number, number, number][] = [
    [10, 150, 30], [56, 164, 24], [96, 142, 20], [352, 156, 26], [402, 144, 32], [448, 162, 22],
  ];
  ruins.forEach(([x, top, w]) => ctx.fillRect(x, top, w, STAGE_FLOOR - top));

  // Ground.
  ctx.fillStyle = "#2a1d28";
  ctx.fillRect(0, STAGE_FLOOR, VIEW_W, VIEW_H - STAGE_FLOOR);
  ctx.fillStyle = "#3a2a34";
  ctx.fillRect(0, STAGE_FLOOR, VIEW_W, 2);

  // Hero silhouette walking right, cloak trailing. Held left of the sun so
  // the figure stays legible against the glare.
  const hx = 96 + t * 66;
  const hy = STAGE_FLOOR;
  const bob = Math.sin(age * 0.12) * 1;
  const stride = Math.sin(age * 0.12) * 3;
  ctx.fillStyle = "#120d1a";
  ctx.fillRect(hx - 5, hy - 34 + bob, 11, 22); // torso
  ctx.fillRect(hx - 4, hy - 43 + bob, 9, 10); // head
  ctx.beginPath(); // cloak
  ctx.moveTo(hx - 5, hy - 36 + bob);
  ctx.lineTo(hx - 20 - Math.sin(age * 0.08) * 4, hy - 4);
  ctx.lineTo(hx + 3, hy - 10 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(hx - 5 - stride, hy - 13 + bob, 4, 13); // legs
  ctx.fillRect(hx + 2 + stride, hy - 13 - bob, 4, 13);
}

/** Short-ending panel — the gate seals with the castle's secrets inside. */
function drawSealedGate(ctx: CanvasRenderingContext2D, age: number): void {
  skyGradient(ctx, "#0c0a16", "#1a1626");

  // Cold stone wall with an arched gateway.
  ctx.fillStyle = PAL.stoneDark;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#161222";
  ctx.fillRect(140, 60, 200, STAGE_FLOOR - 60);
  ctx.beginPath();
  ctx.arc(240, 60, 100, Math.PI, 0);
  ctx.fill();

  // Ground.
  ctx.fillStyle = "#100d1a";
  ctx.fillRect(0, STAGE_FLOOR, VIEW_W, VIEW_H - STAGE_FLOOR);
  ctx.fillStyle = PAL.stoneMid;
  ctx.fillRect(0, STAGE_FLOOR, VIEW_W, 2);

  // Cold light bleeding out of the gateway, behind the bars.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cold = ctx.createRadialGradient(240, 110, 10, 240, 110, 130);
  cold.addColorStop(0, "rgba(96, 208, 255, 0.20)");
  cold.addColorStop(1, "rgba(96, 208, 255, 0)");
  ctx.fillStyle = cold;
  ctx.fillRect(100, 0, 280, STAGE_FLOOR);
  ctx.restore();

  // Portcullis grinding down to seal the arch.
  const drop = Math.min(1, age / 160);
  const barBottom = 20 + (STAGE_FLOOR - 20) * drop;
  for (let x = 150; x < 336; x += 18) {
    ctx.fillStyle = "#4a4a5e";
    ctx.fillRect(x, 20, 5, barBottom - 20);
    ctx.fillStyle = "#6e6e86";
    ctx.fillRect(x, 20, 2, barBottom - 20);
  }
  ctx.fillStyle = "#3a3a4c";
  for (let y = 70; y < STAGE_FLOOR; y += 44) {
    const yy = 20 + (y - 20) * drop;
    if (yy < barBottom - 4) ctx.fillRect(150, yy, 190, 4);
  }

  // Hero silhouette outside the gate, back turned, watching it close.
  const hy = STAGE_FLOOR;
  ctx.fillStyle = "#08060e";
  ctx.fillRect(372, hy - 34, 11, 22);
  ctx.fillRect(373, hy - 43, 9, 10);
  ctx.fillRect(372, hy - 13, 4, 13);
  ctx.fillRect(379, hy - 13, 4, 13);
  ctx.beginPath();
  ctx.moveTo(383, hy - 36);
  ctx.lineTo(396, hy - 6);
  ctx.lineTo(377, hy - 10);
  ctx.closePath();
  ctx.fill();
}

/** Final card — title over a starfield. */
function drawClosing(ctx: CanvasRenderingContext2D, age: number): void {
  skyGradient(ctx, "#08060f", "#160f22");
  stars(ctx, 110, VIEW_H);
  ctx.save();
  ctx.globalAlpha = Math.min(1, age / 90);
  ctx.textAlign = "center";
  ctx.font = "16px 'Courier New', monospace";
  ctx.fillStyle = "#000000";
  ctx.fillText("CASTLE OF SORROW", VIEW_W / 2 + 1, VIEW_H / 2 - 7);
  ctx.fillStyle = PAL.textGold;
  ctx.fillText("CASTLE OF SORROW", VIEW_W / 2, VIEW_H / 2 - 8);
  ctx.font = "8px 'Courier New', monospace";
  ctx.fillStyle = PAL.uiFrame;
  ctx.fillText("fin", VIEW_W / 2, VIEW_H / 2 + 12);
  ctx.restore();
  ctx.textAlign = "left";
}
