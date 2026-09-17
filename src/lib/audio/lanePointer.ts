/**
 * Maps a pointer Y to the contiguous set of speaker lanes it spans.
 * Lane bounds come from the timeline stack; pointer-move does not walk the document.
 */
export type LaneBounds = { id: string; top: number; bottom: number };

export const LANE_BOUNDS_KEY = "laneBounds";

export function trackIdsForPointerY({
  lanes,
  originId,
  clientY,
}: {
  lanes: LaneBounds[];
  originId: string;
  clientY: number;
}): string[] {
  const origin = lanes.findIndex((lane) => lane.id === originId);
  if (origin < 0) return [originId];
  const target = lanes.findIndex((lane) => clientY >= lane.top && clientY <= lane.bottom);
  if (target < 0) return [originId];
  const from = Math.min(origin, target);
  const to = Math.max(origin, target);
  return lanes.slice(from, to + 1).map((lane) => lane.id);
}
