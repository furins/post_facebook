import { LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { PostComposer } from "@/components/post-composer";
import { normalizeHashtags } from "@/lib/social-prompt";
import { submissionMaxMb } from "@/lib/submission";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const mandatoryHashtags = normalizeHashtags(process.env.MANDATORY_HASHTAGS);
  const submissionRecipient = process.env.SUBMISSION_EMAIL_TO?.trim() ?? "";

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Pubblicazioni social, torna all'inizio">
          <span className="brand-mark">PS</span>
          <span><strong>Pubblicazioni social</strong><small>IC Badia Trecenta</small></span>
        </a>
        <div className="account">
          <div className="account-copy">
            <span><ShieldCheck size={14} /> Accesso verificato</span>
            <strong>{session.user.email}</strong>
          </div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="icon-button" type="submit" aria-label="Esci" title="Esci"><LogOut size={19} /></button>
          </form>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-badge"><span /> Spazio editoriale riservato</div>
          <h1>Le storie della scuola,<br /><em>raccontate bene.</em></h1>
          <p>Prepara immagini rispettose della privacy e testi coinvolgenti, pronti per i canali social dell’Istituto.</p>
          <div className="hero-steps" aria-label="Fasi di lavoro">
            <span><b>1</b> Media</span><i /><span><b>2</b> Racconto</span><i /><span><b>3</b> Invio</span>
          </div>
        </section>
        <PostComposer
          mandatoryHashtags={mandatoryHashtags}
          submissionRecipient={submissionRecipient}
          senderEmail={session.user.email}
          submissionMaxMb={submissionMaxMb()}
        />
      </main>

      <footer>
        <span className="brand-mark small">PS</span>
        <p><strong>Pubblicazioni social</strong><br />Uno strumento interno dell’IC Badia Trecenta.</p>
        <p className="privacy-foot"><ShieldCheck size={15} /> Foto elaborate localmente nel browser</p>
      </footer>
    </>
  );
}
