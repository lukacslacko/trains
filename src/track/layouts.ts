import { TrackGraph, sCurve, type Position, type Dir, type Edge, type Switch } from "./graph";

export type MainAspect = "stop" | "caution" | "clear";
export type GroundAspect = "stop" | "shunt";

export interface Signal {
  kind: "signal";
  id: string;            // "AG 2"
  type: "main" | "ground";
  pos: Position;         // pos.dir = direction of the trains it governs
  aspect: MainAspect | GroundAspect;
  station: string;
}
export interface Board {
  kind: "board";
  id: string;
  board: "stop" | "limitOfShunt" | "speed" | "speedAdvance" | "buffer";
  pos: Position;
  label?: string;
  value?: number;
}
export type Trackside = Signal | Board;

export interface Platform { name: string; track: string; kmFrom: number; kmTo: number; side: 1 | -1 }

/** A hectometre or kilometre post: a position reference, not a signal. */
export interface Post { km: number; x: number; y: number; major: boolean; label: string }

/** Posts every 100 m from km 0.0, on the left of the line in the Down direction (-y), clear of any loop track. */
function hectometrePosts(kmMax: number, postY: (km: number) => number): Post[] {
  const out: Post[] = [];
  for (let i = 0; i <= Math.round(kmMax * 10) + 1e-9; i++) {
    const km = i / 10;
    if (km > kmMax + 1e-9) break;
    const major = i % 10 === 0;
    out.push({ km, x: km * 1000, y: postY(km), major, label: major ? String(i / 10) : `${Math.floor(i / 10)}.${i % 10}` });
  }
  return out;
}

export interface StationInfo {
  code: string;
  name: string;
  master?: string;       // "Marrow" — undefined = unstaffed
  stopBoardKm: number;
  platform: Platform;
  /** which way an arriving passenger train travels (km direction) */
  arriveDir: Dir;
}

export interface Layout {
  name: string;
  graph: TrackGraph;
  objects: Trackside[];
  platforms: Platform[];
  stations: StationInfo[];
  kmMax: number;
  /** hectometre and kilometre posts along the line */
  posts: Post[];
  /** speed zones [kmFrom, kmTo, limit km/h] covering the whole line */
  speedZones: [number, number, number][];
  /** speed limit in km/h at a point */
  limitAt(km: number): number;
  /** the lowest limit anywhere under a train standing from kmA to kmB */
  limitOver(kmA: number, kmB: number): number;
  /** diagram zones for the line diagram: [kmFrom, kmTo, share of width] */
  zones: [number, number, number][];
}

const LINE_SPEED = 50, STATION_SPEED = 25;
const AG_LIMIT = 0.45, WD_LIMIT = 2.85;
const KM_MAX = 3.3;

/** Advance speed boards stand this far before the speed board they announce (Book S). */
export const WARNING_DISTANCE_KM = 0.2;

const speedZones: [number, number, number][] = [[0, AG_LIMIT, STATION_SPEED], [AG_LIMIT, WD_LIMIT, LINE_SPEED], [WD_LIMIT, KM_MAX, STATION_SPEED]];

function limitAt(km: number) {
  for (const [a, b, lim] of speedZones) if (km >= a && km < b) return lim;
  return STATION_SPEED;
}
/** A train's limit is the lowest limit under any part of it: a reduction applies to its front, a rise waits for its rear. */
function limitOver(kmA: number, kmB: number) {
  const lo = Math.min(kmA, kmB), hi = Math.max(kmA, kmB);
  let lim = Infinity;
  for (const [a, b, l] of speedZones) if (hi > a && lo < b) lim = Math.min(lim, l);
  return lim === Infinity ? limitAt(lo) : lim;
}

const zones: [number, number, number][] = [[0, AG_LIMIT + 0.05, 0.3], [AG_LIMIT + 0.05, WD_LIMIT - 0.05, 0.4], [WD_LIMIT - 0.05, KM_MAX, 0.3]];

const platforms: Platform[] = [
  { name: "Ashgrove", track: "1", kmFrom: 0.13, kmTo: 0.29, side: 1 },
  { name: "Wending", track: "1", kmFrom: 3.01, kmTo: 3.17, side: 1 },
];

function board(g: TrackGraph, id: string, board: Board["board"], track: string, km: number, facing: Dir, extra: Partial<Board> = {}): Board {
  return { kind: "board", id, board, pos: g.atKm(track, km, facing), ...extra };
}
function signal(g: TrackGraph, id: string, type: Signal["type"], track: string, km: number, facing: Dir, station: string): Signal {
  return { kind: "signal", id, type, pos: g.atKm(track, km, facing), aspect: "stop", station };
}

function speedBoards(g: TrackGraph): Board[] {
  return [
    // reductions to 25 are announced one warning distance ahead; the rises to 50 are not
    board(g, "SBA-AG25", "speedAdvance", "main", AG_LIMIT + WARNING_DISTANCE_KM, -1, { value: 25 }),
    board(g, "SB-AG25", "speed", "main", AG_LIMIT, -1, { value: 25 }),
    board(g, "SB-AG50", "speed", "main", AG_LIMIT, 1, { value: 50 }),
    board(g, "SBA-WD25", "speedAdvance", "main", WD_LIMIT - WARNING_DISTANCE_KM, 1, { value: 25 }),
    board(g, "SB-WD25", "speed", "main", WD_LIMIT, 1, { value: 25 }),
    board(g, "SB-WD50", "speed", "main", WD_LIMIT, -1, { value: 50 }),
  ];
}

/** Duty 101: plain single track, stop boards only. Track "1" is the platform stretch at each end. */
export function shuttleLayout(): Layout {
  const g = new TrackGraph();
  const y = 0;
  const n0 = g.node("AG-buf", 0, y, { buffer: true });
  const n1 = g.node("AG-end", AG_LIMIT * 1000, y);
  const n2 = g.node("WD-end", WD_LIMIT * 1000, y);
  const n3 = g.node("WD-buf", KM_MAX * 1000, y, { buffer: true });
  g.edge("AG-1", n0, n1, { kmA: 0, kmDir: 1, track: "1" });
  g.edge("main", n1, n2, { kmA: AG_LIMIT, kmDir: 1, track: "main" });
  g.edge("WD-1", n2, n3, { kmA: WD_LIMIT, kmDir: 1, track: "1" });

  const objects: Trackside[] = [
    board(g, "STOP-AG", "stop", "1", 0.135, -1, { label: "ASHGROVE" }),
    board(g, "STOP-WD", "stop", "1", 3.165, 1, { label: "WENDING" }),
    board(g, "BUF-AG", "buffer", "1", 0.0, -1),
    board(g, "BUF-WD", "buffer", "1", KM_MAX, 1),
    ...speedBoards(g),
  ];
  return {
    name: "Ashgrove–Wending (single line)",
    graph: g, objects, platforms, kmMax: KM_MAX, speedZones, limitAt, limitOver, zones,
    posts: hectometrePosts(KM_MAX, () => -3.6),
    stations: [
      { code: "AG", name: "Ashgrove", stopBoardKm: 0.135, platform: platforms[0], arriveDir: -1 },
      { code: "WD", name: "Wending", stopBoardKm: 3.165, platform: platforms[1], arriveDir: 1 },
    ],
  };
}

export interface LoopStation {
  code: string;
  switchA: Switch;          // outer switch (main line side)
  switchB: Switch;          // inner switch (headshunt side)
  edges: { hs: Edge; t1: Edge; t2: Edge; stub: Edge; bA1: Edge; bA2: Edge; bB1: Edge; bB2: Edge };
  signals: Record<string, Signal>; // keyed by number: "1","2",...
}

/** Duty 201: loop at each station, two switches, headshunt, stub, signals. */
export function loopLayout(): Layout & { loops: Record<string, LoopStation> } {
  const g = new TrackGraph();
  const T2 = -5; // track 2 offset (metres)
  const objects: Trackside[] = [];
  const loops: Record<string, LoopStation> = {};

  // Ashgrove, headshunt at the Up (km 0) end.
  {
    const buf = g.node("AG-buf", 0, 0, { buffer: true });
    const B = g.node("AG-B", 80, 0);
    const t1a = g.node("AG-t1a", 110, 0), t2a = g.node("AG-t2a", 110, T2);
    const t1b = g.node("AG-t1b", 310, 0), t2b = g.node("AG-t2b", 310, T2);
    const A = g.node("AG-A", 340, 0);
    const H = g.node("AG-H", AG_LIMIT * 1000, 0);
    const hs = g.edge("AG-hs", buf, B, { kmA: 0, kmDir: 1, track: "hs" });
    const bB1 = g.edge("AG-B1", B, t1a, { kmA: 0.08, kmDir: 1, track: "sw" });
    const bB2 = g.edge("AG-B2", B, t2a, { kmA: 0.08, kmDir: 1, track: "sw", pts: sCurve({ x: 80, y: 0 }, { x: 110, y: T2 }) });
    const t1 = g.edge("AG-t1", t1a, t1b, { kmA: 0.11, kmDir: 1, track: "1" });
    const t2 = g.edge("AG-t2", t2a, t2b, { kmA: 0.11, kmDir: 1, track: "2" });
    const bA1 = g.edge("AG-A1", t1b, A, { kmA: 0.31, kmDir: 1, track: "sw" });
    const bA2 = g.edge("AG-A2", t2b, A, { kmA: 0.31, kmDir: 1, track: "sw", pts: sCurve({ x: 310, y: T2 }, { x: 340, y: 0 }) });
    const stub = g.edge("AG-stub", A, H, { kmA: 0.34, kmDir: 1, track: "main" });
    const swB = g.switch("AG B", B, hs, bB1, bB2);
    const swA = g.switch("AG A", A, stub, bA1, bA2);
    const sig = (n: string, type: Signal["type"], track: string, km: number, facing: Dir) => {
      const s = signal(g, `AG ${n}`, type, track, km, facing, "AG");
      objects.push(s);
      return s;
    };
    loops.AG = {
      code: "AG", switchA: swA, switchB: swB,
      edges: { hs, t1, t2, stub, bA1, bA2, bB1, bB2 },
      signals: {
        "1": sig("1", "main", "1", 0.305, 1),
        "2": sig("2", "main", "main", 0.42, -1),
        "3": sig("3", "ground", "2", 0.305, 1),
        "4": sig("4", "ground", "1", 0.115, -1),
        "5": sig("5", "ground", "hs", 0.07, 1),
        "6": sig("6", "ground", "main", 0.35, -1),
      },
    };
    objects.push(
      board(g, "STOP-AG", "stop", "1", 0.135, -1, { label: "ASHGROVE" }),
      board(g, "LOS-AG", "limitOfShunt", "main", 0.4, 1, { label: "LIMIT OF SHUNT" }),
      board(g, "BUF-AG", "buffer", "hs", 0.0, -1),
    );
  }

  // Main line between the stubs
  const AGH = g.nodes.find((n) => n.id === "AG-H")!;
  const WDH = g.node("WD-H", WD_LIMIT * 1000, 0);
  g.edge("main", AGH, WDH, { kmA: AG_LIMIT, kmDir: 1, track: "main" });

  // Wending, headshunt at the Down (km 3.3) end. Mirror of Ashgrove.
  {
    const A = g.node("WD-A", 2960, 0);
    const t1a = g.node("WD-t1a", 2990, 0), t2a = g.node("WD-t2a", 2990, T2);
    const t1b = g.node("WD-t1b", 3190, 0), t2b = g.node("WD-t2b", 3190, T2);
    const B = g.node("WD-B", 3220, 0);
    const buf = g.node("WD-buf", KM_MAX * 1000, 0, { buffer: true });
    const stub = g.edge("WD-stub", WDH, A, { kmA: WD_LIMIT, kmDir: 1, track: "main" });
    const bA1 = g.edge("WD-A1", A, t1a, { kmA: 2.96, kmDir: 1, track: "sw" });
    const bA2 = g.edge("WD-A2", A, t2a, { kmA: 2.96, kmDir: 1, track: "sw", pts: sCurve({ x: 2960, y: 0 }, { x: 2990, y: T2 }) });
    const t1 = g.edge("WD-t1", t1a, t1b, { kmA: 2.99, kmDir: 1, track: "1" });
    const t2 = g.edge("WD-t2", t2a, t2b, { kmA: 2.99, kmDir: 1, track: "2" });
    const bB1 = g.edge("WD-B1", t1b, B, { kmA: 3.19, kmDir: 1, track: "sw" });
    const bB2 = g.edge("WD-B2", t2b, B, { kmA: 3.19, kmDir: 1, track: "sw", pts: sCurve({ x: 3190, y: T2 }, { x: 3220, y: 0 }) });
    const hs = g.edge("WD-hs", B, buf, { kmA: 3.22, kmDir: 1, track: "hs" });
    const swA = g.switch("WD A", A, stub, bA1, bA2);
    const swB = g.switch("WD B", B, hs, bB1, bB2);
    const sig = (n: string, type: Signal["type"], track: string, km: number, facing: Dir) => {
      const s = signal(g, `WD ${n}`, type, track, km, facing, "WD");
      objects.push(s);
      return s;
    };
    loops.WD = {
      code: "WD", switchA: swA, switchB: swB,
      edges: { hs, t1, t2, stub, bA1, bA2, bB1, bB2 },
      signals: {
        "1": sig("1", "main", "main", 2.88, 1),
        "2": sig("2", "main", "1", 2.995, -1),
        "3": sig("3", "ground", "1", 3.185, 1),
        "4": sig("4", "ground", "2", 2.995, -1),
        "5": sig("5", "ground", "main", 2.95, 1),
        "6": sig("6", "ground", "hs", 3.23, -1),
      },
    };
    objects.push(
      board(g, "STOP-WD", "stop", "1", 3.165, 1, { label: "WENDING" }),
      board(g, "LOS-WD", "limitOfShunt", "main", 2.9, -1, { label: "LIMIT OF SHUNT" }),
      board(g, "BUF-WD", "buffer", "hs", KM_MAX, 1),
    );
  }
  objects.push(...speedBoards(g));

  const inLoop = (km: number) => (km > 0.08 && km < 0.34) || (km > 2.96 && km < 3.22);
  return {
    name: "Ashgrove–Wending (loops and signals)",
    graph: g, objects, platforms, kmMax: KM_MAX, speedZones, limitAt, limitOver, zones, loops,
    posts: hectometrePosts(KM_MAX, (km) => (inLoop(km) ? T2 - 3.6 : -3.6)),
    stations: [
      { code: "AG", name: "Ashgrove", master: "Marrow", stopBoardKm: 0.135, platform: platforms[0], arriveDir: -1 },
      { code: "WD", name: "Wending", master: "Pell", stopBoardKm: 3.165, platform: platforms[1], arriveDir: 1 },
    ],
  };
}
