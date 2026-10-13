"use client";

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CircleStop,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  ImagePlus,
  LoaderCircle,
  Plus,
  RotateCw,
  ScanFace,
  Trash2,
  Undo2,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  lastBlur?: ImageSnapshot;
};

type ImageSnapshot = {
  blob: Blob;
  width: number;
  height: number;
  faces: FaceRegion[];
  faceStatus: MediaItem["faceStatus"];
};

type ManualFaceDraft = {
  itemId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type Props = {
  onValidityChange?: (valid: boolean) => void;
  onMediaChange?: (items: MediaItem[]) => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
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

export function MediaEditor({
  onValidityChange,
  onMediaChange,
  onContinue,
  continueLabel = "Continua",
  continueDisabled = false,
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [manualFaceItemId, setManualFaceItemId] = useState<string | null>(null);
  const [manualFaceDraft, setManualFaceDraft] = useState<ManualFaceDraft | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const imageItems = items.filter((item) => item.kind === "image");
  const faceCount = imageItems.reduce((total, item) => total + item.faces.length, 0);
  const failedFaceChecks = imageItems.filter((item) => item.faceStatus === "error").length;
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
    const replacement = {
      ...item,
      ...result,
      url: URL.createObjectURL(result.blob),
      faces: [],
      faceStatus: "idle" as const,
      busy: false,
      lastBlur: undefined,
    };
    updateItem(item.id, replacement);
    if (manualFaceItemId === item.id) {
      setManualFaceItemId(null);
      setManualFaceDraft(null);
    }
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

        const newItem: MediaItem = {
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
        };
        setItems((current) => [...current, newItem]);
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

  const closeCamera = () => {
    if (recorderRef.current?.state === "recording") return;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    recorderRef.current = null;
    setCameraStream(null);
    setCameraError(null);
    setRecording(false);
  };

  const openCamera = async () => {
    setCameraError(null);
    setNotice(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "La fotocamera non è disponibile in questo browser. Verifica di usare HTTPS oppure scegli un file dal dispositivo.",
      );
      return;
    }

    try {
      let stream: MediaStream;
      const video = {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (error) {
      setCameraError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Permesso negato. Consenti l’accesso alla fotocamera nelle impostazioni del browser e riprova."
          : "Non è stato possibile avviare la fotocamera. Verifica che non sia già utilizzata da un’altra applicazione.",
      );
    }
  };

  const takePhoto = async () => {
    const video = cameraVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraError("L’anteprima della fotocamera non è ancora pronta.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setCameraError("Non è stato possibile acquisire la foto.");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await addFiles([
      new File([blob], `foto-${stamp}.jpg`, { type: "image/jpeg" }),
    ]);
  };

  const startRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setCameraError("La registrazione video non è supportata da questo browser.");
      return;
    }
    const supportedMimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));

    try {
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const isMp4 = recorder.mimeType.startsWith("video/mp4");
        const mimeType = isMp4 ? "video/mp4" : "video/webm";
        const extension = isMp4 ? "mp4" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        void (async () => {
          if (blob.size > 0) {
            await addFiles([
              new File([blob], `video-${stamp}.${extension}`, { type: mimeType }),
            ]);
          }
          setRecording(false);
          recorderRef.current = null;
        })();
      };
      recorder.onerror = () => {
        setRecording(false);
        recorderRef.current = null;
        setCameraError("La registrazione video si è interrotta in modo inatteso.");
      };
      recorderRef.current = recorder;
      setCameraError(null);
      recorder.start(1000);
      setRecording(true);
    } catch {
      recorderRef.current = null;
      setRecording(false);
      setCameraError("Non è stato possibile avviare la registrazione video.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
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
    if (manualFaceItemId === item.id) {
      setManualFaceItemId(null);
      setManualFaceDraft(null);
    }
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
      const detectedFaces = await detectFaces(item.blob);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id && currentItem.blob === item.blob
            ? {
                ...currentItem,
                faces: [
                  ...currentItem.faces.filter((face) => face.manual),
                  ...detectedFaces,
                ],
                faceStatus: "done",
              }
            : currentItem,
        ),
      );
    } catch {
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id && currentItem.blob === item.blob
            ? { ...currentItem, faceStatus: "error" }
            : currentItem,
        ),
      );
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

  const removeUnselectedFaces = (item: MediaItem) => {
    setItems((current) =>
      current.map((currentItem) => {
        if (currentItem.id !== item.id) return currentItem;
        const faces = currentItem.faces.filter((face) => face.selected);
        return {
          ...currentItem,
          faces,
          faceStatus: faces.length === 0 ? "idle" : currentItem.faceStatus,
        };
      }),
    );
  };

  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const beginManualFace = (
    item: MediaItem,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (manualFaceItemId !== item.id || item.busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event);
    setManualFaceDraft({
      itemId: item.id,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const moveManualFace = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!manualFaceDraft) return;
    event.preventDefault();
    const point = pointerPosition(event);
    setManualFaceDraft((current) =>
      current
        ? { ...current, currentX: point.x, currentY: point.y }
        : current,
    );
  };

  const finishManualFace = (
    item: MediaItem,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!manualFaceDraft || manualFaceDraft.itemId !== item.id) return;
    event.preventDefault();
    const point = pointerPosition(event);
    const left = Math.min(manualFaceDraft.startX, point.x);
    const top = Math.min(manualFaceDraft.startY, point.y);
    const width = Math.abs(point.x - manualFaceDraft.startX);
    const height = Math.abs(point.y - manualFaceDraft.startY);
    setManualFaceDraft(null);

    // Ignore accidental taps while still accepting small faces in group photos.
    if (width < 0.02 || height < 0.02) return;

    const face: FaceRegion = {
      id: crypto.randomUUID(),
      x: left * item.width,
      y: top * item.height,
      width: width * item.width,
      height: height * item.height,
      confidence: 1,
      selected: true,
      manual: true,
    };
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, faces: [...currentItem.faces, face] }
          : currentItem,
      ),
    );
  };

  const toggleManualFaceMode = (itemId: string) => {
    setManualFaceDraft(null);
    setManualFaceItemId((current) => (current === itemId ? null : itemId));
  };

  const blurFaces = async (item: MediaItem) => {
    if (!item.faces.some((face) => face.selected)) return;
    updateItem(item.id, { busy: true });
    try {
      const result = await blurFaceRegions(item.blob, item.mimeType, item.faces);
      const snapshot: ImageSnapshot = {
        blob: item.blob,
        width: item.width,
        height: item.height,
        faces: item.faces,
        faceStatus: item.faceStatus,
      };
      URL.revokeObjectURL(item.url);
      updateItem(item.id, {
        ...result,
        url: URL.createObjectURL(result.blob),
        faces: [],
        faceStatus: "idle",
        busy: false,
        lastBlur: snapshot,
      });
      if (manualFaceItemId === item.id) {
        setManualFaceItemId(null);
        setManualFaceDraft(null);
      }
    } catch {
      updateItem(item.id, { busy: false });
      setNotice(`Sfocatura dei volti in ${item.name} non riuscita.`);
    }
  };

  const undoBlur = (item: MediaItem) => {
    if (!item.lastBlur || item.busy) return;
    URL.revokeObjectURL(item.url);
    updateItem(item.id, {
      blob: item.lastBlur.blob,
      width: item.lastBlur.width,
      height: item.lastBlur.height,
      url: URL.createObjectURL(item.lastBlur.blob),
      faces: item.lastBlur.faces,
      faceStatus: item.lastBlur.faceStatus,
      lastBlur: undefined,
    });
  };

  const allValid = orientation.valid;
  useEffect(() => {
    onValidityChange?.(allValid);
  }, [allValid, onValidityChange]);

  useEffect(() => {
    onMediaChange?.(items);
  }, [items, onMediaChange]);

  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(
    () => () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return (
    <section className="panel media-section" aria-labelledby="media-heading">
      <div className="section-heading">
        <div className="step-number">1</div>
        <div>
          <p className="eyebrow">Contenuti visivi</p>
          <h2 id="media-heading">Aggiungi foto e video</h2>
          <p>I contenuti visivi sono facoltativi. Se li aggiungi, preferisci immagini nitide e luminose.
            Quando possibile, scegli immagini ordinate e rappresentative dell’attività.</p>
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
        <div className="upload-actions">
          <button className="button secondary" type="button" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={17} /> Scegli dalla galleria
          </button>
          <button className="button secondary" type="button" onClick={() => void openCamera()}>
            <Camera size={17} /> Usa la fotocamera
          </button>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          onChange={onInput}
        />
      </div>

      {cameraError && <div className="inline-alert error" role="alert"><AlertTriangle size={17} />{cameraError}</div>}

      {cameraStream && (
        <section className="camera-capture" aria-label="Acquisizione dalla fotocamera">
          <div className="camera-heading">
            <div>
              <strong>Fotocamera in tempo reale</strong>
              <span>Scatta una foto oppure registra un video.</span>
            </div>
            <button className="icon-button" type="button" aria-label="Chiudi la fotocamera" title="Chiudi la fotocamera" disabled={recording} onClick={closeCamera}><X size={18} /></button>
          </div>

          <div className="camera-modes" role="group" aria-label="Tipo di acquisizione">
            <button type="button" className={cameraMode === "photo" ? "active" : ""} aria-pressed={cameraMode === "photo"} disabled={recording} onClick={() => setCameraMode("photo")}><Camera size={17} /> Foto</button>
            <button type="button" className={cameraMode === "video" ? "active" : ""} aria-pressed={cameraMode === "video"} disabled={recording} onClick={() => setCameraMode("video")}><Video size={17} /> Video</button>
          </div>

          <div className="camera-preview">
            <video ref={cameraVideoRef} autoPlay playsInline muted />
            {recording && <span className="recording-indicator"><span /> Registrazione in corso</span>}
          </div>

          <div className="camera-controls">
            {cameraMode === "photo" ? (
              <button className="button primary" type="button" onClick={() => void takePhoto()}><Camera size={18} /> Scatta foto</button>
            ) : recording ? (
              <button className="button camera-stop" type="button" onClick={stopRecording}><CircleStop size={18} /> Termina registrazione</button>
            ) : (
              <button className="button primary" type="button" onClick={startRecording}><Video size={18} /> Avvia registrazione</button>
            )}
          </div>
          <p className="camera-note">La registrazione include l’audio quando il microfono è disponibile e autorizzato.</p>
        </section>
      )}

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

          <div className="media-grid">
            {items.map((item, index) => {
              const selectedCount = item.faces.filter((face) => face.selected).length;
              const unselectedCount = item.faces.length - selectedCount;
              const isMarkingFaces = manualFaceItemId === item.id;
              const draft = manualFaceDraft?.itemId === item.id
                ? {
                    left: Math.min(manualFaceDraft.startX, manualFaceDraft.currentX),
                    top: Math.min(manualFaceDraft.startY, manualFaceDraft.currentY),
                    width: Math.abs(manualFaceDraft.currentX - manualFaceDraft.startX),
                    height: Math.abs(manualFaceDraft.currentY - manualFaceDraft.startY),
                  }
                : null;
              return (
                <article className="media-card" key={item.id}>
                  <div className="preview-wrap">
                    {item.kind === "image" ? (
                      <div
                        className={`image-stage ${isMarkingFaces ? "manual-marking" : ""}`}
                        onPointerDown={(event) => beginManualFace(item, event)}
                        onPointerMove={moveManualFace}
                        onPointerUp={(event) => finishManualFace(item, event)}
                        onPointerCancel={() => setManualFaceDraft(null)}
                      >
                        {/* blob URLs are local previews and cannot use next/image optimization. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={`Anteprima ${item.name}`}
                          draggable={false}
                        />
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
                        {draft && (
                          <span
                            className="manual-face-draft"
                            style={{
                              left: `${draft.left * 100}%`,
                              top: `${draft.top * 100}%`,
                              width: `${draft.width * 100}%`,
                              height: `${draft.height * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <video src={item.url} controls preload="metadata" />
                    )}
                    <span className="media-index">{index + 1}</span>
                    {item.kind === "video" && <span className="video-badge"><FileVideo size={14} /> Video</span>}
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
                        <button
                          className={`button small manual-face-action ${isMarkingFaces ? "active" : ""}`}
                          type="button"
                          disabled={item.busy || item.faceStatus === "detecting"}
                          aria-pressed={isMarkingFaces}
                          onClick={() => toggleManualFaceMode(item.id)}
                        >
                          {isMarkingFaces ? <Check size={16} /> : <Plus size={16} />}
                          {isMarkingFaces ? "Termina inserimento" : "Marca un volto manualmente"}
                        </button>
                        {isMarkingFaces && (
                          <p className="manual-face-help">
                            Trascina un riquadro intorno a ogni volto non rilevato.
                          </p>
                        )}
                        {item.faces.length > 0 && (
                          <>
                            <div className="face-summary">
                              <span><Eye size={15} /> {item.faces.length} {item.faces.length === 1 ? "volto" : "volti"}</span>
                              <button type="button" onClick={() => selectAllFaces(item, selectedCount !== item.faces.length)}>
                                {selectedCount === item.faces.length ? "Deseleziona tutti" : "Seleziona tutti"}
                              </button>
                            </div>
                            <button className="button small remove-face-boxes" type="button" disabled={unselectedCount === 0 || item.busy} onClick={() => removeUnselectedFaces(item)}>
                              <Trash2 size={16} /> Rimuovi riquadri non selezionati ({unselectedCount})
                            </button>
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
                          {item.lastBlur && (
                            <button type="button" title="Annulla l’ultima sfocatura" disabled={item.busy} onClick={() => undoBlur(item)}><Undo2 size={17} /><span>Annulla sfocatura</span></button>
                          )}
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
          {!orientation.valid && (
            <div className="inline-alert warning orientation-help">
              <AlertTriangle size={17} />
              Ruota le foto non coerenti oppure usa “Ritaglia tutte 1:1” prima di completare il post.
            </div>
          )}
          {imageItems.length > 0 && (
            <div className="inline-alert warning face-help" role="status">
              <AlertTriangle size={17} />
              {faceCount > 0
                ? `${faceCount === 1 ? "È stato individuato un volto" : `Sono stati individuati ${faceCount} volti`} nelle foto. Controlla le immagini e sfoca i volti da non mostrare prima di continuare.`
                : "Le foto potrebbero contenere volti. Usa «Identifica i volti» o «Marca un volto manualmente» per controllarle e sfoca quelli da non mostrare prima di continuare."}
            </div>
          )}
          {failedFaceChecks > 0 && (
            <div className="inline-alert warning face-help" role="status">
              <AlertTriangle size={17} />
              Non è stato possibile controllare i volti in {failedFaceChecks === 1 ? "una foto" : `${failedFaceChecks} foto`}. Riprova nella scheda della foto o controllala visivamente.
            </div>
          )}
        </>
      )}

      {onContinue && (
        <div className="wizard-actions end">
          <button
            className="button primary"
            type="button"
            disabled={continueDisabled || recording}
            onClick={() => {
              closeCamera();
              onContinue();
            }}
          >
            {continueLabel} <ArrowRight size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
