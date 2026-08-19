import { expect, test } from "vitest";

import { currentPageFromIntersections, renderWindowPages } from "#/lib/pdf-page-window";

test("the render window is the current page and its neighbours", () => {
  expect(renderWindowPages(1, 5)).toEqual([1, 2]);
  expect(renderWindowPages(3, 5)).toEqual([2, 3, 4]);
  expect(renderWindowPages(5, 5)).toEqual([4, 5]);
});

test("a document with one page windows only that page", () => {
  expect(renderWindowPages(1, 1)).toEqual([1]);
});

test("the current page is the one with the greatest intersection ratio", () => {
  expect(
    currentPageFromIntersections([
      { page: 1, ratio: 0.2 },
      { page: 2, ratio: 0.8 },
      { page: 3, ratio: 0.1 },
    ]),
  ).toBe(2);
});

test("a page with no intersection is not current", () => {
  expect(
    currentPageFromIntersections([
      { page: 1, ratio: 0 },
      { page: 2, ratio: 0.1 },
    ]),
  ).toBe(2);
});

test("when every page is off-screen there is no current page", () => {
  expect(
    currentPageFromIntersections([
      { page: 1, ratio: 0 },
      { page: 2, ratio: 0 },
    ]),
  ).toBeUndefined();
});
