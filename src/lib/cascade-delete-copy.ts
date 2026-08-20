export function linkDeleteWarning(visitCount: number | null) {
  const destroyed =
    visitCount === null
      ? "its Visits and their Events"
      : visitCount === 1
        ? "1 Visit and its Events"
        : `${visitCount} Visits and their Events`;
  return `This cannot be undone. Deleting this Link destroys ${destroyed}. Deactivate the Link instead to keep its history. The old Slug can be used again.`;
}
