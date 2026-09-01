import { DEFAULT_DOMAIN } from "./constants";

export const ALLOWED_DOMAIN = (
  process.env.ALLOWED_EMAIL_DOMAIN ?? DEFAULT_DOMAIN
).toLowerCase();

export function belongsToAllowedDomain(email?: string | null) {
  if (!email) return false;
  const normalized = email.normalize("NFKC").trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && Boolean(parts[0]) && parts[1] === ALLOWED_DOMAIN;
}
