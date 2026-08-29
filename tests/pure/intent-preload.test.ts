import { expect, test, vi } from "vitest";

import {
  createIntentPreloadController,
  intentPreloadDelay,
  intentPreloadStaleTime,
} from "#/lib/intent-preload";

function testRuntime() {
  let now = 0;
  let nextHandle = 0;
  const tasks = new Map<number, { callback: () => void; dueAt: number }>();

  return {
    runtime: {
      now: () => now,
      schedule(callback: () => void, delay: number) {
        const handle = nextHandle++;
        tasks.set(handle, { callback, dueAt: now + delay });
        return handle;
      },
      cancel(handle: unknown) {
        tasks.delete(handle as number);
      },
    },
    advance: (milliseconds: number) => {
      now += milliseconds;
      for (const [handle, task] of tasks) {
        if (task.dueAt > now) continue;
        tasks.delete(handle);
        task.callback();
      }
    },
  };
}

test("intent preload ignores brief passes, suppresses repeats, and expires", () => {
  const preload = vi.fn(() => Promise.resolve());
  const { runtime, advance } = testRuntime();
  const controller = createIntentPreloadController({ preload }, runtime);

  controller.queuePreload();
  advance(intentPreloadDelay - 1);
  controller.cancelQueuedPreload();
  advance(1);
  expect(preload).not.toHaveBeenCalled();

  controller.queuePreload();
  advance(intentPreloadDelay);
  expect(preload).toHaveBeenCalledTimes(1);

  controller.queuePreload();
  advance(intentPreloadDelay);
  expect(preload).toHaveBeenCalledTimes(1);

  advance(intentPreloadStaleTime - intentPreloadDelay);
  controller.queuePreload();
  advance(intentPreloadDelay);
  expect(preload).toHaveBeenCalledTimes(2);
});
