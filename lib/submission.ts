import { z } from "zod";

export const DEFAULT_SUBMISSION_MAX_MB = 15;

export const submissionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  text: z.string().trim().min(20).max(7000),
  platform: z.enum(["facebook", "instagram", "both"]),
  tone: z.enum(["istituzionale", "coinvolgente", "celebrativo"]),
});

export function submissionMaxMb(value = process.env.SUBMISSION_MAX_MB) {
  const parsed = Number(value ?? DEFAULT_SUBMISSION_MAX_MB);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 50
    ? parsed
    : DEFAULT_SUBMISSION_MAX_MB;
}

export function sanitizeAttachmentName(name: string, index: number) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 100);
  return normalized || `allegato-${index + 1}`;
}

export function escapeHtml(value: string) {
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
