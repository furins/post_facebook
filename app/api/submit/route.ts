import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { belongsToAllowedDomain } from "@/lib/access-control";
import { ACCEPTED_MEDIA, MAX_MEDIA_ITEMS } from "@/lib/constants";
import { sqlite } from "@/lib/db";
import { ensureMandatoryHashtags, normalizeHashtags } from "@/lib/social-prompt";
import { createSmtpClient } from "@/lib/smtp";
import {
  escapeHtml,
  sanitizeAttachmentName,
  submissionMaxMb,
  submissionSchema,
} from "@/lib/submission";

export const runtime = "nodejs";

const MAX_SUBMISSIONS_PER_HOUR = 10;

type CountRow = { count: number };

function enforceSubmissionRateLimit(identifier: string) {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  sqlite.prepare("DELETE FROM submissionRequest WHERE createdAt < ?").run(windowStart);
  const row = sqlite
    .prepare(
      "SELECT COUNT(*) AS count FROM submissionRequest WHERE identifier = ? AND createdAt >= ?",
    )
    .get(identifier, windowStart) as CountRow;

  if (row.count >= MAX_SUBMISSIONS_PER_HOUR) {
    throw new Error("RATE_LIMIT");
  }
  sqlite
    .prepare("INSERT INTO submissionRequest (identifier, createdAt) VALUES (?, ?)")
    .run(identifier, now);
}

function platformLabel(platform: z.infer<typeof submissionSchema>["platform"]) {
  if (platform === "facebook") return "Facebook";
  if (platform === "instagram") return "Instagram";
  return "Facebook e Instagram";
}

export async function POST(request: Request) {
  const session = await auth();
  const senderEmail = session?.user?.email;
  if (!senderEmail || !belongsToAllowedDomain(senderEmail)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const recipient = process.env.SUBMISSION_EMAIL_TO?.trim();
  if (!recipient || !z.email().safeParse(recipient).success) {
    return NextResponse.json(
      { error: "L’indirizzo destinatario non è configurato correttamente." },
      { status: 503 },
    );
  }

  const maxMb = submissionMaxMb();
  const maxBytes = maxMb * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes + 1024 * 1024) {
    return NextResponse.json(
      { error: `Gli allegati superano il limite complessivo di ${maxMb} MB.` },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Dati di invio non leggibili." }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse({
    title: formData.get("title"),
    text: formData.get("text"),
    platform: formData.get("platform"),
    tone: formData.get("tone"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Controlla titolo, testo e opzioni del post." },
      { status: 400 },
    );
  }

  const media = formData
    .getAll("media")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (media.length === 0 || media.length > MAX_MEDIA_ITEMS) {
    return NextResponse.json(
      { error: `Allega da 1 a ${MAX_MEDIA_ITEMS} immagini o video.` },
      { status: 400 },
    );
  }
  if (media.some((file) => !ACCEPTED_MEDIA.includes(file.type))) {
    return NextResponse.json(
      { error: "Uno o più allegati hanno un formato non consentito." },
      { status: 400 },
    );
  }

  const totalBytes = media.reduce((total, file) => total + file.size, 0);
  if (totalBytes > maxBytes) {
    return NextResponse.json(
      { error: `Gli allegati superano il limite complessivo di ${maxMb} MB.` },
      { status: 413 },
    );
  }

  const mandatoryHashtags = normalizeHashtags(process.env.MANDATORY_HASHTAGS);
  const finalText = ensureMandatoryHashtags(parsed.data.text, mandatoryHashtags);
  const destination = platformLabel(parsed.data.platform);
  const sentAt = new Intl.DateTimeFormat("it-IT", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(new Date());
  let smtp: ReturnType<typeof createSmtpClient>;
  try {
    smtp = createSmtpClient();
  } catch {
    return NextResponse.json(
      { error: "Il servizio email non è configurato correttamente." },
      { status: 503 },
    );
  }

  try {
    enforceSubmissionRateLimit(senderEmail);
  } catch {
    smtp.client.smtp.close();
    return NextResponse.json(
      { error: "Hai effettuato troppi invii. Riprova tra un’ora." },
      { status: 429 },
    );
  }

  const { client, from } = smtp;

  try {
    const attachments = await Promise.all(
      media.map(async (file, index) => ({
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
        encoded: true,
        name: `${index + 1}-${sanitizeAttachmentName(file.name, index)}`,
        type: file.type,
      })),
    );

    await client.sendAsync({
      from,
      to: recipient,
      cc: senderEmail,
      subject: `Nuovo contenuto · Pubblicazioni social · ${parsed.data.title}`,
      text: [
        "NUOVO CONTENUTO · PUBBLICAZIONI SOCIAL",
        "",
        `Titolo: ${parsed.data.title}`,
        `Destinazione: ${destination}`,
        `Tono: ${parsed.data.tone}`,
        `Inviato da: ${senderEmail}`,
        `Data: ${sentAt}`,
        "",
        "TESTO PRONTO PER LA PUBBLICAZIONE",
        "",
        finalText,
        "",
        `Allegati: ${media.length}`,
      ].join("\n"),
      attachment: [
        {
          data: `<!doctype html>
            <html lang="it">
              <body style="margin:0;background:#f7f3eb;font-family:Arial,sans-serif;color:#173f3a">
                <div style="max-width:680px;margin:0 auto;padding:32px 18px">
                  <div style="background:#fffdf8;border:1px solid #ddd8cd;border-radius:18px;padding:32px">
                    <p style="margin:0;color:#176f68;font-size:12px;font-weight:700;letter-spacing:.1em">NUOVO CONTENUTO · PUBBLICAZIONI SOCIAL</p>
                    <h1 style="font-family:Georgia,serif;font-size:30px;margin:10px 0 24px">${escapeHtml(parsed.data.title)}</h1>
                    <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5">
                      <tr><td style="padding:5px 12px 5px 0;color:#61736f">Destinazione</td><td>${escapeHtml(destination)}</td></tr>
                      <tr><td style="padding:5px 12px 5px 0;color:#61736f">Tono</td><td>${escapeHtml(parsed.data.tone)}</td></tr>
                      <tr><td style="padding:5px 12px 5px 0;color:#61736f">Inviato da</td><td>${escapeHtml(senderEmail)}</td></tr>
                      <tr><td style="padding:5px 12px 5px 0;color:#61736f">Data</td><td>${escapeHtml(sentAt)}</td></tr>
                    </table>
                    <div style="margin-top:26px;padding:22px;border-radius:12px;background:#f3f8f6;white-space:pre-wrap;line-height:1.65">${escapeHtml(finalText)}</div>
                    <p style="margin:18px 0 0;color:#61736f;font-size:13px">${media.length} ${media.length === 1 ? "allegato" : "allegati"} inclusi nell’email.</p>
                  </div>
                </div>
              </body>
            </html>`,
          alternative: true,
          contentType: "text/html",
        },
        ...attachments,
      ],
    });

    return NextResponse.json({
      ok: true,
      recipient,
      copiedTo: senderEmail,
      attachmentCount: media.length,
    });
  } catch (error) {
    console.error("Invio del contenuto tramite SMTP non riuscito", error);
    return NextResponse.json(
      { error: "Invio email non riuscito. Riprova tra poco." },
      { status: 502 },
    );
  } finally {
    client.smtp.close();
  }
}
