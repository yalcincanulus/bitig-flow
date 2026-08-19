export const dwellTickMs = 1_000;
export const dwellFlushEveryTicks = 15;
export const dwellFlushEveryMs = dwellTickMs * dwellFlushEveryTicks;

export type DwellBeaconBody = {
  documents: Record<string, Record<string, number>>;
  seq: number;
  nonce: string;
};

export type DwellFlushReason = "interval" | "hidden" | "unmount";

export type DwellSend = (body: DwellBeaconBody, options: { keepalive: boolean }) => boolean;

export type DwellAccumulator = {
  setCurrent: (documentId: string | null, page: number) => void;
  tick: () => void;
  flush: (reason: DwellFlushReason) => void;
};

export function createDwellAccumulator(options: {
  send: DwellSend;
  now: () => number;
}): DwellAccumulator {
  const documents: Record<string, Record<string, number>> = {};
  const nonce = crypto.randomUUID();
  let currentDocument: string | null = null;
  let currentPage = 1;
  let lastFlushAt = options.now();
  let seq = 0;

  function setCurrent(documentId: string | null, page: number) {
    currentDocument = documentId;
    currentPage = page;
  }

  function bank(ms: number) {
    if (currentDocument === null || ms <= 0) return;
    const pages = (documents[currentDocument] ??= {});
    const key = String(currentPage);
    pages[key] = (pages[key] ?? 0) + ms;
  }

  function hasDwell() {
    return Object.values(documents).some((pages) => Object.values(pages).some((ms) => ms > 0));
  }

  function tick() {
    const at = options.now();
    bank(dwellTickMs);
    if (at - lastFlushAt < dwellFlushEveryMs) return;
    lastFlushAt = at;
    flush("interval");
  }

  function flush(reason: DwellFlushReason) {
    if (!hasDwell()) return;
    const body: DwellBeaconBody = {
      documents: structuredClone(documents),
      seq: seq + 1,
      nonce,
    };
    if (!options.send(body, { keepalive: reason !== "interval" })) return;
    seq += 1;
    for (const key of Object.keys(documents)) delete documents[key];
  }

  return { setCurrent, tick, flush };
}

export function startDwellCapture(options: {
  accumulator: DwellAccumulator;
  currentDocument: () => string | null;
  currentPage: () => number;
  setInterval: (handler: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
  addVisibilityListener: (handler: () => void) => void;
  removeVisibilityListener: (handler: () => void) => void;
  hidden: () => boolean;
}) {
  let interval = 0;

  function pulse() {
    options.accumulator.setCurrent(options.currentDocument(), options.currentPage());
    options.accumulator.tick();
  }

  function startInterval() {
    options.clearInterval(interval);
    interval = options.setInterval(pulse, dwellTickMs);
  }

  function onVisibility() {
    if (options.hidden()) {
      options.clearInterval(interval);
      options.accumulator.flush("hidden");
      return;
    }
    startInterval();
  }

  if (!options.hidden()) startInterval();
  options.addVisibilityListener(onVisibility);

  return () => {
    options.removeVisibilityListener(onVisibility);
    options.clearInterval(interval);
    options.accumulator.flush("unmount");
  };
}
