import { hash } from "@node-rs/argon2";

export function hashSharePassword(password: string) {
  return hash(password);
}
