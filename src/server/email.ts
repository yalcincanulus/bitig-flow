import nodemailer from "nodemailer";

import { smtpConfiguration } from "#/server/email-config";

export interface EmailTransport {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

const emailTransportGlobal = globalThis as typeof globalThis & {
  bitigFlowEmailTransport?: EmailTransport;
};

export function getEmailTransport(): EmailTransport {
  emailTransportGlobal.bitigFlowEmailTransport ??= createSmtpEmailTransport();
  return emailTransportGlobal.bitigFlowEmailTransport;
}

export function createSmtpEmailTransport(): EmailTransport {
  if (!smtpConfiguration.available) {
    throw new Error("Mail is unavailable because SMTP configuration is incomplete");
  }

  const transporter = nodemailer.createTransport(smtpConfiguration.transport);
  const { from } = smtpConfiguration;

  return {
    async send(message) {
      await transporter.sendMail({ ...message, from });
    },
  };
}
