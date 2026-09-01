import { describe, expect, it } from "vitest";
import { getOrientation, validateImageOrientations } from "./media-utils";

describe("media orientation", () => {
  it("classifies image dimensions", () => {
    expect(getOrientation(1600, 900)).toBe("landscape");
    expect(getOrientation(900, 1600)).toBe("portrait");
    expect(getOrientation(1000, 1000)).toBe("square");
  });

  it("rejects mixed portrait and landscape images", () => {
    expect(
      validateImageOrientations([
        { width: 1600, height: 900 },
        { width: 900, height: 1600 },
      ]).valid,
    ).toBe(false);
  });

  it("allows square images alongside one direction", () => {
    expect(
      validateImageOrientations([
        { width: 1080, height: 1080 },
        { width: 1920, height: 1080 },
      ]).valid,
    ).toBe(true);
  });
});
