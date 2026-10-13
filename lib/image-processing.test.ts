import { describe, expect, it } from "vitest";
import {
  deduplicateFaceRegions,
  faceScanPlan,
  shouldScanFaceTiles,
  type FaceRegion,
} from "./image-processing";

function face(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  confidence: number,
): FaceRegion {
  return { id, x, y, width, height, confidence, selected: true };
}

describe("face detection post-processing", () => {
  it("scans low-resolution group photos with enlarged overlapping tiles", () => {
    const plan = faceScanPlan(531, 376);
    expect(plan.tileWidth).toBe(177);
    expect(plan.tileHeight).toBe(125);
    expect(plan.outputScale).toBe(2);
    expect(plan.offsets).toHaveLength(5);
  });

  it("plans enlarged tiles for narrow portrait photos", () => {
    expect(shouldScanFaceTiles(245, 450)).toBe(true);
    expect(shouldScanFaceTiles(120, 180)).toBe(false);
    const plan = faceScanPlan(245, 450);
    expect(plan.tileWidth).toBe(82);
    expect(plan.tileHeight).toBe(150);
    expect(plan.outputScale).toBe(2);
    expect(plan.offsets).toHaveLength(5);
  });

  it("keeps the strongest result when scans find the same face", () => {
    const result = deduplicateFaceRegions([
      face("full-image", 100, 100, 80, 80, 0.72),
      face("tile", 104, 103, 76, 78, 0.91),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["tile"]);
  });

  it("does not merge nearby but distinct faces", () => {
    const result = deduplicateFaceRegions([
      face("left", 100, 100, 70, 70, 0.8),
      face("right", 160, 100, 70, 70, 0.75),
    ]);

    expect(result).toHaveLength(2);
  });
});
