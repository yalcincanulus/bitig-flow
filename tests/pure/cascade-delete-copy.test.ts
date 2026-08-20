import { expect, test } from "vitest";

import { linkDeleteWarning } from "#/lib/cascade-delete-copy";

test("the Link delete warning names the Visit count, cannot be undone, and points at deactivating", () => {
  expect(linkDeleteWarning(null)).toBe(
    "This cannot be undone. Deleting this Link destroys its Visits and their Events. Deactivate the Link instead to keep its history. The old Slug can be used again.",
  );
  expect(linkDeleteWarning(0)).toBe(
    "This cannot be undone. Deleting this Link destroys 0 Visits and their Events. Deactivate the Link instead to keep its history. The old Slug can be used again.",
  );
  expect(linkDeleteWarning(1)).toBe(
    "This cannot be undone. Deleting this Link destroys 1 Visit and its Events. Deactivate the Link instead to keep its history. The old Slug can be used again.",
  );
  expect(linkDeleteWarning(3)).toBe(
    "This cannot be undone. Deleting this Link destroys 3 Visits and their Events. Deactivate the Link instead to keep its history. The old Slug can be used again.",
  );
});
