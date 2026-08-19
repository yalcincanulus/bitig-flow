const denyList = new Set([
  "password",
  "password1",
  "passw0rd",
  "12345678",
  "123456789",
  "qwerty",
  "qwertyui",
  "letmein",
  "welcome",
  "changeme",
]);

export type SharePasswordRefusal = "too_short" | "organization_name" | "denied";

export function sharePasswordRefusal(
  password: string,
  organizationName: string,
): SharePasswordRefusal | undefined {
  if (password.length < 8) return "too_short";

  const normalized = password.trim().toLowerCase();
  if (normalized === organizationName.trim().toLowerCase()) return "organization_name";
  if (denyList.has(normalized)) return "denied";

  return undefined;
}
