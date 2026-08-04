import { Renderer } from "./engine/renderer";
import { startLoop } from "./engine/loop";
import { music } from "./engine/music";
import { loadSettings } from "./engine/settings";
import { loadAssets } from "./gfx/assets";
import { App } from "./app";

async function boot(): Promise<void> {
  // Prefs + optional PNG/ogg overrides before any entity builds sprites.
  loadSettings();
  await loadAssets();

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
  if (import.meta.env.DEV) {
    (window as unknown as { __app: App }).__app = app;
    void import("./dev/validateMap").then((m) => {
      (window as unknown as { __validateMap: typeof m.reportMap }).__validateMap = m.reportMap;
    });
  }

  // Optional PWA — fail silently if the host blocks service workers.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline cache optional */
    });
  }

  startLoop(
    () => app.update(),
    (alpha) => app.draw(renderer.ctx, alpha),
  );
}

void boot();
