import { after, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { belongsToAllowedDomain } from "@/lib/access-control";
import { sendRewriteDiagnostic } from "@/lib/rewrite-diagnostics";

export const runtime = "nodejs";

const reportSchema = z.object({
  requestId: z.uuid(),
  message: z.string().max(1000),
  input: z.object({
    title: z.string().max(120),
    description: z.string().max(5000),
    schoolType: z.string().max(40),
    tone: z.string().max(40),
    hashtags: z.string().max(500),
  }),
  response: z.object({
    status: z.number().int().optional(),
    contentType: z.string().max(200).optional(),
    body: z.string().max(100_000).optional(),
    networkError: z.string().max(1000).optional(),
  }),
});

const reports = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !belongsToAllowedDomain(email)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 120_000) {
    return NextResponse.json({ error: "Segnalazione troppo grande." }, { status: 413 });
  }

  let report: z.infer<typeof reportSchema>;
  try {
    report = reportSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Segnalazione non valida." }, { status: 400 });
  }

  const now = Date.now();
  const current = reports.get(email);
  const count = current && current.resetAt > now ? current.count : 0;
  if (count >= 10) {
    return NextResponse.json({ error: "Troppe segnalazioni." }, { status: 429 });
  }
  reports.set(email, {
    count: count + 1,
    resetAt: current?.resetAt && current.resetAt > now
      ? current.resetAt
      : now + 60 * 60 * 1000,
  });

  after(() =>
    sendRewriteDiagnostic({
      requestId: report.requestId,
      source: "browser",
      userEmail: email,
      message: report.message,
      request: {
        url: "/api/rewrite",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: report.input,
      },
      response: report.response,
    }),
  );
  return new Response(null, { status: 204 });
}
