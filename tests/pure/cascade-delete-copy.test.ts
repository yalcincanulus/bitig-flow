import { expect, test } from "vitest";

import { linkDeleteWarning } from "#/lib/cascade-delete-copy";

test("the Link delete warning names the Visit count, cannot be undone, and points at deactivating", () => {
  expect(linkDeleteWarning(null)).toBe(
    "This cannot be undone. Deleting this link deletes its visit history. Deactivate the link instead to keep its history. The old address can be used again.",
  );
  expect(linkDeleteWarning(0)).toBe(
    "This cannot be undone. Deleting this link deletes the history of 0 visits. Deactivate the link instead to keep its history. The old address can be used again.",
  );
  expect(linkDeleteWarning(1)).toBe(
    "This cannot be undone. Deleting this link deletes the history of 1 visit. Deactivate the link instead to keep its history. The old address can be used again.",
  );
  expect(linkDeleteWarning(3)).toBe(
    "This cannot be undone. Deleting this link deletes the history of 3 visits. Deactivate the link instead to keep its history. The old address can be used again.",
  );
});
