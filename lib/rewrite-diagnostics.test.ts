import { describe, expect, it, vi } from "vitest";
import { createSmtpClient } from "./smtp";
import { formatRewriteDiagnostic, sendRewriteDiagnostic } from "./rewrite-diagnostics";

vi.mock("./smtp", () => ({ createSmtpClient: vi.fn() }));

describe("rewrite diagnostics", () => {
  it("includes the original text, OpenRouter request and raw response", () => {
    const previousKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "secret-openrouter-key";
    const email = formatRewriteDiagnostic({
      requestId: "test-123",
      source: "server",
      userEmail: "docente@example.org",
      message: "Risposta non valida",
      request: {
        input: { title: "Una visita", description: "Testo originale" },
        openRouter: { model: "qwen/qwen3.7-flash", messages: ["Prompt"] },
      },
      response: { status: 502, contentType: "text/html", body: "<html>Errore secret-openrouter-key</html>" },
    });
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    expect(email).toContain("Testo originale");
    expect(email).toContain("qwen/qwen3.7-flash");
    expect(email).toContain("<html>Errore [OMESSO]</html>");
    expect(email).toContain("test-123");
    expect(email).not.toContain("Authorization");
    expect(email).not.toContain("secret-openrouter-key");
  });

  it("sends the diagnostic email to the configured recipient", async () => {
    const sendAsync = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    vi.mocked(createSmtpClient).mockReturnValue({
      from: "noreply@example.org",
      client: { sendAsync, smtp: { close } },
    } as unknown as ReturnType<typeof createSmtpClient>);
    const previousRecipient = process.env.REWRITE_ERROR_EMAIL_TO;
    process.env.REWRITE_ERROR_EMAIL_TO = "furins@gmail.com";
    await sendRewriteDiagnostic({
      requestId: "test-456",
      source: "server",
      userEmail: "docente@example.org",
      message: "Errore OpenRouter",
      request: { input: "Testo originale" },
      response: { status: 502, body: "Errore remoto" },
    });
    if (previousRecipient === undefined) delete process.env.REWRITE_ERROR_EMAIL_TO;
    else process.env.REWRITE_ERROR_EMAIL_TO = previousRecipient;
    expect(sendAsync).toHaveBeenCalledWith(expect.objectContaining({
      to: "furins@gmail.com",
      subject: "Errore riscrittura AI · test-456",
      text: expect.stringContaining("Testo originale"),
    }));
    expect(close).toHaveBeenCalledOnce();
  });
});
