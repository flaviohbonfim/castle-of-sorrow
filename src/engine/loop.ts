export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/**
 * Fixed-timestep game loop: simulation always advances in exact 1/60s ticks
 * (frame data, physics and i-frames are tick-counted), while rendering runs at
 * display rate with an interpolation alpha for smooth motion on 120Hz+ screens.
 */
export function startLoop(update: () => void, render: (alpha: number) => void): void {
  let last = performance.now();
  let acc = 0;

  function frame(now: number) {
    // Clamp huge deltas (tab was backgrounded) so we don't spiral.
    acc += Math.min(now - last, 250);
    last = now;

    while (acc >= TICK_MS) {
      update();
      acc -= TICK_MS;
    }
    render(acc / TICK_MS);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
