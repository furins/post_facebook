import { SMTPClient } from "emailjs";

const recipient = process.argv[2] ?? process.env.SMTP_TEST_TO;
const host = process.env.SMTP_HOST;
const from = process.env.SMTP_FROM;
const port = Number(process.env.SMTP_PORT ?? "587");

if (!recipient || !host || !from) {
  console.error(
    "Uso: npm run smtp:test -- destinatario@example.org\n" +
      "Configura prima SMTP_HOST e SMTP_FROM in .env.local.",
  );
  process.exit(1);
}

const ssl = process.env.SMTP_SECURE === "true" || port === 465;
const client = new SMTPClient({
  host,
  port,
  user: process.env.SMTP_USER || undefined,
  password: process.env.SMTP_PASSWORD || undefined,
  ssl,
  tls: !ssl && process.env.SMTP_STARTTLS !== "false",
  timeout: 15_000,
});

try {
  await client.sendAsync({
    to: recipient,
    from,
    subject: "Test SMTP · Pubblicazioni social",
    text: "La configurazione SMTP di Pubblicazioni social funziona correttamente.",
  });
  console.log(`Email di prova inviata a ${recipient}.`);
} finally {
  client.smtp.close();
}
