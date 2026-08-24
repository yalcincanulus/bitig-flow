import { createHmac } from "node:crypto";

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function currentTotpCode(uri: string) {
  const parsed = new URL(uri);
  const secret = parsed.searchParams.get("secret");
  if (!secret) throw new Error("TOTP URI has no secret");
  const period = Number(parsed.searchParams.get("period") ?? "30");
  const digits = Number(parsed.searchParams.get("digits") ?? "6");
  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest.at(-1)! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fff_ffff) % 10 ** digits;
  return String(binary).padStart(digits, "0");
}
