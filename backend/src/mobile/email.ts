import type { Config } from "../config.js";
import type { VerificationMailer } from "./auth.js";

type EmailConfig = Pick<Config, "BREVO_API_KEY" | "SMTP_URL" | "EMAIL_FROM">;
const subject = "Investing Hub email verification";
const text = (code: string) =>
  `Your verification code is ${code}. It expires in 10 minutes.`;

export async function createVerificationMailer(
  config: EmailConfig,
): Promise<VerificationMailer | undefined> {
  const { BREVO_API_KEY, SMTP_URL, EMAIL_FROM } = config;
  if (!EMAIL_FROM) return undefined;
  if (BREVO_API_KEY) {
    return async (email, code) => {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: EMAIL_FROM },
          to: [{ email }],
          subject,
          textContent: text(code),
        }),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      // Discard provider payloads without logging credentials or verification codes.
      await response.body?.cancel();
      if (!response.ok) throw new Error("Email provider rejected the request.");
    };
  }
  if (!SMTP_URL) return undefined;
  const { default: nodemailer } = await import("nodemailer");
  const smtp = new URL(SMTP_URL);
  const transport = nodemailer.createTransport({
    host: smtp.hostname,
    port: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 587)),
    secure: smtp.protocol === "smtps:",
    requireTLS: true,
    ...(smtp.username
      ? {
          auth: {
            user: decodeURIComponent(smtp.username),
            pass: decodeURIComponent(smtp.password),
          },
        }
      : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return async (email, code) => {
    await transport.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject,
      text: text(code),
    });
  };
}
