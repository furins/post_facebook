export type Orientation = "landscape" | "portrait" | "square";

export function getOrientation(width: number, height: number): Orientation {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

export function validateImageOrientations(
  dimensions: Array<{ width: number; height: number }>,
) {
  const orientations = dimensions.map(({ width, height }) =>
    getOrientation(width, height),
  );
  const directional = new Set(
    orientations.filter((value) => value !== "square"),
  );

  return {
    valid: directional.size <= 1,
    orientation:
      directional.size === 1
        ? ([...directional][0] as Orientation)
        : directional.size === 0 && orientations.length
          ? "square"
          : null,
  };
}
