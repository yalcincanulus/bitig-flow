export type SmtpConfiguration =
  | Readonly<{ available: false; reason: "incomplete" }>
  | Readonly<{
      available: true;
      from: string;
      transport: Readonly<{
        host: string;
        port: number;
        secure: boolean;
        auth?: Readonly<{ user: string; pass: string }>;
      }>;
    }>;

function optionalValue(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  return value ? value : undefined;
}

function smtpPort(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer from 1 through 65535");
  }
  return port;
}

function smtpSecure(raw: string | undefined) {
  if (raw === undefined) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error("SMTP_SECURE must be true or false");
}

function validateSender(from: string) {
  const address = /<([^<>]+)>$/.exec(from)?.[1] ?? from;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error("SMTP_FROM must contain a valid email address");
  }
}

export function readSmtpConfiguration(environment: NodeJS.ProcessEnv): SmtpConfiguration {
  const host = optionalValue(environment, "SMTP_HOST");
  const rawPort = optionalValue(environment, "SMTP_PORT");
  const from = optionalValue(environment, "SMTP_FROM");
  const rawSecure = optionalValue(environment, "SMTP_SECURE");
  const username = optionalValue(environment, "SMTP_USERNAME");
  const password = optionalValue(environment, "SMTP_PASSWORD");

  const port = smtpPort(rawPort);
  const secure = smtpSecure(rawSecure);
  if (from) validateSender(from);

  if (!host || port === undefined || !from || Boolean(username) !== Boolean(password)) {
    return { available: false, reason: "incomplete" };
  }

  return {
    available: true,
    transport: {
      host,
      port,
      secure,
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
    },
    from,
  };
}

export const smtpConfiguration = readSmtpConfiguration(process.env);

export function mailCapabilityAvailable() {
  return smtpConfiguration.available;
}
