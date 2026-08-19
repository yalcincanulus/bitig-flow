import { expect, test, vi } from "vitest";

import {
  createDwellAccumulator,
  dwellFlushEveryTicks,
  dwellTickMs,
  startDwellCapture,
  type DwellBeaconBody,
} from "#/lib/dwell-accumulator";

function accumulatorHarness() {
  let now = 0;
  const sent: Array<{ body: DwellBeaconBody; keepalive: boolean }> = [];
  let handoff = true;
  const send = vi.fn((body: DwellBeaconBody, options: { keepalive: boolean }) => {
    sent.push({ body, keepalive: options.keepalive });
    return handoff;
  });
  const accumulator = createDwellAccumulator({
    send,
    now: () => now,
  });

  return {
    accumulator,
    sent,
    send,
    setHandoff: (value: boolean) => {
      handoff = value;
    },
    advance: (ms = dwellTickMs) => {
      now += ms;
    },
    tick: (ms = dwellTickMs) => {
      now += ms;
      accumulator.tick();
    },
  };
}

test("a tick with currentDocument null banks nothing", () => {
  const { accumulator, send, tick } = accumulatorHarness();

  accumulator.setCurrent(null, 1);
  tick();
  accumulator.flush("unmount");

  expect(send).not.toHaveBeenCalled();
});

test("two Documents in one window produce one Beacon naming both", () => {
  const { accumulator, sent, tick } = accumulatorHarness();

  accumulator.setCurrent("document-a", 1);
  tick();
  accumulator.setCurrent("document-b", 1);
  tick();
  accumulator.flush("unmount");

  expect(sent).toEqual([
    {
      body: {
        documents: {
          "document-a": { "1": dwellTickMs },
          "document-b": { "1": dwellTickMs },
        },
        seq: 1,
        nonce: expect.any(String),
      },
      keepalive: true,
    },
  ]);
});

test("seq increments per flush while nonce does not", () => {
  const { accumulator, sent, tick } = accumulatorHarness();

  accumulator.setCurrent("document-a", 1);
  tick();
  accumulator.flush("hidden");
  tick();
  accumulator.flush("unmount");

  expect(sent).toHaveLength(2);
  expect(sent[0]?.body.seq).toBe(1);
  expect(sent[1]?.body.seq).toBe(2);
  expect(sent[0]?.body.nonce).toBe(sent[1]?.body.nonce);
  expect(sent[0]?.body.nonce).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});

test("the accumulator clears only after handoff", () => {
  const { accumulator, sent, setHandoff, tick } = accumulatorHarness();

  accumulator.setCurrent("document-a", 1);
  tick();
  setHandoff(false);
  accumulator.flush("interval");

  expect(sent).toEqual([
    {
      body: {
        documents: { "document-a": { "1": dwellTickMs } },
        seq: 1,
        nonce: expect.any(String),
      },
      keepalive: false,
    },
  ]);

  setHandoff(true);
  accumulator.flush("interval");

  expect(sent[1]).toEqual({
    body: sent[0]?.body,
    keepalive: false,
  });

  accumulator.flush("interval");
  expect(sent).toHaveLength(2);
});

test("a flush with an empty map sends nothing", () => {
  const { accumulator, send } = accumulatorHarness();

  accumulator.flush("interval");

  expect(send).not.toHaveBeenCalled();
});

test("the fifteenth tick flushes the window as one Beacon", () => {
  const { accumulator, sent, tick } = accumulatorHarness();

  accumulator.setCurrent("document-a", 1);
  for (let n = 0; n < dwellFlushEveryTicks - 1; n++) tick();
  expect(sent).toEqual([]);

  tick();

  expect(sent).toEqual([
    {
      body: {
        documents: { "document-a": { "1": dwellTickMs * dwellFlushEveryTicks } },
        seq: 1,
        nonce: expect.any(String),
      },
      keepalive: false,
    },
  ]);
});

test("setCurrent immediately before a tick still banks a full tick", () => {
  const { accumulator, sent, tick } = accumulatorHarness();

  accumulator.setCurrent("document-a", 1);
  accumulator.setCurrent("document-a", 1);
  tick();
  accumulator.flush("unmount");

  expect(sent[0]?.body.documents).toEqual({ "document-a": { "1": dwellTickMs } });
});

function captureHarness() {
  const dwell = accumulatorHarness();
  let hidden = false;
  let running: (() => void) | undefined;
  const listeners = new Set<() => void>();

  const stop = startDwellCapture({
    accumulator: dwell.accumulator,
    currentDocument: () => "document-a",
    currentPage: () => 1,
    setInterval: (handler) => {
      running = handler;
      return 1;
    },
    clearInterval: () => {
      running = undefined;
    },
    addVisibilityListener: (handler) => {
      listeners.add(handler);
    },
    removeVisibilityListener: (handler) => {
      listeners.delete(handler);
    },
    hidden: () => hidden,
  });

  return {
    ...dwell,
    pulse() {
      dwell.advance();
      running?.();
    },
    hide() {
      hidden = true;
      for (const listener of listeners) listener();
    },
    show() {
      hidden = false;
      for (const listener of listeners) listener();
    },
    stop,
    isPulsing: () => running !== undefined,
  };
}

test("a hidden tab pauses the interval, flushes with keepalive, and accrues no further time", () => {
  const capture = captureHarness();

  capture.accumulator.setCurrent("document-a", 1);
  capture.pulse();
  capture.hide();

  expect(capture.isPulsing()).toBe(false);
  expect(capture.sent).toEqual([
    {
      body: {
        documents: { "document-a": { "1": dwellTickMs } },
        seq: 1,
        nonce: expect.any(String),
      },
      keepalive: true,
    },
  ]);

  capture.pulse();
  expect(capture.sent).toHaveLength(1);

  capture.show();
  expect(capture.isPulsing()).toBe(true);
});

test("stopping capture flushes on unmount with keepalive", () => {
  const capture = captureHarness();

  capture.accumulator.setCurrent("document-a", 1);
  capture.pulse();
  capture.stop();

  expect(capture.sent[0]?.keepalive).toBe(true);
  expect(capture.isPulsing()).toBe(false);
});
