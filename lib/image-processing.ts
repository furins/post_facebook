"use client";

export type FaceRegion = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  selected: boolean;
};

export type ProcessedImage = {
  blob: Blob;
  width: number;
  height: number;
};

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
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.55,
      });
    })();
  }
  return detectorPromise;
}

export async function detectFaces(source: Blob): Promise<FaceRegion[]> {
  const detector = await getFaceDetector();
  const bitmap = await createImageBitmap(source);
  const result = detector.detect(bitmap);
  bitmap.close();

  return result.detections.flatMap((detection, index) => {
    const box = detection.boundingBox;
    if (!box) return [];
    return [
      {
        id: `${Date.now()}-${index}`,
        x: box.originX,
        y: box.originY,
        width: box.width,
        height: box.height,
        confidence: detection.categories[0]?.score ?? 0,
        selected: true,
      },
    ];
  });
}
