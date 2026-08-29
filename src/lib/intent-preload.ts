export const intentPreloadDelay = 200;
export const intentPreloadStaleTime = 30_000;

type IntentPreloadRuntime = Readonly<{
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}>;

const browserRuntime: IntentPreloadRuntime = {
  now: Date.now,
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type IntentPreloadOptions = Readonly<{
  preload: () => Promise<unknown>;
  active?: boolean;
}>;

export function createIntentPreloadController(
  initialOptions: IntentPreloadOptions,
  runtime: IntentPreloadRuntime = browserRuntime,
) {
  let preloadAction = initialOptions.preload;
  let active = initialOptions.active ?? false;
  let timeout: unknown;
  let freshUntil = 0;
  let generation = 0;

  function cancelQueuedPreload() {
    if (timeout === undefined) return;
    runtime.cancel(timeout);
    timeout = undefined;
  }

  function preloadNow() {
    cancelQueuedPreload();
    if (active || runtime.now() < freshUntil) return;

    const attemptGeneration = generation;
    freshUntil = runtime.now() + intentPreloadStaleTime;
    try {
      void preloadAction().catch(() => {
        // A failed background preload must remain retryable on the next deliberate intent.
        if (generation === attemptGeneration) freshUntil = 0;
      });
    } catch {
      if (generation === attemptGeneration) freshUntil = 0;
    }
  }

  function queuePreload() {
    if (active || timeout !== undefined || runtime.now() < freshUntil) return;
    timeout = runtime.schedule(preloadNow, intentPreloadDelay);
  }

  function reset() {
    generation += 1;
    freshUntil = 0;
    cancelQueuedPreload();
  }

  function update(options: IntentPreloadOptions) {
    preloadAction = options.preload;
    active = options.active ?? false;
  }

  return { cancelQueuedPreload, preloadNow, queuePreload, reset, update } as const;
}
