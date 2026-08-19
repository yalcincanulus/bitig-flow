export function renderWindowPages(currentPage: number, pageCount: number) {
  if (pageCount < 1) return [];
  const page = Math.min(Math.max(1, currentPage), pageCount);
  const first = Math.max(1, page - 1);
  const last = Math.min(pageCount, page + 1);
  const pages: number[] = [];
  for (let next = first; next <= last; next += 1) pages.push(next);
  return pages;
}

export type PageIntersection = {
  page: number;
  ratio: number;
};

export function currentPageFromIntersections(entries: ReadonlyArray<PageIntersection>) {
  let best: PageIntersection | undefined;
  for (const entry of entries) {
    if (entry.ratio <= 0) continue;
    if (!best || entry.ratio > best.ratio) best = entry;
  }
  return best?.page;
}
