"use client";

import {
  AlertTriangle,
  Check,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  ImagePlus,
  LoaderCircle,
  RotateCw,
  ScanFace,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FaceRegion,
  blurFaceRegions,
  cropImageSquare,
  detectFaces,
  rotateImage,
} from "@/lib/image-processing";
import {
  ACCEPTED_MEDIA,
  MAX_IMAGE_SIZE,
  MAX_MEDIA_ITEMS,
  MAX_VIDEO_SIZE,
} from "@/lib/constants";
import { getOrientation, validateImageOrientations } from "@/lib/media-utils";

export type MediaItem = {
  id: string;
  name: string;
  kind: "image" | "video";
  mimeType: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  faces: FaceRegion[];
  faceStatus: "idle" | "detecting" | "done" | "error";
  busy: boolean;
};

type Props = {
  onValidityChange?: (valid: boolean) => void;
  onMediaChange?: (items: MediaItem[]) => void;
};

function loadVideoDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      video.src = "";
    };
    video.onerror = () => reject(new Error("Formato video non leggibile"));
    video.src = url;
  });
}

function outputName(item: MediaItem) {
  const base = item.name.replace(/\.[^.]+$/, "");
  const extension = item.mimeType === "image/png" ? "png" : "jpg";
  return `${base}-social.${extension}`;
}

export function MediaEditor({ onValidityChange, onMediaChange }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const imageItems = items.filter((item) => item.kind === "image");
  const orientation = useMemo(
    () =>
      validateImageOrientations(
        imageItems.map(({ width, height }) => ({ width, height })),
      ),
    [imageItems],
  );

  const updateItem = (id: string, update: Partial<MediaItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  };

  const replaceImage = (
    item: MediaItem,
    result: { blob: Blob; width: number; height: number },
  ) => {
    URL.revokeObjectURL(item.url);
    updateItem(item.id, {
      ...result,
      url: URL.createObjectURL(result.blob),
      faces: [],
      faceStatus: "idle",
      busy: false,
    });
  };

  const addFiles = async (files: File[]) => {
    setNotice(null);
    const available = MAX_MEDIA_ITEMS - items.length;
    if (available <= 0) {
      setNotice(`Puoi caricare al massimo ${MAX_MEDIA_ITEMS} contenuti.`);
      return;
    }

    const accepted = files.slice(0, available);
    const rejected: string[] = [];

    for (const file of accepted) {
      const kind = file.type.startsWith("image/") ? "image" : "video";
      const sizeLimit = kind === "image" ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
      if (!ACCEPTED_MEDIA.includes(file.type) || file.size > sizeLimit) {
        rejected.push(file.name);
        continue;
      }

      const url = URL.createObjectURL(file);
      try {
        const dimensions =
          kind === "image"
            ? await createImageBitmap(file).then((bitmap) => {
                const value = { width: bitmap.width, height: bitmap.height };
                bitmap.close();
                return value;
              })
            : await loadVideoDimensions(url);

        setItems((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            name: file.name,
            kind,
            mimeType: file.type,
            blob: file,
            url,
            ...dimensions,
            faces: [],
            faceStatus: "idle",
            busy: false,
          },
        ]);
      } catch {
        URL.revokeObjectURL(url);
        rejected.push(file.name);
      }
    }

    if (files.length > available) rejected.push("altri file oltre il limite");
    if (rejected.length) {
      setNotice(`Non è stato possibile aggiungere: ${rejected.join(", ")}.`);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const removeItem = (item: MediaItem) => {
    URL.revokeObjectURL(item.url);
    setItems((current) => current.filter(({ id }) => id !== item.id));
  };

  const rotate = async (item: MediaItem) => {
    updateItem(item.id, { busy: true });
    try {
      replaceImage(item, await rotateImage(item.blob, item.mimeType));
    } catch {
      updateItem(item.id, { busy: false });
      setNotice(`Rotazione di ${item.name} non riuscita.`);
    }
  };

  const cropAll = async () => {
    setGlobalBusy(true);
    setNotice(null);
    try {
      for (const current of imageItems) {
        const result = await cropImageSquare(current.blob, current.mimeType);
        const latest = items.find(({ id }) => id === current.id) ?? current;
        replaceImage(latest, result);
      }
    } catch {
      setNotice("Il ritaglio quadrato non è riuscito per una o più immagini.");
    } finally {
      setGlobalBusy(false);
    }
  };

  const scanFaces = async (item: MediaItem) => {
    updateItem(item.id, { faceStatus: "detecting" });
    try {
      const faces = await detectFaces(item.blob);
      updateItem(item.id, { faces, faceStatus: "done" });
    } catch {
      updateItem(item.id, { faceStatus: "error" });
      setNotice(
        "Rilevamento volti non disponibile. Verifica che gli asset MediaPipe siano installati.",
      );
    }
  };

  const toggleFace = (item: MediaItem, faceId: string) => {
    updateItem(item.id, {
      faces: item.faces.map((face) =>
        face.id === faceId ? { ...face, selected: !face.selected } : face,
      ),
    });
  };

  const selectAllFaces = (item: MediaItem, selected: boolean) => {
    updateItem(item.id, {
      faces: item.faces.map((face) => ({ ...face, selected })),
    });
  };

  const blurFaces = async (item: MediaItem) => {
    if (!item.faces.some((face) => face.selected)) return;
    updateItem(item.id, { busy: true });
    try {
      replaceImage(
        item,
        await blurFaceRegions(item.blob, item.mimeType, item.faces),
      );
    } catch {
      updateItem(item.id, { busy: false });
      setNotice(`Sfocatura dei volti in ${item.name} non riuscita.`);
    }
  };

  const allValid = items.length > 0 && orientation.valid;
  useEffect(() => {
    onValidityChange?.(allValid);
  }, [allValid, onValidityChange]);

  useEffect(() => {
    onMediaChange?.(items);
  }, [items, onMediaChange]);

  return (
    <section className="panel media-section" aria-labelledby="media-heading">
      <div className="section-heading">
        <div className="step-number">1</div>
        <div>
          <p className="eyebrow">Contenuti visivi</p>
          <h2 id="media-heading">Aggiungi foto e video</h2>
          <p>Le elaborazioni delle immagini avvengono solo in questo browser.</p>
        </div>
      </div>

      <div
        className={`drop-zone ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="upload-icon"><ImagePlus size={26} /></div>
        <strong>Trascina qui foto e video</strong>
        <span>JPG, PNG, WebP, MP4, WebM o MOV · massimo {MAX_MEDIA_ITEMS} file</span>
        <button className="button secondary" type="button" onClick={() => inputRef.current?.click()}>
          Scegli dal dispositivo
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          onChange={onInput}
        />
      </div>

      {notice && <div className="inline-alert error"><AlertTriangle size={17} />{notice}</div>}

      {items.length > 0 && (
        <>
          <div className="media-toolbar">
            <div className={`orientation-status ${orientation.valid ? "valid" : "invalid"}`}>
              {orientation.valid ? <Check size={17} /> : <AlertTriangle size={17} />}
              {imageItems.length === 0
                ? "Nessuna foto da controllare"
                : orientation.valid
                  ? `Orientamento coerente: ${orientation.orientation === "landscape" ? "orizzontale" : orientation.orientation === "portrait" ? "verticale" : "quadrato"}`
                  : "Foto verticali e orizzontali mescolate"}
            </div>
            {imageItems.length > 0 && (
              <button className="button ghost" type="button" onClick={() => void cropAll()} disabled={globalBusy}>
                {globalBusy ? <LoaderCircle className="spin" size={17} /> : <Crop size={17} />}
                Ritaglia tutte 1:1
              </button>
            )}
          </div>

          {!orientation.valid && (
            <div className="inline-alert warning">
              <AlertTriangle size={17} />
              Ruota le foto non coerenti oppure usa “Ritaglia tutte 1:1” prima di completare il post.
            </div>
          )}

          <div className="media-grid">
            {items.map((item, index) => {
              const selectedCount = item.faces.filter((face) => face.selected).length;
              return (
                <article className="media-card" key={item.id}>
                  <div className="preview-wrap">
                    {item.kind === "image" ? (
                      // blob URLs are local previews and cannot use next/image optimization.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={`Anteprima ${item.name}`} />
                    ) : (
                      <video src={item.url} controls preload="metadata" />
                    )}
                    <span className="media-index">{index + 1}</span>
                    {item.kind === "video" && <span className="video-badge"><FileVideo size={14} /> Video</span>}
                    {item.faces.map((face, faceIndex) => (
                      <button
                        key={face.id}
                        type="button"
                        className={`face-box ${face.selected ? "selected" : ""}`}
                        style={{
                          left: `${(face.x / item.width) * 100}%`,
                          top: `${(face.y / item.height) * 100}%`,
                          width: `${(face.width / item.width) * 100}%`,
                          height: `${(face.height / item.height) * 100}%`,
                        }}
                        onClick={() => toggleFace(item, face.id)}
                        aria-label={`${face.selected ? "Deseleziona" : "Seleziona"} volto ${faceIndex + 1}`}
                      >
                        <span>{face.selected ? <Check size={13} /> : faceIndex + 1}</span>
                      </button>
                    ))}
                    {item.busy && <div className="busy-overlay"><LoaderCircle className="spin" />Elaborazione…</div>}
                  </div>

                  <div className="media-card-body">
                    <div className="media-meta">
                      <strong title={item.name}>{item.name}</strong>
                      <span>{item.width} × {item.height} · {getOrientation(item.width, item.height) === "landscape" ? "orizzontale" : getOrientation(item.width, item.height) === "portrait" ? "verticale" : "quadrata"}</span>
                    </div>

                    {item.kind === "image" && (
                      <div className="face-panel">
                        {item.faceStatus === "idle" && (
                          <button className="button small face-action" type="button" onClick={() => void scanFaces(item)}>
                            <ScanFace size={16} /> Identifica i volti
                          </button>
                        )}
                        {item.faceStatus === "detecting" && <span className="detecting"><LoaderCircle className="spin" size={16} /> Ricerca volti…</span>}
                        {item.faceStatus === "error" && (
                          <button className="button small face-action" type="button" onClick={() => void scanFaces(item)}>
                            <ScanFace size={16} /> Riprova
                          </button>
                        )}
                        {item.faceStatus === "done" && item.faces.length === 0 && (
                          <span className="no-faces"><EyeOff size={15} /> Nessun volto trovato</span>
                        )}
                        {item.faces.length > 0 && (
                          <>
                            <div className="face-summary">
                              <span><Eye size={15} /> {item.faces.length} {item.faces.length === 1 ? "volto" : "volti"}</span>
                              <button type="button" onClick={() => selectAllFaces(item, selectedCount !== item.faces.length)}>
                                {selectedCount === item.faces.length ? "Deseleziona tutti" : "Seleziona tutti"}
                              </button>
                            </div>
                            <button className="button small blur-action" type="button" disabled={!selectedCount || item.busy} onClick={() => void blurFaces(item)}>
                              <WandSparkles size={16} /> Sfoca selezionati ({selectedCount})
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <div className="card-actions">
                      {item.kind === "image" && (
                        <>
                          <button type="button" title="Ruota di 90 gradi" disabled={item.busy} onClick={() => void rotate(item)}><RotateCw size={17} /><span>Ruota</span></button>
                          <a href={item.url} download={outputName(item)} title="Scarica immagine elaborata"><Download size={17} /><span>Scarica</span></a>
                        </>
                      )}
                      <button className="danger-action" type="button" onClick={() => removeItem(item)}><Trash2 size={17} /><span>Rimuovi</span></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
