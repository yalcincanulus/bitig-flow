import nodemailer from "nodemailer";

export interface EmailTransport {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function createMailpitEmailTransport(): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: requiredEnvironmentVariable("SMTP_HOST"),
    port: Number(requiredEnvironmentVariable("SMTP_PORT")),
    secure: false,
  });
  const from = process.env.SMTP_FROM ?? "bitig-flow <no-reply@bitig.local>";

  return {
    async send(message) {
      await transporter.sendMail({ ...message, from });
    },
  };
}
