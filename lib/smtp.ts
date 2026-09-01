import { SMTPClient } from "emailjs";

export function createSmtpClient() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) {
    throw new Error("SMTP_HOST e SMTP_FROM devono essere configurati.");
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT non è valida.");
  }

  const ssl = process.env.SMTP_SECURE === "true" || port === 465;
  return {
    from,
    client: new SMTPClient({
      host,
      port,
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      ssl,
      tls: !ssl && process.env.SMTP_STARTTLS !== "false",
      timeout: 15_000,
    }),
  };
}
