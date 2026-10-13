"use client";

export type FaceRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  selected: boolean;
  manual?: boolean;
};

export type ProcessedImage = {
  blob: Blob;
  width: number;
  height: number;
};

const SMALL_FACE_SCAN_MIN_SIDE = 200;
const LOW_RESOLUTION_MAX_SIDE = 600;
const DETECTION_CANVAS_MAX_SIDE = 1024;
const DUPLICATE_OVERLAP_THRESHOLD = 0.55;

export function shouldScanFaceTiles(width: number, height: number) {
  return Math.min(width, height) >= SMALL_FACE_SCAN_MIN_SIDE;
}

export function faceScanPlan(width: number, height: number) {
  const lowResolution = Math.min(width, height) < LOW_RESOLUTION_MAX_SIDE;
  const tileRatio = lowResolution ? 1 / 3 : 0.5;
  const tileWidth = Math.round(width * tileRatio);
  const tileHeight = Math.round(height * tileRatio);
  const outputScale = Math.min(
    lowResolution ? 2 : 1,
    DETECTION_CANVAS_MAX_SIDE / Math.max(tileWidth, tileHeight),
  );
  const steps = lowResolution ? 4 : 2;
  const offsets = Array.from(
    { length: steps + 1 },
    (_, index) => (1 - tileRatio) * index / steps,
  );
  return { tileWidth, tileHeight, outputScale, offsets };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Conversione immagine fallita"))),
      type === "image/png" ? "image/png" : "image/jpeg",
      0.92,
    );
  });
}

export async function rotateImage(
  source: Blob,
  mimeType: string,
): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas non disponibile");

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(Math.PI / 2);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  return {
    blob: await canvasToBlob(canvas, mimeType),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function cropImageSquare(
  source: Blob,
  mimeType: string,
): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(source);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = (bitmap.width - side) / 2;
  const sourceY = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas non disponibile");

  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, side, side);
  bitmap.close();

  return {
    blob: await canvasToBlob(canvas, mimeType),
    width: side,
    height: side,
  };
}

export async function blurFaceRegions(
  source: Blob,
  mimeType: string,
  faces: FaceRegion[],
): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas non disponibile");

  context.drawImage(bitmap, 0, 0);
  const blurRadius = Math.max(14, Math.round(Math.min(bitmap.width, bitmap.height) * 0.018));

  for (const face of faces.filter((item) => item.selected)) {
    const paddingX = face.width * 0.22;
    const paddingY = face.height * 0.25;
    const x = Math.max(0, face.x - paddingX);
    const y = Math.max(0, face.y - paddingY);
    const width = Math.min(bitmap.width - x, face.width + paddingX * 2);
    const height = Math.min(bitmap.height - y, face.height + paddingY * 2);

    context.save();
    context.beginPath();
    context.ellipse(
      x + width / 2,
      y + height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.clip();
    context.filter = `blur(${blurRadius}px)`;
    context.drawImage(bitmap, 0, 0);
    context.restore();
  }

  bitmap.close();
  return {
    blob: await canvasToBlob(canvas, mimeType),
    width: canvas.width,
    height: canvas.height,
  };
}

let detectorPromise: Promise<import("@mediapipe/tasks-vision").FaceDetector> | null = null;

async function getFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/blaze_face_short_range.tflite",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.35,
        minSuppressionThreshold: 0.3,
      });
    })().catch((error) => {
      // A failed initialization must not poison all subsequent retry attempts.
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

function overlapOnSmallerRegion(first: FaceRegion, second: FaceRegion) {
  const intersectionWidth = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const smallerArea = Math.min(
    first.width * first.height,
    second.width * second.height,
  );
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

export function deduplicateFaceRegions(faces: FaceRegion[]) {
  const kept: FaceRegion[] = [];
  for (const face of [...faces].sort(
    (first, second) => second.confidence - first.confidence,
  )) {
    if (
      !kept.some(
        (candidate) =>
          overlapOnSmallerRegion(face, candidate) >=
          DUPLICATE_OVERLAP_THRESHOLD,
      )
    ) {
      kept.push(face);
    }
  }
  return kept;
}

function regionsFromDetection(
  result: ReturnType<import("@mediapipe/tasks-vision").FaceDetector["detect"]>,
  sourceWidth: number,
  sourceHeight: number,
  offsetX = 0,
  offsetY = 0,
  scaleX = 1,
  scaleY = 1,
) {
  return result.detections.flatMap((detection, index): FaceRegion[] => {
    const box = detection.boundingBox;
    if (!box) return [];
    const x = Math.max(0, offsetX + box.originX * scaleX);
    const y = Math.max(0, offsetY + box.originY * scaleY);
    const right = Math.min(
      sourceWidth,
      offsetX + (box.originX + box.width) * scaleX,
    );
    const bottom = Math.min(
      sourceHeight,
      offsetY + (box.originY + box.height) * scaleY,
    );
    if (right <= x || bottom <= y) return [];
    return [
      {
        id: `candidate-${index}-${offsetX}-${offsetY}`,
        x,
        y,
        width: right - x,
        height: bottom - y,
        confidence: detection.categories[0]?.score ?? 0,
        selected: true,
      },
    ];
  });
}

export async function detectFaces(source: Blob): Promise<FaceRegion[]> {
  const detector = await getFaceDetector();
  const bitmap = await createImageBitmap(source);
  const candidates: FaceRegion[] = [];
  try {
    candidates.push(
      ...regionsFromDetection(
        detector.detect(bitmap),
        bitmap.width,
        bitmap.height,
      ),
    );

    if (shouldScanFaceTiles(bitmap.width, bitmap.height)) {
      const { tileWidth, tileHeight, outputScale, offsets } = faceScanPlan(
        bitmap.width,
        bitmap.height,
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(tileWidth * outputScale));
      canvas.height = Math.max(1, Math.round(tileHeight * outputScale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas non disponibile");

      for (const yRatio of offsets) {
        for (const xRatio of offsets) {
          const sourceX = Math.min(
            bitmap.width - tileWidth,
            Math.round(bitmap.width * xRatio),
          );
          const sourceY = Math.min(
            bitmap.height - tileHeight,
            Math.round(bitmap.height * yRatio),
          );
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(
            bitmap,
            sourceX,
            sourceY,
            tileWidth,
            tileHeight,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          candidates.push(
            ...regionsFromDetection(
              detector.detect(canvas),
              bitmap.width,
              bitmap.height,
              sourceX,
              sourceY,
              tileWidth / canvas.width,
              tileHeight / canvas.height,
            ),
          );
        }
      }
    }
  } finally {
    bitmap.close();
  }

  const detectionId = Date.now();
  return deduplicateFaceRegions(candidates).map((face, index) => ({
    ...face,
    id: `${detectionId}-${index}`,
  }));
}
