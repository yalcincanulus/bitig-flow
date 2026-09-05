export function linkDeleteWarning(visitCount: number | null) {
  const destroyed =
    visitCount === null
      ? "its visit history"
      : visitCount === 1
        ? "the history of 1 visit"
        : `the history of ${visitCount} visits`;
  return `This cannot be undone. Deleting this link deletes ${destroyed}. Deactivate the link instead to keep its history. The old address can be used again.`;
}
