import { ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CheckEmailPage() {
  return (
    <main className="message-shell">
      <section className="message-card">
        <span className="brand-mark message-brand">SL</span>
        <div className="message-icon"><MailCheck size={31} /></div>
        <p className="eyebrow">Controlla la posta</p>
        <h1>Il link è in viaggio</h1>
        <p>
          Se l’indirizzo è autorizzato, riceverai a breve un’email da Pubblicazioni social.
          Apri il collegamento entro <strong>10 minuti</strong>: potrà essere usato una sola volta.
        </p>
        <div className="message-note">
          <ShieldCheck size={17} />
          <span>Controlla anche la cartella spam. Non inoltrare il link ad altre persone.</span>
        </div>
        <Link className="back-link" href="/login"><ArrowLeft size={16} /> Usa un altro indirizzo</Link>
      </section>
    </main>
  );
}
