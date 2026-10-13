import { createSmtpClient } from "./smtp";

export type RewriteDiagnostic = {
  requestId: string;
  source: "server" | "browser";
  userEmail: string;
  message: string;
  request: unknown;
  response: unknown;
};

export function formatRewriteDiagnostic(diagnostic: RewriteDiagnostic) {
  let text = [
    "ERRORE RISCRITTURA AI",
    `Riferimento: ${diagnostic.requestId}`,
    `Origine: ${diagnostic.source}`,
    `Utente: ${diagnostic.userEmail}`,
    `Data: ${new Date().toISOString()}`,
    `Errore: ${diagnostic.message}`,
    "",
    "RICHIESTA (senza chiave API)",
    JSON.stringify(diagnostic.request, null, 2),
    "",
    "RISPOSTA O ERRORE DI RETE",
    typeof diagnostic.response === "string"
      ? diagnostic.response
      : JSON.stringify(diagnostic.response, null, 2),
  ].join("\n");
  for (const secret of [
    process.env.OPENROUTER_API_KEY,
    process.env.SMTP_PASSWORD,
    process.env.AUTH_SECRET,
  ]) {
    if (secret && secret.length >= 8) text = text.replaceAll(secret, "[OMESSO]");
  }
  return text;
}

export async function sendRewriteDiagnostic(diagnostic: RewriteDiagnostic) {
  let smtp: ReturnType<typeof createSmtpClient> | undefined;
  try {
    smtp = createSmtpClient();
    await smtp.client.sendAsync({
      from: smtp.from,
      to: process.env.REWRITE_ERROR_EMAIL_TO?.trim() || "furins@gmail.com",
      subject: `Errore riscrittura AI · ${diagnostic.requestId}`,
      text: formatRewriteDiagnostic(diagnostic),
    });
  } catch (error) {
    console.error("[rewrite] Diagnostic email failed", {
      requestId: diagnostic.requestId,
      cause: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    smtp?.client.smtp.close();
  }
}
