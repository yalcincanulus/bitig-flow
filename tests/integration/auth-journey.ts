import { mailpitBaseUrl } from "./environment";

export function postAuth(http: typeof fetch, path: string, body: unknown) {
  return http(new URL(path, process.env.BETTER_AUTH_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.BETTER_AUTH_URL!,
    },
    body: JSON.stringify(body),
  });
}

export async function waitForVerificationOtp(email: string) {
  const mailpitUrl = mailpitBaseUrl(process.env);
  const query = `to:${email}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const searchResponse = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(query)}`,
    );
    if (searchResponse.ok) {
      const { messages } = (await searchResponse.json()) as {
        messages: Array<{ ID: string; Subject: string }>;
      };
      const verification = messages.find((message) =>
        message.Subject.includes("verification code"),
      );
      if (verification) {
        const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${verification.ID}`);
        const message = (await messageResponse.json()) as { Text: string };
        const match = /Your verification code is (\d{6})/.exec(message.Text);
        if (match?.[1]) return match[1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No verification OTP arrived for ${email}`);
}

export async function waitForPasswordResetUrl(email: string) {
  const mailpitUrl = mailpitBaseUrl(process.env);
  const query = `to:${email}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const searchResponse = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(query)}`,
    );
    if (searchResponse.ok) {
      const { messages } = (await searchResponse.json()) as {
        messages: Array<{ ID: string; Subject: string }>;
      };
      const recovery = messages.find((message) => message.Subject.includes("Reset your password"));
      if (recovery) {
        const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${recovery.ID}`);
        const message = (await messageResponse.json()) as { Text: string };
        const match = /Reset your password: (https?:\/\/\S+)/.exec(message.Text);
        if (match?.[1]) return match[1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`No password reset email arrived for ${email}`);
}
