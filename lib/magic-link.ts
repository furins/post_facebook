import { createHash } from "node:crypto";
import type { EmailConfig } from "next-auth/providers/email";
import { sqlite } from "@/lib/db";
import { createSmtpClient } from "@/lib/smtp";

const EMAIL_WINDOW_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_REQUESTS = 3;
const MAX_IP_REQUESTS = 12;

type CountRow = { count: number };

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function hashIp(ip: string) {
  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? "local"}:${ip}`)
    .digest("hex");
}

function enforceRateLimit(identifier: string, request: Request) {
  const now = Date.now();
  const ipHash = hashIp(getClientIp(request));

  sqlite
    .prepare("DELETE FROM magicLinkRequest WHERE createdAt < ?")
    .run(now - 24 * 60 * 60 * 1000);

  const emailCount = sqlite
    .prepare(
      "SELECT COUNT(*) AS count FROM magicLinkRequest WHERE identifier = ? AND createdAt >= ?",
    )
    .get(identifier, now - EMAIL_WINDOW_MS) as CountRow;
  const ipCount = sqlite
    .prepare(
      "SELECT COUNT(*) AS count FROM magicLinkRequest WHERE ipHash = ? AND createdAt >= ?",
    )
    .get(ipHash, now - IP_WINDOW_MS) as CountRow;

  if (emailCount.count >= MAX_EMAIL_REQUESTS || ipCount.count >= MAX_IP_REQUESTS) {
    throw new Error("Troppe richieste di accesso. Attendi prima di riprovare.");
  }

  sqlite
    .prepare(
      "INSERT INTO magicLinkRequest (identifier, ipHash, createdAt) VALUES (?, ?, ?)",
    )
    .run(identifier, ipHash, now);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

export const magicLinkProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.SMTP_FROM ?? "Pubblicazioni social <noreply@localhost>",
  maxAge: 10 * 60,
  async sendVerificationRequest({ identifier, url, request }) {
    enforceRateLimit(identifier, request);
    const { client, from } = createSmtpClient();
    const safeUrl = escapeHtml(url);

    try {
      await client.sendAsync({
        to: identifier,
        from,
        subject: "Il tuo accesso a Pubblicazioni social",
        text: [
          "Hai richiesto di accedere a Pubblicazioni social.",
          "",
          `Apri questo collegamento entro 10 minuti: ${url}`,
          "",
          "Il link può essere usato una sola volta. Se non hai effettuato tu la richiesta, ignora questa email.",
        ].join("\n"),
        attachment: [
          {
            data: `
              <!doctype html>
              <html lang="it">
                <body style="margin:0;background:#f7f3eb;font-family:Arial,sans-serif;color:#173f3a">
                  <div style="max-width:560px;margin:0 auto;padding:36px 20px">
                    <div style="background:#fffdf8;border:1px solid #ddd8cd;border-radius:18px;padding:34px;text-align:center">
                      <div style="display:inline-block;background:#176f68;color:white;border-radius:12px 12px 12px 4px;padding:12px;font-weight:700">SL</div>
                      <h1 style="font-family:Georgia,serif;font-size:30px;margin:20px 0 10px">Accedi a Pubblicazioni social</h1>
                      <p style="color:#41645f;line-height:1.6">Usa il pulsante qui sotto per completare l’accesso con <strong>${escapeHtml(identifier)}</strong>.</p>
                      <a href="${safeUrl}" style="display:inline-block;margin:16px 0;background:#176f68;color:white;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">Accedi a Pubblicazioni social</a>
                      <p style="color:#6c7f7b;font-size:12px;line-height:1.6">Il collegamento scade tra 10 minuti e può essere usato una sola volta.</p>
                    </div>
                    <p style="text-align:center;color:#77827f;font-size:11px">Se non hai richiesto tu questo accesso, puoi ignorare l’email.</p>
                  </div>
                </body>
              </html>
            `,
            alternative: true,
            contentType: "text/html",
          },
        ],
      });
    } finally {
      client.smtp.close();
    }
  },
};
