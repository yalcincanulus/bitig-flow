import { describe, expect, test } from "vitest";

import { rememberDocumentInsert, waitForDocumentInsert } from "#/lib/document-editor-lifecycle";

describe("waitForDocumentInsert", () => {
  test("resolves when there is no pending insert", async () => {
    await expect(waitForDocumentInsert("missing-document")).resolves.toBeUndefined();
  });

  test("resolves when the pending insert is rejected so autosave can upsert", async () => {
    const documentId = "0198b8f1-6ae4-7c39-9c3d-3cfd7af20401";
    let rejectInsert!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, reject) => {
      rejectInsert = reject;
    });
    rememberDocumentInsert(documentId, pending);
    rejectInsert(new Error("insert failed"));

    await expect(waitForDocumentInsert(documentId)).resolves.toBeUndefined();
  });
});
