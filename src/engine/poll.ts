/** Runs `tick` on a fixed interval until `stop()` is called. A tick that
 * throws is swallowed (transient — e.g. a DB blip — the next tick
 * retries); `stop()` lets an in-flight tick finish but prevents the next
 * one from being scheduled. */
export function pollForever(tick: () => Promise<unknown>, intervalMs: number): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = async (): Promise<void> => {
    try {
      await tick();
    } catch {
      // transient (e.g. DB blip); the next tick retries.
    }
    if (!stopped) timer = setTimeout(loop, intervalMs);
  };
  timer = setTimeout(loop, intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
