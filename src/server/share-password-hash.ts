import { hash, verify } from "@node-rs/argon2";

export function hashSharePassword(password: string) {
  return hash(password);
}

export async function verifySharePassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
