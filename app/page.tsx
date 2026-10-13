import { LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { PostComposer } from "@/components/post-composer";
import { SchoolLogo } from "@/components/school-logo";
import { normalizeHashtags } from "@/lib/social-prompt";
import { submissionMaxMb } from "@/lib/submission";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const additionalHashtags = normalizeHashtags(process.env.MANDATORY_HASHTAGS);
  const submissionRecipient = process.env.SUBMISSION_EMAIL_TO?.trim() ?? "";

  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Pubblicazioni social, torna all'inizio">
          <SchoolLogo priority />
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
          <div className="hero-badge"><span /> Assistente alle pubblicazioni sui social media</div>
          <p>Prepara post coinvolgenti e rispettosi della privacy, pronti per i canali social dell’Istituto.</p>
        </section>
        <PostComposer
          additionalHashtags={additionalHashtags}
          submissionRecipient={submissionRecipient}
          senderEmail={session.user.email}
          submissionMaxMb={submissionMaxMb()}
        />
      </main>

      <footer>
        <SchoolLogo className="small" />
        <p><strong>Pubblicazioni social</strong><br />Uno strumento interno dell’IC Badia Trecenta.</p>
        <p className="privacy-foot"><ShieldCheck size={15} /> Foto elaborate localmente nel browser</p>
      </footer>
    </>
  );
}
