"use client";

import {
  AlertTriangle,
  Check,
  Clipboard,
  Facebook,
  Instagram,
  LoaderCircle,
  Mail,
  MessageCircleMore,
  Send,
  Sparkles,
} from "lucide-react";
import { FormEvent, useCallback, useMemo, useState } from "react";
import { MediaEditor, type MediaItem } from "@/components/media-editor";
import type { SocialPlatform, SocialTone } from "@/lib/social-prompt";

type Props = {
  mandatoryHashtags: string[];
  submissionRecipient: string;
  senderEmail: string;
  submissionMaxMb: number;
};

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
  mandatoryHashtags,
  submissionRecipient,
  senderEmail,
  submissionMaxMb,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState<SocialPlatform>("both");
  const [tone, setTone] = useState<SocialTone>("coinvolgente");
  const [mediaValid, setMediaValid] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [enhancedText, setEnhancedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const totalMediaBytes = useMemo(
    () => mediaItems.reduce((total, item) => total + item.blob.size, 0),
    [mediaItems],
  );
  const mediaWithinEmailLimit =
    totalMediaBytes <= submissionMaxMb * 1024 * 1024;

  const invalidateDraft = () => {
    setEnhancedText("");
    setSent(false);
    setSendError(null);
  };

  const handleMediaChange = useCallback((items: MediaItem[]) => {
    setMediaItems(items);
    setSent(false);
    setSendError(null);
  }, []);

  const formValid = useMemo(
    () => title.trim().length >= 3 && description.trim().length >= 20 && mediaValid,
    [title, description, mediaValid],
  );

  const rewrite = async (event: FormEvent) => {
    event.preventDefault();
    if (!formValid) return;
    setLoading(true);
    setError(null);
    setEnhancedText("");

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, platform, tone }),
      });
      const result = (await response.json()) as {
        enhancedText?: string;
        error?: string;
      };
      if (!response.ok || !result.enhancedText) {
        throw new Error(result.error ?? "Rielaborazione non riuscita.");
      }
      setEnhancedText(result.enhancedText);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rielaborazione non riuscita.");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(enhancedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const sendPost = async () => {
    if (!formValid || !enhancedText.trim() || !mediaWithinEmailLimit || sending) return;
    setSending(true);
    setSendError(null);

    const body = new FormData();
    body.set("title", title.trim());
    body.set("text", enhancedText.trim());
    body.set("platform", platform);
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

  return (
    <form className="composer" onSubmit={rewrite}>
      <MediaEditor
        onValidityChange={setMediaValid}
        onMediaChange={handleMediaChange}
      />

      <section className="panel copy-section" aria-labelledby="copy-heading">
        <div className="section-heading">
          <div className="step-number coral">2</div>
          <div>
            <p className="eyebrow">Il racconto</p>
            <h2 id="copy-heading">Dai voce all’esperienza</h2>
            <p>Scrivi i fatti essenziali: l’assistente migliorerà forma e ritmo senza inventare dettagli.</p>
          </div>
        </div>

        <div className="field-grid">
          <label className="field full-width">
            <span>Titolo <em>obbligatorio</em></span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
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

          <fieldset className="choice-field">
            <legend>Dove vuoi pubblicare?</legend>
            <div className="segmented three">
              <button type="button" className={platform === "facebook" ? "active" : ""} onClick={() => { setPlatform("facebook"); invalidateDraft(); }}><Facebook size={17} /> Facebook</button>
              <button type="button" className={platform === "instagram" ? "active" : ""} onClick={() => { setPlatform("instagram"); invalidateDraft(); }}><Instagram size={17} /> Instagram</button>
              <button type="button" className={platform === "both" ? "active" : ""} onClick={() => { setPlatform("both"); invalidateDraft(); }}><MessageCircleMore size={17} /> Entrambi</button>
            </div>
          </fieldset>

          <fieldset className="choice-field">
            <legend>Tono del post</legend>
            <div className="segmented">
              {(["istituzionale", "coinvolgente", "celebrativo"] as SocialTone[]).map((value) => (
                <button key={value} type="button" className={tone === value ? "active" : ""} onClick={() => { setTone(value); invalidateDraft(); }}>{value}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="hashtag-note">
          <span>Hashtag sempre inclusi</span>
          <div>{mandatoryHashtags.map((tag) => <code key={tag}>{tag}</code>)}</div>
        </div>
      </section>

      <section className="panel ai-section" aria-labelledby="ai-heading">
        <div className="ai-copy">
          <div className="ai-icon"><Sparkles size={24} /></div>
          <div>
            <p className="eyebrow">Assistente editoriale</p>
            <h2 id="ai-heading">Trasforma la bozza in un post</h2>
            <p>DeepSeek V4 migliora il testo, aggiunge emoji misurate e hashtag coerenti.</p>
          </div>
        </div>
        <button className="button primary rewrite-button" type="submit" disabled={!formValid || loading}>
          {loading ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />}
          {loading ? "Sto preparando il post…" : "Migliora con l’AI"}
        </button>
        {!formValid && (
          <p className="form-hint">Aggiungi media con orientamento coerente, un titolo e almeno 20 caratteri di testo.</p>
        )}
        {error && <div className="inline-alert error" role="alert">{error}</div>}

        {enhancedText && (
          <div className="result-card">
            <div className="result-heading">
              <div><Check size={18} /><strong>Post pronto</strong></div>
              <button className="button secondary small" type="button" onClick={() => void copyText()}>
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
                {copied ? "Copiato" : "Copia testo"}
              </button>
            </div>
            <textarea
              aria-label="Testo rielaborato modificabile"
              value={enhancedText}
              onChange={(event) => {
                setEnhancedText(event.target.value);
                setSent(false);
              }}
              rows={12}
            />
            <p>Puoi ancora modificare il testo prima dell’invio alla redazione.</p>
          </div>
        )}
      </section>

      <section className="panel send-section" aria-labelledby="send-heading">
        <div className="section-heading">
          <div className="step-number">3</div>
          <div>
            <p className="eyebrow">Consegna alla redazione</p>
            <h2 id="send-heading">Invia il contenuto completo</h2>
            <p>Il testo pronto e i media elaborati saranno inviati tramite email.</p>
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
              <strong>{(totalMediaBytes / 1024 / 1024).toFixed(1)} di {submissionMaxMb} MB</strong>
            </span>
          </div>
        </div>

        {!mediaWithinEmailLimit && (
          <div className="inline-alert error" role="alert">
            <AlertTriangle size={17} />
            Riduci il numero o la dimensione dei media: l’email può contenere al massimo {submissionMaxMb} MB di allegati.
          </div>
        )}
        {!enhancedText && (
          <p className="form-hint">Prima prepara il post con l’assistente editoriale.</p>
        )}
        {sendError && <div className="inline-alert error" role="alert">{sendError}</div>}
        {sent ? (
          <div className="send-success" role="status">
            <Check size={22} />
            <div>
              <strong>Contenuto inviato</strong>
              <span>L’email è stata consegnata a {submissionRecipient} con copia a {senderEmail}.</span>
            </div>
          </div>
        ) : (
          <button
            className="button primary send-button"
            type="button"
            onClick={() => void sendPost()}
            disabled={
              !formValid ||
              !enhancedText.trim() ||
              !submissionRecipient ||
              !mediaWithinEmailLimit ||
              sending
            }
          >
            {sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
            {sending ? "Invio in corso…" : "Invia alla redazione"}
          </button>
        )}
      </section>
    </form>
  );
}
