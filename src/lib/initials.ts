/**
 * The letters an avatar falls back to when there is no image: two, or one for a **User** who goes
 * by a single name. Two is what a collapsed sidebar and a row on People both have space for.
 */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words;

  return letters.map((word) => word?.charAt(0).toUpperCase()).join("") || "?";
}
