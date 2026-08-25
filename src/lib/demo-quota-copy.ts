import { formatByteSize } from "#/lib/format-bytes";

type DemoError = Readonly<{
  code?: unknown;
  limit?: unknown;
  usage?: unknown;
  limitValue?: unknown;
}>;

function demoError(error: unknown): DemoError | undefined {
  return typeof error === "object" && error !== null ? error : undefined;
}

function countSuffix(error: DemoError) {
  return typeof error.usage === "number" && typeof error.limitValue === "number"
    ? ` (${error.usage.toLocaleString()} of ${error.limitValue.toLocaleString()})`
    : "";
}

const simultaneousResources = {
  documentCount: ["Document", "a"],
  uploadedDocumentCount: ["uploaded Document", "an"],
  vaultCount: ["Vault", "a"],
  linkCount: ["Link", "a"],
} as const;

const lifetimeResources = {
  documentLifetimeCount: ["Document", "Documents"],
  vaultLifetimeCount: ["Vault", "Vaults"],
  linkLifetimeCount: ["Link", "Links"],
  uploadKeyLifetimeCount: ["upload", "uploads"],
} as const;

export function demoMutationErrorMessage(error: unknown, fallback: string) {
  const typed = demoError(error);
  if (typed?.code === "DEMO_UPLOAD_UNAVAILABLE") {
    return "Demo uploads are temporarily unavailable while storage maintenance is checked.";
  }
  if (typed?.code !== "DEMO_QUOTA_EXCEEDED" || typeof typed.limit !== "string") {
    return fallback;
  }

  if (typed.limit in simultaneousResources) {
    const [singular, article] =
      simultaneousResources[typed.limit as keyof typeof simultaneousResources];
    return `Demo ${singular} limit reached${countSuffix(typed)}. Delete ${article} ${singular} before creating another.`;
  }
  if (typed.limit in lifetimeResources) {
    const [singular, plural] = lifetimeResources[typed.limit as keyof typeof lifetimeResources];
    return `Demo lifetime ${singular} limit reached${countSuffix(typed)}. Deleting ${plural} does not restore this limit.`;
  }

  if (typed.limit === "environmentConfirmedBytes") {
    return "Demo storage limit reached. Delete uploaded Documents before uploading more.";
  }
  if (typed.limit === "uploadBytes") {
    const maximum = typeof typed.limitValue === "number" ? formatByteSize(typed.limitValue) : null;
    return `Demo per-upload size limit reached${maximum ? ` (${maximum} maximum)` : ""}. Choose a smaller file.`;
  }
  if (typed.limit === "pendingUploadCount") {
    return "This Demo Environment already has an upload in progress. Finish it before starting another.";
  }
  if (typed.limit === "confirmationCount") {
    return "This Demo Environment is already confirming an upload. Try again when it finishes.";
  }
  if (typed.limit === "deliveredBytes") {
    return "This Demo Environment reached its byte-delivery limit. Document bytes can no longer be opened.";
  }
  if (typed.limit === "environmentUnavailable") {
    return "This Demo Environment is unavailable. Return home to start or resume a Demo.";
  }
  if (
    typed.limit === "globalConfirmedBytes" ||
    typed.limit === "globalPendingUploadCount" ||
    typed.limit === "globalConfirmationCount" ||
    typed.limit === "globalUnavailable"
  ) {
    return "Demo uploads are busy. Try again later.";
  }

  return "This Demo Environment reached a usage limit. Try another product action.";
}
