import { Renderer } from "./engine/renderer";
import { startLoop } from "./engine/loop";
import { music } from "./engine/music";
import { Game } from "./game";

const root = document.getElementById("game-root");
if (!root) throw new Error("Missing #game-root");

const renderer = new Renderer(root);
const game = new Game();

// Music can only start from a user gesture (autoplay policy).
window.addEventListener("keydown", () => music.start(), { once: true });

// Debug handles for automated play-testing / map auditing in dev.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
  void import("./dev/validateMap").then((m) => {
    (window as unknown as { __validateMap: typeof m.reportMap }).__validateMap = m.reportMap;
  });
}

startLoop(
  () => game.update(),
  (alpha) => game.draw(renderer.ctx, alpha),
);
