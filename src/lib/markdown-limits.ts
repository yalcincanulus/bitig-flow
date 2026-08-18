export const markdownContentMaxBytes = 256 * 1024;
export const markdownContentCounterBytes = Math.floor(markdownContentMaxBytes * 0.8);
export const documentTitleMaxLength = 200;

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
