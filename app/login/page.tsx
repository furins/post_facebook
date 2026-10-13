import { ArrowRight, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requestMagicLink } from "@/app/actions/auth";
import { SchoolLogo } from "@/components/school-logo";
import { ALLOWED_DOMAIN } from "@/lib/access-control";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;
  const errorMessage =
    error === "InvalidDomain" || error === "AccessDenied"
      ? `Usa un indirizzo appartenente al dominio @${ALLOWED_DOMAIN}.`
      : error === "Verification"
        ? "Il link è scaduto o è già stato utilizzato. Richiedine uno nuovo."
        : error
          ? "Non è stato possibile inviare il link. Controlla l’indirizzo o riprova tra qualche minuto."
          : null;

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-brand"><SchoolLogo priority /><span><strong>Pubblicazioni social</strong><small>IC Badia Trecenta</small></span></div>
        <div className="story-copy">

        </div>
        <p className="login-quote">“La scuola è il luogo dove le storie di domani cominciano.”</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="lock-icon"><LockKeyhole size={25} /></div>
          <p className="eyebrow">Area riservata</p>
          <h2>Bentornato</h2>
          <p>Inserisci la tua email istituzionale: riceverai un link personale e monouso.</p>
          {errorMessage && (
            <div className="inline-alert error login-error">
              {errorMessage}
            </div>
          )}
          <form className="email-login-form" action={requestMagicLink}>
            <label htmlFor="email">Email istituzionale</label>
            <div className="email-input-wrap">
              <Mail size={18} aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={`cognome.nome@${ALLOWED_DOMAIN}`}
                pattern={`[^@\\s]+@${ALLOWED_DOMAIN.replaceAll(".", "\\.")}`}
                required
              />
            </div>
            <button className="login-submit" type="submit">
              Invia il link di accesso <ArrowRight size={18} />
            </button>
          </form>
          <div className="domain-note"><ShieldCheck size={16} /><span>Sono ammessi solo account<br /><strong>@{ALLOWED_DOMAIN}</strong></span></div>
        </div>
        <p className="login-legal">Accedendo confermi di utilizzare lo strumento per finalità istituzionali.</p>
      </section>
    </main>
  );
}
