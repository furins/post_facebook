import { cp, mkdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = process.cwd();
const wasmSource = path.join(
  root,
  "node_modules",
  "@mediapipe",
  "tasks-vision",
  "wasm",
);
const wasmTarget = path.join(root, "public", "mediapipe", "wasm");
const modelTarget = path.join(
  root,
  "public",
  "models",
  "blaze_face_short_range.tflite",
);
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

await mkdir(wasmTarget, { recursive: true });
await mkdir(path.dirname(modelTarget), { recursive: true });
await cp(wasmSource, wasmTarget, { recursive: true, force: true });

try {
  await access(modelTarget, constants.R_OK);
} catch {
  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Impossibile scaricare il modello MediaPipe (${response.status})`);
  }
  await writeFile(modelTarget, Buffer.from(await response.arrayBuffer()));
}

console.log("Asset MediaPipe pronti.");
