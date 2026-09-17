export type MarkerType = "silence" | "cut";

export interface TimelineMarker {
  id: string;
  type: MarkerType;
  start: number;
  end: number;
  laneIds: string[];
}

function clone(marker: TimelineMarker): TimelineMarker {
  return { ...marker, laneIds: [...marker.laneIds] };
}

function lanesKey(laneIds: string[]): string {
  return [...laneIds].sort().join("\0");
}

function uniqueLanes(laneIds: string[]): string[] {
  return [...new Set(laneIds)];
}

/** Expand v2 per-track silences and shared cuts into one-lane silences plus all-lane cuts. */
export function markersFromV2(
  tracks: { id: string; manualSilences: { start: number; end: number }[] }[],
  cuts: { start: number; end: number }[],
  trackIds: string[],
): TimelineMarker[] {
  const list = new MarkerList(trackIds);
  for (const track of tracks) {
    for (const range of track.manualSilences) list.add("silence", range.start, range.end, [track.id]);
  }
  for (const range of cuts) list.add("cut", range.start, range.end, trackIds);
  return list.all();
}

/** One list of timeline marks: silence (one or more lanes) and cut (always every track). */
export class MarkerList {
  private trackIds: string[];
  private items: TimelineMarker[] = [];
  private nextId = 1;

  constructor(trackIds: string[] = []) {
    this.trackIds = [...trackIds];
  }

  setTrackIds(trackIds: string[]): void {
    this.trackIds = [...trackIds];
    const allowed = new Set(trackIds);
    this.items = this.items.flatMap((marker) => {
      const laneIds = marker.type === "cut" ? [...this.trackIds] : marker.laneIds.filter((id) => allowed.has(id));
      return laneIds.length ? [{ ...marker, laneIds }] : [];
    });
  }

  add(type: MarkerType, start: number, end: number, laneIds: string[]): void {
    if (end <= start) return;
    const lanes = type === "cut" ? [...this.trackIds] : uniqueLanes(laneIds);
    if (lanes.length === 0) return;
    this.mergeIn({
      id: `m${this.nextId++}`,
      type,
      start,
      end,
      laneIds: lanes,
    });
  }

  resize(id: string, edge: "start" | "end", time: number): void {
    const marker = this.items.find((item) => item.id === id);
    if (!marker) return;
    if (edge === "start") marker.start = Math.min(time, marker.end);
    else marker.end = Math.max(time, marker.start);
  }

  setType(id: string, type: MarkerType): void {
    const marker = this.items.find((item) => item.id === id);
    if (!marker) return;
    marker.type = type;
    if (type === "cut") marker.laneIds = [...this.trackIds];
    this.mergeOverlapping();
  }

  mergeOverlapping(): void {
    const source = this.items;
    this.items = [];
    for (const marker of source) this.mergeIn(marker);
  }

  subtract(type: MarkerType, start: number, end: number, laneIds: string[]): void {
    if (end <= start) return;
    const remove = new Set(laneIds);
    const next: TimelineMarker[] = [];
    for (const marker of this.items) {
      if (marker.type !== type) {
        next.push(marker);
        continue;
      }
      const hit = marker.laneIds.some((id) => remove.has(id));
      if (!hit || marker.end <= start || marker.start >= end) {
        next.push(marker);
        continue;
      }
      const keepLanes = marker.laneIds.filter((id) => !remove.has(id));
      if (marker.start < start) next.push({ ...clone(marker), id: `m${this.nextId++}`, end: start });
      if (marker.end > end) next.push({ ...clone(marker), id: `m${this.nextId++}`, start: end });
      const overlapStart = Math.max(marker.start, start);
      const overlapEnd = Math.min(marker.end, end);
      if (keepLanes.length && overlapEnd > overlapStart) {
        next.push({ ...clone(marker), id: `m${this.nextId++}`, start: overlapStart, end: overlapEnd, laneIds: keepLanes });
      }
    }
    this.items = next;
  }

  replace(markers: TimelineMarker[]): void {
    this.items = markers.map(clone);
    let max = 0;
    for (const marker of this.items) {
      const match = /^m(\d+)$/.exec(marker.id);
      if (match) max = Math.max(max, Number(match[1]));
    }
    this.nextId = max + 1;
  }

  all(): TimelineMarker[] {
    return this.items.map(clone);
  }

  silencesOn(laneId: string): { start: number; end: number }[] {
    return this.items
      .filter((marker) => marker.type === "silence" && marker.laneIds.includes(laneId))
      .map((marker) => ({ start: marker.start, end: marker.end }))
      .sort((a, b) => a.start - b.start);
  }

  cuts(): { start: number; end: number }[] {
    return this.items
      .filter((marker) => marker.type === "cut")
      .map((marker) => ({ start: marker.start, end: marker.end }))
      .sort((a, b) => a.start - b.start);
  }

  private mergeIn(incoming: TimelineMarker): void {
    const key = lanesKey(incoming.laneIds);
    const kept: TimelineMarker[] = [];
    let pending = incoming;
    for (const marker of this.items) {
      if (marker.type !== pending.type || lanesKey(marker.laneIds) !== key || marker.end < pending.start || marker.start > pending.end) {
        kept.push(marker);
        continue;
      }
      pending = {
        ...pending,
        start: Math.min(pending.start, marker.start),
        end: Math.max(pending.end, marker.end),
      };
    }
    this.items = [...kept, pending];
  }
}
