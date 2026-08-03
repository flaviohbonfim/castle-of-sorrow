import { Renderer } from "./engine/renderer";
import { startLoop } from "./engine/loop";
import { music } from "./engine/music";
import { App } from "./app";

const root = document.getElementById("game-root");
if (!root) throw new Error("Missing #game-root");

const renderer = new Renderer(root);
const app = new App();

// Music can only start from a user gesture (autoplay policy).
window.addEventListener(
  "keydown",
  () => {
    music.start();
    music.setTrack(app.screen === "playing" ? "castle" : "title");
  },
  { once: true },
);

// Debug handles for automated play-testing / map auditing in dev.
// `__game` is re-pointed by the App whenever a run starts or ends.
if (import.meta.env.DEV) {
  (window as unknown as { __app: App }).__app = app;
  void import("./dev/validateMap").then((m) => {
    (window as unknown as { __validateMap: typeof m.reportMap }).__validateMap = m.reportMap;
  });
}

startLoop(
  () => app.update(),
  (alpha) => app.draw(renderer.ctx, alpha),
);
