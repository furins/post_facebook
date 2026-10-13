"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Baby,
  BookOpen,
  Check,
  GraduationCap,
  Hash,
  LoaderCircle,
  Mail,
  Send,
} from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MediaEditor, type MediaItem } from "@/components/media-editor";
import {
  baseMandatoryHashtags,
  composeOriginalPost,
  mandatoryHashtagsForSchool,
  suggestedHashtagsForSchool,
  type SchoolType,
  type SocialTone,
} from "@/lib/social-prompt";

type Props = {
  additionalHashtags: string[];
  submissionRecipient: string;
  senderEmail: string;
  submissionMaxMb: number;
};

type RewriteInput = {
  title: string;
  description: string;
  schoolType: SchoolType;
  tone: SocialTone;
  hashtags: string;
};

function reportBrowserRewriteError(
  input: RewriteInput,
  message: string,
  response: {
    status?: number;
    contentType?: string;
    body?: string;
    networkError?: string;
  },
) {
  const requestId = crypto.randomUUID();
  void fetch("/api/rewrite-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, message, input, response }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) {
      console.error("[rewrite] Browser diagnostic rejected", {
        requestId,
        status: response.status,
      });
    }
  }).catch(() => {
    console.error("[rewrite] Could not send browser diagnostic", { requestId });
  });
  return requestId;
}

function attachmentName(item: MediaItem) {
  if (item.kind === "video") return item.name;
  const base = item.name.replace(/\.[^.]+$/, "") || "immagine";
  const extension =
    item.mimeType === "image/png"
      ? "png"
      : item.mimeType === "image/webp"
        ? "webp"
        : "jpg";
  return `${base}-social.${extension}`;
}

export function PostComposer({
  additionalHashtags,
  submissionRecipient,
  senderEmail,
  submissionMaxMb,
}: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const previousStep = useRef(currentStep);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [schoolType, setSchoolType] = useState<SchoolType | null>(null);
  const [tone, setTone] = useState<SocialTone>("coinvolgente");
  const [hashtags, setHashtags] = useState("");
  const [mediaValid, setMediaValid] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [originalText, setOriginalText] = useState("");
  const [enhancedText, setEnhancedText] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<"original" | "enhanced" | null>(null);
  const [loading, setLoading] = useState(false);
  const rewriteController = useRef<AbortController | null>(null);
  const rewriteAttempt = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (previousStep.current === currentStep) return;
    previousStep.current = currentStep;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [currentStep]);

  const totalMediaBytes = useMemo(
    () => mediaItems.reduce((total, item) => total + item.blob.size, 0),
    [mediaItems],
  );
  const mediaWithinEmailLimit =
    totalMediaBytes <= submissionMaxMb * 1024 * 1024;
  const mandatoryHashtags = useMemo(
    () =>
      schoolType
        ? mandatoryHashtagsForSchool(schoolType, additionalHashtags)
        : baseMandatoryHashtags(additionalHashtags),
    [schoolType, additionalHashtags],
  );
  const mediaStepValid = mediaItems.length === 0 || mediaValid;
  const selectedText = selectedVersion === "original" ? originalText : selectedVersion === "enhanced" ? enhancedText : "";

  const cancelRewrite = () => {
    rewriteAttempt.current += 1;
    rewriteController.current?.abort();
    rewriteController.current = null;
    setLoading(false);
  };

  const invalidateDraft = () => {
    cancelRewrite();
    setOriginalText("");
    setEnhancedText("");
    setReviewFeedback("");
    setSelectedVersion(null);
    setSent(false);
    setSendError(null);
  };

  const handleMediaChange = useCallback((items: MediaItem[]) => {
    setMediaItems(items);
    setSent(false);
    setSendError(null);
  }, []);

  const copyValid = useMemo(
    () =>
      title.trim().length >= 3 &&
      description.trim().length >= 20 &&
      schoolType !== null,
    [title, description, schoolType],
  );

  const selectSchoolType = (value: SchoolType) => {
    if (schoolType === value) return;
    setSchoolType(value);
    setSchoolError(null);
    setHashtags(suggestedHashtagsForSchool(value).join(" "));
    invalidateDraft();
  };

  const continueFromCopy = () => {
    const missingSchool = schoolType === null;
    setSchoolError(
      missingSchool ? "Seleziona il tipo di scuola per continuare." : null,
    );
    if (title.trim().length < 3 || description.trim().length < 20) {
      setCopyError(
        "Inserisci un titolo di almeno 3 caratteri e un testo di almeno 20 caratteri.",
      );
      return;
    }
    setCopyError(null);
    if (!schoolType) return;
    setOriginalText(composeOriginalPost(title, description, mandatoryHashtags, hashtags));
    setEnhancedText("");
    setReviewFeedback("");
    setSelectedVersion(null);
    setError(null);
    setCurrentStep(3);
    void rewrite({ title, description, schoolType, tone, hashtags });
  };

  const rewrite = async (input: RewriteInput) => {
    const attempt = ++rewriteAttempt.current;
    const controller = new AbortController();
    rewriteController.current = controller;
    setLoading(true);
    setError(null);
    setEnhancedText("");
    setReviewFeedback("");
    setSelectedVersion(null);
    let responseReceived = false;
    let browserReported = false;

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      responseReceived = true;
      const contentType = response.headers.get("content-type") ?? "";
      const requestId = response.headers.get("x-request-id");
      let responseBody: string;
      try {
        responseBody = await response.text();
      } catch (caught) {
        const reference = reportBrowserRewriteError(input, "Risposta /api/rewrite non leggibile", {
          status: response.status,
          contentType,
          networkError: caught instanceof Error ? caught.message : "unknown",
        });
        browserReported = true;
        throw new Error(`Impossibile leggere la risposta del server. Riferimento: ${reference}.`);
      }
      if (!contentType.toLowerCase().includes("application/json")) {
        const reference = reportBrowserRewriteError(input, "Risposta non JSON da /api/rewrite", {
          status: response.status,
          contentType,
          body: responseBody.slice(0, 50_000),
        });
        browserReported = true;
        console.error("[rewrite] API returned a non-JSON response", {
          status: response.status,
          contentType,
          requestId,
        });
        throw new Error(
          `Il server ha restituito una risposta inattesa (HTTP ${response.status}). Riferimento: ${reference}.`,
        );
      }
      let result: {
        enhancedText?: string;
        feedback?: string;
        error?: string;
        requestId?: string;
      };
      try {
        result = JSON.parse(responseBody);
      } catch {
        const reference = reportBrowserRewriteError(input, "JSON non valido da /api/rewrite", {
          status: response.status,
          contentType,
          body: responseBody.slice(0, 50_000),
        });
        browserReported = true;
        console.error("[rewrite] API returned invalid JSON", {
          status: response.status,
          contentType,
          requestId,
        });
        throw new Error(
          `Il server ha restituito JSON non valido (HTTP ${response.status}). Riferimento: ${reference}.`,
        );
      }
      if (!result || typeof result !== "object") {
        const reference = reportBrowserRewriteError(input, "Formato JSON inatteso da /api/rewrite", {
          status: response.status,
          contentType,
          body: responseBody.slice(0, 50_000),
        });
        browserReported = true;
        throw new Error(`Il server ha restituito dati non validi. Riferimento: ${reference}.`);
      }
      if (!response.ok) {
        const reference = result.requestId ?? requestId;
        throw new Error(
          `${result.error ?? `Rielaborazione non riuscita (HTTP ${response.status}).`}${reference ? ` Riferimento: ${reference}.` : ""}`,
        );
      }
      if (typeof result.enhancedText !== "string" || !result.enhancedText.trim() || typeof result.feedback !== "string" || !result.feedback.trim()) {
        const reference = reportBrowserRewriteError(input, "Proposta incompleta da /api/rewrite", {
          status: response.status,
          contentType,
          body: responseBody.slice(0, 50_000),
        });
        browserReported = true;
        throw new Error(`Il server ha restituito una proposta incompleta. Riferimento: ${reference}.`);
      }
      if (attempt !== rewriteAttempt.current) return;
      setEnhancedText(result.enhancedText);
      setReviewFeedback(result.feedback);
    } catch (caught) {
      if (attempt === rewriteAttempt.current) {
        let message = caught instanceof Error ? caught.message : "Rielaborazione non riuscita.";
        if (!responseReceived && !browserReported) {
          const reference = reportBrowserRewriteError(input, "Richiesta /api/rewrite non riuscita", {
            networkError: message,
          });
          message += ` Riferimento: ${reference}.`;
        }
        setError(message);
      }
    } finally {
      if (attempt === rewriteAttempt.current) {
        rewriteController.current = null;
        setLoading(false);
      }
    }
  };

  const chooseVersion = (version: "original" | "enhanced") => {
    const text = version === "original" ? originalText : enhancedText;
    if (!text.trim()) return;
    if (version === "original") cancelRewrite();
    setSelectedVersion(version);
    setSent(false);
    setCurrentStep(4);
  };

  const sendPost = async () => {
    if (
      !copyValid ||
      !schoolType ||
      !selectedText.trim() ||
      !mediaWithinEmailLimit ||
      sending
    ) return;
    setSending(true);
    setSendError(null);

    const body = new FormData();
    body.set("title", title.trim());
    body.set("text", selectedText.trim());
    body.set("schoolType", schoolType);
    body.set("tone", tone);
    mediaItems.forEach((item) => {
      body.append("media", item.blob, attachmentName(item));
    });

    try {
      const response = await fetch("/api/submit", { method: "POST", body });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Invio non riuscito.");
      }
      setSent(true);
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : "Invio non riuscito.");
    } finally {
      setSending(false);
    }
  };

  const wizardSteps = ["Media", "Racconto", "Confronto", "Invio"];

  return (
    <form
      className="composer wizard"
      onSubmit={(event) => {
        event.preventDefault();
        if (currentStep === 2) continueFromCopy();
      }}
    >
      <ol className="wizard-progress" aria-label="Avanzamento della pubblicazione">
        {wizardSteps.map((label, index) => {
          const step = index + 1;
          return (
            <li
              key={label}
              className={currentStep === step ? "current" : currentStep > step ? "completed" : ""}
              aria-current={currentStep === step ? "step" : undefined}
            >
              <span>{currentStep > step ? <Check size={15} /> : step}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>

      <div className="wizard-stage" hidden={currentStep !== 1}>
        <MediaEditor
          onValidityChange={setMediaValid}
          onMediaChange={handleMediaChange}
          onContinue={() => setCurrentStep(2)}
          continueLabel={mediaItems.length === 0 ? "Continua senza media" : "Continua"}
          continueDisabled={!mediaStepValid}
        />
      </div>

      <section className="panel copy-section wizard-stage" aria-labelledby="copy-heading" hidden={currentStep !== 2}>
        <div className="section-heading">
          <div className="step-number coral">2</div>
          <div>
            <p className="eyebrow">Descrizione</p>
            <h2 id="copy-heading">Racconta i fatti</h2>
            <p>Descrivi a grandi linee gli eventi che vuoi promuovere, nella schermata successiva provvederemo a rifinire il contenuto.</p>
          </div>
        </div>

        <div className="field-grid">
          <label className="field full-width">
            <span>Titolo <em>obbligatorio</em></span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setCopyError(null);
                invalidateDraft();
              }}
              placeholder="Es. Una mattina di scienza in laboratorio"
              minLength={3}
              maxLength={120}
              required
            />
            <small>{title.length}/120</small>
          </label>

          <label className="field full-width">
            <span>Testo descrittivo <em>obbligatorio</em></span>
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setCopyError(null);
                invalidateDraft();
              }}
              placeholder="Racconta cosa è successo, chi ha partecipato e perché è stato importante…"
              minLength={20}
              maxLength={5000}
              rows={8}
              required
            />
            <small>{description.length}/5000</small>
          </label>

          <fieldset className="choice-field" aria-describedby={schoolError ? "school-error" : undefined}>
            <legend>Tipo di scuola <em>obbligatorio</em></legend>
            <div className={`segmented school-types ${schoolError ? "invalid" : ""}`}>
              <button type="button" className={schoolType === "infanzia" ? "active" : ""} onClick={() => selectSchoolType("infanzia")} aria-pressed={schoolType === "infanzia"}><Baby size={17} /> Infanzia</button>
              <button type="button" className={schoolType === "primaria" ? "active" : ""} onClick={() => selectSchoolType("primaria")} aria-pressed={schoolType === "primaria"}><BookOpen size={17} /> Primaria</button>
              <button type="button" className={schoolType === "secondaria-primo-grado" ? "active" : ""} onClick={() => selectSchoolType("secondaria-primo-grado")} aria-pressed={schoolType === "secondaria-primo-grado"}><GraduationCap size={17} /> Secondaria</button>
            </div>
            {schoolError && <p className="field-error" id="school-error" role="alert">{schoolError}</p>}
          </fieldset>

          <fieldset className="choice-field">
            <legend>Tono del post</legend>
            <div className="segmented">
              {(["istituzionale", "coinvolgente", "celebrativo"] as SocialTone[]).map((value) => (
                <button key={value} type="button" className={tone === value ? "active" : ""} onClick={() => { setTone(value); invalidateDraft(); }} aria-pressed={tone === value}>{value}</button>
              ))}
            </div>
          </fieldset>

          <label className="field full-width hashtag-field">
            <span>Hashtag modificabili</span>
            <div className="hashtag-input">
              <Hash size={17} />
              <input
                value={hashtags}
                onChange={(event) => {
                  setHashtags(event.target.value);
                  invalidateDraft();
                }}
                placeholder={schoolType ? "Aggiungi o rimuovi gli hashtag suggeriti" : "Seleziona prima il tipo di scuola"}
                maxLength={500}
                disabled={!schoolType}
              />
            </div>
            <p className="field-help">Separali con uno spazio o una virgola. Il kit iniziale cambia in base al tipo di scuola.</p>
          </label>
        </div>

        <div className="hashtag-note">
          <span>Hashtag sempre inclusi</span>
          <div>{mandatoryHashtags.map((tag) => <code key={tag}>{tag}</code>)}</div>
        </div>

        {copyError && <div className="inline-alert error" role="alert"><AlertTriangle size={17} />{copyError}</div>}
        <div className="wizard-actions">
          <button className="button ghost" type="button" onClick={() => setCurrentStep(1)}><ArrowLeft size={17} /> Indietro</button>
          <button className="button primary" type="button" onClick={continueFromCopy}>Continua <ArrowRight size={17} /></button>
        </div>
      </section>

      <section className="panel ai-section wizard-stage" aria-labelledby="ai-heading" hidden={currentStep !== 3}>
        <div className="section-heading">
          <div className="step-number">3</div>
          <div>
            <p className="eyebrow">Assistente editoriale</p>
            <h2 id="ai-heading">Confronta le due versioni</h2>
            <p>L’assistente valuta la bozza e propone un testo. Puoi modificare entrambe le versioni prima di scegliere quale inviare.</p>
          </div>
        </div>
        {loading && <p className="review-status" role="status"><LoaderCircle className="spin" size={18} /> Analisi del testo in corso…</p>}
        {error && (
          <div className="inline-alert error" role="alert">
            <span>{error} Puoi riprovare o scegliere il testo originale.</span>
            <button className="button secondary small" type="button" onClick={() => schoolType && void rewrite({ title, description, schoolType, tone, hashtags })}>Riprova</button>
          </div>
        )}
        <p className="field-help">In caso di errore, il team innovazione verrà avvisato automaticamente</p>
        {reviewFeedback && <div className="review-feedback" aria-live="polite"><strong>Cosa si può migliorare</strong><p>{reviewFeedback}</p></div>}

        <div className="review-grid">
          <div className="result-card review-card">
            <div className="result-heading"><strong>Testo originale</strong></div>
            <textarea
              aria-label="Testo originale modificabile"
              value={originalText}
              onChange={(event) => { setOriginalText(event.target.value); setSent(false); }}
              rows={14}
            />
            <button className="button secondary review-choice" type="button" disabled={!originalText.trim()} onClick={() => chooseVersion("original")}>Usa questo testo <ArrowRight size={17} /></button>
          </div>
          <div className="result-card review-card">
            <div className="result-heading"><strong>Testo proposto</strong></div>
            <textarea
              aria-label="Testo proposto modificabile"
              value={enhancedText}
              onChange={(event) => {
                setEnhancedText(event.target.value);
                setSent(false);
              }}
              disabled={!reviewFeedback}
              placeholder={loading ? "La proposta apparirà qui appena pronta." : ""}
              rows={14}
            />
            <button className="button primary review-choice" type="button" disabled={!enhancedText.trim()} onClick={() => chooseVersion("enhanced")}>Usa questo testo <ArrowRight size={17} /></button>
          </div>
        </div>

        <div className="wizard-actions">
          <button className="button ghost" type="button" onClick={() => { cancelRewrite(); setCurrentStep(2); }}><ArrowLeft size={17} /> Indietro</button>
        </div>
      </section>

      <section className="panel send-section wizard-stage" aria-labelledby="send-heading" hidden={currentStep !== 4}>
        <div className="section-heading">
          <div className="step-number">4</div>
          <div>
            <p className="eyebrow">Consegna alla redazione</p>
            <h2 id="send-heading">Invia il contenuto completo</h2>
            <p>Invierai il {selectedVersion === "original" ? "testo originale" : "testo proposto"} scelto, con le tue modifiche e gli eventuali media.</p>
          </div>
        </div>

        <div className="delivery-summary">
          <div>
            <Mail size={18} />
            <span><small>Destinatario</small><strong>{submissionRecipient || "Non configurato"}</strong></span>
          </div>
          <div>
            <Check size={18} />
            <span><small>Copia al mittente</small><strong>{senderEmail}</strong></span>
          </div>
          <div>
            <span className="attachment-count">{mediaItems.length}</span>
            <span>
              <small>Allegati</small>
              <strong>{mediaItems.length === 0 ? "Nessun allegato" : `${(totalMediaBytes / 1024 / 1024).toFixed(1)} di ${submissionMaxMb} MB`}</strong>
            </span>
          </div>
        </div>

        {!mediaWithinEmailLimit && (
          <div className="inline-alert error" role="alert">
            <AlertTriangle size={17} />
            Riduci il numero o la dimensione dei media: l’email può contenere al massimo {submissionMaxMb} MB di allegati.
          </div>
        )}
        {sendError && <div className="inline-alert error" role="alert">{sendError}</div>}
        {sent && (
          <div className="send-success" role="status">
            <Check size={22} />
            <div>
              <strong>Contenuto inviato</strong>
              <span>L’email è stata consegnata a {submissionRecipient} con copia a {senderEmail}.</span>
            </div>
          </div>
        )}

        <div className="wizard-actions">
          <button className="button ghost" type="button" onClick={() => setCurrentStep(3)} disabled={sending}><ArrowLeft size={17} /> Indietro</button>
          {!sent && (
            <button
              className="button primary"
              type="button"
              onClick={() => void sendPost()}
              disabled={!submissionRecipient || !mediaWithinEmailLimit || sending}
            >
              {sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
              {sending ? "Invio in corso…" : "Invia alla redazione"}
            </button>
          )}
        </div>
      </section>
    </form>
  );
}
