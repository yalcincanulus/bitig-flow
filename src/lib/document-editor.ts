const listItemPattern = /^(\s*)([-*+]|\d+\.)\s(.*)$/;

export function continueListItem(value: string, cursor: number) {
  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  const line = value.slice(lineStart, cursor);
  const match = listItemPattern.exec(line);
  if (!match) return undefined;

  const indent = match[1] ?? "";
  const marker = match[2] ?? "";
  const rest = match[3] ?? "";

  if (rest === "") {
    return { value: `${value.slice(0, lineStart)}${value.slice(cursor)}`, cursor: lineStart };
  }

  const numbered = /^(\d+)\.$/.exec(marker);
  const nextMarker = numbered ? `${Number(numbered[1]) + 1}.` : marker;
  const insert = `\n${indent}${nextMarker} `;

  return {
    value: `${value.slice(0, cursor)}${insert}${value.slice(cursor)}`,
    cursor: cursor + insert.length,
  };
}

export async function wait(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const flushRetryDelaysMs = [2_000, 6_000] as const;
export const savingStatusMinMs = 500;
