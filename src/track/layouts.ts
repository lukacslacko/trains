import { TrackGraph, sCurve, type Position, type Dir, type Edge, type Switch } from "./graph";

export type MainAspect = "stop" | "caution" | "clear" | "shunt"; // "shunt" = the subsidiary lit under a main signal at STOP
export type DistantAspect = "caution" | "clear";
export type GroundAspect = "stop" | "shunt";

export interface Signal {
  kind: "signal";
  id: string;            // "AG 2", "AG 2D"
  type: "main" | "distant" | "ground";
  pos: Position;         // pos.dir = direction of the trains it governs
  aspect: MainAspect | GroundAspect | DistantAspect;
  station: string;
  /** main signals with a subsidiary shunt aspect */
  subsidiary?: boolean;
  /** distant signals: the home they repeat */
  distantOf?: string;
}
export interface Board {
  kind: "board";
  id: string;
  board: "stop" | "limitOfShunt" | "speed" | "speedAdvance" | "gradient" | "switchIndicator" | "whistle" | "section" | "resume" | "buffer";
  pos: Position;
  label?: string;
  value?: number;
  /** the switch a switch indicator reports */
  sw?: Switch;
  /** for a switch indicator: which way a train reading it approaches the switch */
  approach?: "toe" | "normal" | "reverse";
}
export type Trackside = Signal | Board;

export interface Platform { name: string; track: string; kmFrom: number; kmTo: number; side: 1 | -1 }

/** A place where passenger trains stop: one per platform track and direction. */
export interface Stop { dir: Dir; track: string; km: number; platform: Platform }

/** A hectometre or kilometre post: a position reference, not a signal. */
export interface Post { km: number; x: number; y: number; major: boolean; label: string }

/** Lateral lane of the hectometre plates: beyond the signals and boards (which stand about 3 m out). */
export const POST_LANE = 6.8;

function hectometrePosts(kmMax: number, postY: (km: number) => number): Post[] {
  const out: Post[] = [];
  for (let i = 0; i <= Math.round(kmMax * 10) + 1e-9; i++) {
    const km = i / 10;
    if (km > kmMax + 1e-9) break;
    const major = i % 10 === 0;
    out.push({ km, x: km * 1000, y: postY(km), major, label: `${Math.floor(i / 10)}.${i % 10}` });
  }
  return out;
}

export interface StationInfo {
  code: string;
  name: string;
  master?: string;       // "Marrow" — undefined = unstaffed
  stops: Stop[];
  /** all edges within the station's limits, for "train wholly within the station" */
  edges?: Edge[];
}

/** A block section between two boxes: the single line and its stubs. */
export interface BlockSection { id: string; name: string; from: string; to: string; edges: Edge[] }

/** A neutral section of the overhead line: no power between kmFrom and kmTo. */
export interface NeutralSection { id: string; kmFrom: number; kmTo: number }

export interface Crossing { id: string; name: string; km: number }

export interface Layout {
  name: string;
  graph: TrackGraph;
  objects: Trackside[];
  platforms: Platform[];
  stations: StationInfo[];
  kmMax: number;
  posts: Post[];
  speedZones: [number, number, number][];
  limitAt(km: number): number;
  limitOver(kmA: number, kmB: number): number;
  profile: [number, number, number][];
  gradientAt(km: number): number;
  elevationAt(km: number): number;
  zones: [number, number, number][];
  sections: BlockSection[];
  neutral: NeutralSection[];
  crossings: Crossing[];
}

/* ------------------------------------------------------------------ */
/*  The Ashgrove–Wending–Coldwater line                                */
/* ------------------------------------------------------------------ */

const LINE_SPEED = 50, STATION_SPEED = 25;
const AG_LIMIT = 0.45, WD_S_LIMIT = 2.85, WD_N_LIMIT = 3.40, CW_LIMIT = 5.95;
const KM_MAX = 6.4;
const T2 = -5; // loop track offset

/** Advance speed boards and distant signals stand this far before what they announce; further where the approach falls at 10‰ or more. */
export const WARNING_DISTANCE_KM = 0.2;
export const WARNING_DISTANCE_FALLING_KM = 0.25;

const speedZones: [number, number, number][] = [
  [0, AG_LIMIT, STATION_SPEED], [AG_LIMIT, WD_S_LIMIT, LINE_SPEED], [WD_S_LIMIT, WD_N_LIMIT, STATION_SPEED],
  [WD_N_LIMIT, CW_LIMIT, LINE_SPEED], [CW_LIMIT, KM_MAX, STATION_SPEED],
];
function limitAt(km: number) {
  for (const [a, b, lim] of speedZones) if (km >= a && km < b) return lim;
  return STATION_SPEED;
}
function limitOver(kmA: number, kmB: number) {
  const lo = Math.min(kmA, kmB), hi = Math.max(kmA, kmB);
  let lim = Infinity;
  for (const [a, b, l] of speedZones) if (hi > a && lo < b) lim = Math.min(lim, l);
  return lim === Infinity ? limitAt(lo) : lim;
}

/** The valley climbs from Ashgrove: level through each station, 12‰ then 6‰ to Wending, 8‰ on to Coldwater. */
const profile: [number, number, number][] = [[0, 0.5, 0], [0.5, 2.4, 12], [2.4, 2.8, 6], [2.8, 3.4, 0], [3.4, 5.6, 8], [5.6, KM_MAX, 0]];
function gradientAt(km: number) {
  for (const [a, b, g] of profile) if (km >= a && km < b) return g;
  return 0;
}
function elevationAt(km: number) {
  let h = 0;
  for (const [a, b, g] of profile) {
    if (km <= a) break;
    h += (Math.min(km, b) - a) * g;
  }
  return h;
}

const platforms: Platform[] = [
  { name: "Ashgrove", track: "1", kmFrom: 0.13, kmTo: 0.29, side: 1 },
  { name: "Wending", track: "1", kmFrom: 3.01, kmTo: 3.17, side: 1 },
  { name: "Wending 2", track: "2", kmFrom: 3.01, kmTo: 3.17, side: -1 },
  { name: "Coldwater", track: "1", kmFrom: 6.11, kmTo: 6.27, side: 1 },
];
const P = { AG: platforms[0], WD1: platforms[1], WD2: platforms[2], CW: platforms[3] };

function board(g: TrackGraph, id: string, board: Board["board"], track: string, km: number, facing: Dir, extra: Partial<Board> = {}): Board {
  return { kind: "board", id, board, pos: g.atKm(track, km, facing), ...extra };
}
function signal(g: TrackGraph, id: string, type: Signal["type"], track: string, km: number, facing: Dir, station: string, extra: Partial<Signal> = {}): Signal {
  return { kind: "signal", id, type, pos: g.atKm(track, km, facing), aspect: type === "distant" ? "caution" : "stop", station, ...extra };
}

function gradientPostsUpTo(g: TrackGraph, kmMax: number): Board[] {
  const out: Board[] = [];
  for (let i = 1; i < profile.length; i++) {
    const km = profile[i][0];
    if (km >= kmMax) break;
    const before = profile[i - 1][2], after = profile[i][2];
    out.push({ kind: "board", id: `GP-${km}-D`, board: "gradient", pos: g.atKm("main", km, 1), value: after, label: String(before) });
    out.push({ kind: "board", id: `GP-${km}-U`, board: "gradient", pos: g.atKm("main", km, -1), value: -before, label: String(-after) });
  }
  return out;
}

function switchIndicators(g: TrackGraph): Board[] {
  const out: Board[] = [];
  for (const sw of g.switches) {
    const legs: [Edge, "toe" | "normal" | "reverse"][] = [[sw.toe, "toe"], [sw.normal, "normal"], [sw.reverse, "reverse"]];
    for (const [e, approach] of legs) {
      const atA = e.a === sw.node;
      const pos: Position = { edge: e, s: atA ? 0 : e.length, dir: atA ? -1 : 1 };
      out.push({ kind: "board", id: `SI-${sw.id}-${approach}`, board: "switchIndicator", pos, label: sw.id, sw, approach });
    }
  }
  return out;
}

/** Speed boards for a station limit at `km`: the 25 board facing the approach, the 50 board facing away, and the advance board. */
function limitBoards(g: TrackGraph, code: string, km: number, approachDir: Dir, falling: boolean): Board[] {
  const warn = falling ? WARNING_DISTANCE_FALLING_KM : WARNING_DISTANCE_KM;
  return [
    board(g, `SB-${code}25`, "speed", "main", km, approachDir, { value: 25 }),
    board(g, `SB-${code}50`, "speed", "main", km, (-approachDir) as Dir, { value: 50 }),
    board(g, `SBA-${code}25`, "speedAdvance", "main", km - approachDir * warn, approachDir, { value: 25 }),
  ];
}

/* ---------- Duty 101: plain single track, stop boards only ---------- */

export function shuttleLayout(): Layout {
  const g = new TrackGraph();
  const n0 = g.node("AG-buf", 0, 0, { buffer: true });
  const n1 = g.node("AG-end", AG_LIMIT * 1000, 0);
  const n2 = g.node("WD-end", WD_S_LIMIT * 1000, 0);
  const n3 = g.node("WD-buf", 3.3 * 1000, 0, { buffer: true });
  g.edge("AG-1", n0, n1, { kmA: 0, kmDir: 1, track: "1" });
  g.edge("main", n1, n2, { kmA: AG_LIMIT, kmDir: 1, track: "main" });
  g.edge("WD-1", n2, n3, { kmA: WD_S_LIMIT, kmDir: 1, track: "1" });
  const objects: Trackside[] = [
    board(g, "STOP-AG", "stop", "1", 0.135, -1, { label: "ASHGROVE" }),
    board(g, "STOP-WD", "stop", "1", 3.165, 1, { label: "WENDING" }),
    board(g, "BUF-AG", "buffer", "1", 0.0, -1),
    board(g, "BUF-WD", "buffer", "1", 3.3, 1),
    ...limitBoards(g, "AG", AG_LIMIT, -1, true),
    ...limitBoards(g, "WD", WD_S_LIMIT, 1, false),
    ...gradientPostsUpTo(g, 2.85),
  ];
  return {
    name: "Ashgrove–Wending (single line)",
    graph: g, objects, platforms: [P.AG, P.WD1], kmMax: 3.3, speedZones, limitAt, limitOver, zones: [[0, 3.3, 1]], profile, gradientAt, elevationAt,
    posts: hectometrePosts(3.3, () => -POST_LANE),
    stations: [
      { code: "AG", name: "Ashgrove", stops: [{ dir: -1, track: "1", km: 0.135, platform: P.AG }] },
      { code: "WD", name: "Wending", stops: [{ dir: 1, track: "1", km: 3.165, platform: P.WD1 }] },
    ],
    sections: [], neutral: [], crossings: [],
  };
}

/* ---------- The full line ---------- */

/** A station's switches, edges and signals, by role, for the boxes. */
export interface StationLayout {
  code: string;
  kind: "terminus" | "through";
  /** outer switch on the Ashgrove (south) side and on the north side */
  switchS: Switch;
  switchN: Switch;
  edges: { stubS: Edge; stubN: Edge; t1: Edge; t2: Edge; bS1: Edge; bS2: Edge; bN1: Edge; bN2: Edge };
  /** the main line side of a terminus */
  mainSide?: "S" | "N";
  signals: Record<string, Signal>;
  /** all edges within the station, home signal to home signal (or buffer) */
  all: Edge[];
}

export interface ValleyLayout extends Layout {
  st: Record<string, StationLayout>;
}

export function valleyLayout(): ValleyLayout {
  const g = new TrackGraph();
  const objects: Trackside[] = [];
  const st: Record<string, StationLayout> = {};
  const sig = (id: string, type: Signal["type"], track: string, km: number, facing: Dir, station: string, extra: Partial<Signal> = {}) => {
    const s = signal(g, id, type, track, km, facing, station, extra);
    objects.push(s);
    return s;
  };

  // ----- Ashgrove: terminus, headshunt at the Up (buffer) end, main line to the north -----
  const agBuf = g.node("AG-buf", 0, 0, { buffer: true });
  const agB = g.node("AG-B", 80, 0);
  const agT1a = g.node("AG-t1a", 110, 0), agT2a = g.node("AG-t2a", 110, T2);
  const agT1b = g.node("AG-t1b", 310, 0), agT2b = g.node("AG-t2b", 310, T2);
  const agA = g.node("AG-A", 340, 0);
  const agH = g.node("AG-H", AG_LIMIT * 1000, 0);
  const agHs = g.edge("AG-hs", agBuf, agB, { kmA: 0, kmDir: 1, track: "hs" });
  const agB1 = g.edge("AG-B1", agB, agT1a, { kmA: 0.08, kmDir: 1, track: "sw" });
  const agB2 = g.edge("AG-B2", agB, agT2a, { kmA: 0.08, kmDir: 1, track: "sw", pts: sCurve({ x: 80, y: 0 }, { x: 110, y: T2 }) });
  const agT1 = g.edge("AG-t1", agT1a, agT1b, { kmA: 0.11, kmDir: 1, track: "1" });
  const agT2 = g.edge("AG-t2", agT2a, agT2b, { kmA: 0.11, kmDir: 1, track: "2" });
  const agA1 = g.edge("AG-A1", agT1b, agA, { kmA: 0.31, kmDir: 1, track: "sw" });
  const agA2 = g.edge("AG-A2", agT2b, agA, { kmA: 0.31, kmDir: 1, track: "sw", pts: sCurve({ x: 310, y: T2 }, { x: 340, y: 0 }) });
  const agStub = g.edge("AG-stub", agA, agH, { kmA: 0.34, kmDir: 1, track: "main" });
  const agSwB = g.switch("AG B", agB, agHs, agB1, agB2);
  const agSwA = g.switch("AG A", agA, agStub, agA1, agA2);
  st.AG = {
    code: "AG", kind: "terminus", mainSide: "N", switchS: agSwB, switchN: agSwA,
    edges: { stubS: agHs, stubN: agStub, t1: agT1, t2: agT2, bS1: agB1, bS2: agB2, bN1: agA1, bN2: agA2 },
    signals: {
      "1": sig("AG 1", "main", "1", 0.305, 1, "AG"),
      "2": sig("AG 2", "main", "main", 0.42, -1, "AG"),
      "3": sig("AG 3", "ground", "2", 0.305, 1, "AG"),
      "4": sig("AG 4", "ground", "1", 0.115, -1, "AG"),
      "5": sig("AG 5", "ground", "hs", 0.07, 1, "AG"),
      "6": sig("AG 6", "ground", "main", 0.35, -1, "AG"),
    },
    all: [agHs, agB1, agB2, agT1, agT2, agA1, agA2, agStub],
  };
  objects.push(
    board(g, "STOP-AG", "stop", "1", 0.135, -1, { label: "ASHGROVE" }),
    board(g, "LOS-AG", "limitOfShunt", "main", 0.4, 1, { label: "LIMIT OF SHUNT" }),
    board(g, "BUF-AG", "buffer", "hs", 0.0, -1),
  );

  // ----- Section A: Ashgrove–Wending -----
  const wdH = g.node("WD-HS", WD_S_LIMIT * 1000, 0);
  const mainA = g.edge("main-A", agH, wdH, { kmA: AG_LIMIT, kmDir: 1, track: "main" });

  // ----- Wending: through station, platforms on both loop tracks -----
  const wdA = g.node("WD-A", 2960, 0);
  const wdT1a = g.node("WD-t1a", 2990, 0), wdT2a = g.node("WD-t2a", 2990, T2);
  const wdT1b = g.node("WD-t1b", 3190, 0), wdT2b = g.node("WD-t2b", 3190, T2);
  const wdB = g.node("WD-B", 3220, 0);
  const wdHN = g.node("WD-HN", WD_N_LIMIT * 1000, 0);
  const wdStubS = g.edge("WD-stubS", wdH, wdA, { kmA: WD_S_LIMIT, kmDir: 1, track: "main" });
  const wdA1 = g.edge("WD-A1", wdA, wdT1a, { kmA: 2.96, kmDir: 1, track: "sw" });
  const wdA2 = g.edge("WD-A2", wdA, wdT2a, { kmA: 2.96, kmDir: 1, track: "sw", pts: sCurve({ x: 2960, y: 0 }, { x: 2990, y: T2 }) });
  const wdT1 = g.edge("WD-t1", wdT1a, wdT1b, { kmA: 2.99, kmDir: 1, track: "1" });
  const wdT2 = g.edge("WD-t2", wdT2a, wdT2b, { kmA: 2.99, kmDir: 1, track: "2" });
  const wdB1 = g.edge("WD-B1", wdT1b, wdB, { kmA: 3.19, kmDir: 1, track: "sw" });
  const wdB2 = g.edge("WD-B2", wdT2b, wdB, { kmA: 3.19, kmDir: 1, track: "sw", pts: sCurve({ x: 3190, y: T2 }, { x: 3220, y: 0 }) });
  const wdStubN = g.edge("WD-stubN", wdB, wdHN, { kmA: 3.22, kmDir: 1, track: "main" });
  const wdSwA = g.switch("WD A", wdA, wdStubS, wdA1, wdA2);
  const wdSwB = g.switch("WD B", wdB, wdStubN, wdB1, wdB2);
  st.WD = {
    code: "WD", kind: "through", switchS: wdSwA, switchN: wdSwB,
    edges: { stubS: wdStubS, stubN: wdStubN, t1: wdT1, t2: wdT2, bS1: wdA1, bS2: wdA2, bN1: wdB1, bN2: wdB2 },
    signals: {
      "1": sig("WD 1", "main", "main", 2.88, 1, "WD"),
      "2": sig("WD 2", "main", "1", 2.995, -1, "WD"),
      "4": sig("WD 4", "main", "2", 2.995, -1, "WD", { subsidiary: true }),
      "5": sig("WD 5", "ground", "main", 2.95, 1, "WD"),
      "6": sig("WD 6", "ground", "main", 3.23, -1, "WD"),
      "7": sig("WD 7", "main", "1", 3.185, 1, "WD", { subsidiary: true }),
      "8": sig("WD 8", "main", "main", 3.32, -1, "WD"),
      "9": sig("WD 9", "main", "2", 3.185, 1, "WD"),
    },
    all: [wdStubS, wdA1, wdA2, wdT1, wdT2, wdB1, wdB2, wdStubN],
  };
  objects.push(
    board(g, "STOP-WD1", "stop", "1", 3.165, 1, { label: "WENDING" }),
    board(g, "STOP-WD2", "stop", "2", 3.015, -1, { label: "WENDING" }),
    board(g, "LOS-WDS", "limitOfShunt", "main", 2.9, -1, { label: "LIMIT OF SHUNT" }),
    board(g, "LOS-WDN", "limitOfShunt", "main", 3.28, 1, { label: "LIMIT OF SHUNT" }),
  );

  // ----- Section B: Wending–Coldwater, with a neutral section and a farm crossing -----
  const cwH = g.node("CW-H", CW_LIMIT * 1000, 0);
  const mainB = g.edge("main-B", wdHN, cwH, { kmA: WD_N_LIMIT, kmDir: 1, track: "main" });
  objects.push(
    board(g, "SEC-D", "section", "main", 4.10, 1), board(g, "RES-U", "resume", "main", 4.10, -1),
    board(g, "RES-D", "resume", "main", 4.30, 1), board(g, "SEC-U", "section", "main", 4.30, -1),
    board(g, "W-D", "whistle", "main", 4.50, 1), board(g, "W-U", "whistle", "main", 4.90, -1),
  );

  // ----- Coldwater: terminus, main line to the south, headshunt at the Down (buffer) end -----
  const cwA = g.node("CW-A", 6060, 0);
  const cwT1a = g.node("CW-t1a", 6090, 0), cwT2a = g.node("CW-t2a", 6090, T2);
  const cwT1b = g.node("CW-t1b", 6290, 0), cwT2b = g.node("CW-t2b", 6290, T2);
  const cwB = g.node("CW-B", 6320, 0);
  const cwBuf = g.node("CW-buf", KM_MAX * 1000, 0, { buffer: true });
  const cwStub = g.edge("CW-stub", cwH, cwA, { kmA: CW_LIMIT, kmDir: 1, track: "main" });
  const cwA1 = g.edge("CW-A1", cwA, cwT1a, { kmA: 6.06, kmDir: 1, track: "sw" });
  const cwA2 = g.edge("CW-A2", cwA, cwT2a, { kmA: 6.06, kmDir: 1, track: "sw", pts: sCurve({ x: 6060, y: 0 }, { x: 6090, y: T2 }) });
  const cwT1 = g.edge("CW-t1", cwT1a, cwT1b, { kmA: 6.09, kmDir: 1, track: "1" });
  const cwT2 = g.edge("CW-t2", cwT2a, cwT2b, { kmA: 6.09, kmDir: 1, track: "2" });
  const cwB1 = g.edge("CW-B1", cwT1b, cwB, { kmA: 6.29, kmDir: 1, track: "sw" });
  const cwB2 = g.edge("CW-B2", cwT2b, cwB, { kmA: 6.29, kmDir: 1, track: "sw", pts: sCurve({ x: 6290, y: T2 }, { x: 6320, y: 0 }) });
  const cwHs = g.edge("CW-hs", cwB, cwBuf, { kmA: 6.32, kmDir: 1, track: "hs" });
  const cwSwA = g.switch("CW A", cwA, cwStub, cwA1, cwA2);
  const cwSwB = g.switch("CW B", cwB, cwHs, cwB1, cwB2);
  st.CW = {
    code: "CW", kind: "terminus", mainSide: "S", switchS: cwSwA, switchN: cwSwB,
    edges: { stubS: cwStub, stubN: cwHs, t1: cwT1, t2: cwT2, bS1: cwA1, bS2: cwA2, bN1: cwB1, bN2: cwB2 },
    signals: {
      "1": sig("CW 1", "main", "main", 5.98, 1, "CW"),
      "2": sig("CW 2", "main", "1", 6.095, -1, "CW"),
      "3": sig("CW 3", "ground", "1", 6.285, 1, "CW"),
      "4": sig("CW 4", "ground", "2", 6.095, -1, "CW"),
      "5": sig("CW 5", "ground", "main", 6.05, 1, "CW"),
      "6": sig("CW 6", "ground", "hs", 6.33, -1, "CW"),
    },
    all: [cwStub, cwA1, cwA2, cwT1, cwT2, cwB1, cwB2, cwHs],
  };
  objects.push(
    board(g, "STOP-CW", "stop", "1", 6.265, 1, { label: "COLDWATER" }),
    board(g, "LOS-CW", "limitOfShunt", "main", 6.0, -1, { label: "LIMIT OF SHUNT" }),
    board(g, "BUF-CW", "buffer", "hs", KM_MAX, 1),
  );

  // ----- distant signals: one warning distance before each home, by the grade of the approach -----
  sig("AG 2D", "distant", "main", 0.42 + WARNING_DISTANCE_FALLING_KM, -1, "AG", { distantOf: "AG 2" });   // Up approach falls 12‰
  sig("WD 1D", "distant", "main", 2.88 - WARNING_DISTANCE_KM, 1, "WD", { distantOf: "WD 1" });            // Down approach rises 6‰
  sig("WD 8D", "distant", "main", 3.32 + WARNING_DISTANCE_KM, -1, "WD", { distantOf: "WD 8" });           // Up approach falls 8‰: under 10‰
  sig("CW 1D", "distant", "main", 5.98 - WARNING_DISTANCE_KM, 1, "CW", { distantOf: "CW 1" });            // Down approach level

  // ----- speed boards, posts, indicators -----
  objects.push(
    ...limitBoards(g, "AG", AG_LIMIT, -1, true),
    ...limitBoards(g, "WDS", WD_S_LIMIT, 1, false),
    ...limitBoards(g, "WDN", WD_N_LIMIT, -1, false),
    ...limitBoards(g, "CW", CW_LIMIT, 1, false),
    ...gradientPostsUpTo(g, KM_MAX), ...switchIndicators(g),
  );

  const inLoop = (km: number) => (km > 0.08 && km < 0.34) || (km > 2.96 && km < 3.22) || (km > 6.06 && km < 6.32);
  return {
    name: "Ashgrove–Wending–Coldwater",
    graph: g, objects, platforms, kmMax: KM_MAX, speedZones, limitAt, limitOver, zones: [[0, KM_MAX, 1]], profile, gradientAt, elevationAt,
    posts: hectometrePosts(KM_MAX, (km) => (inLoop(km) ? T2 - POST_LANE : -POST_LANE)),
    stations: [
      { code: "AG", name: "Ashgrove", master: "Marrow", stops: [{ dir: -1, track: "1", km: 0.135, platform: P.AG }], edges: st.AG.all },
      { code: "WD", name: "Wending", master: "Pell", stops: [{ dir: 1, track: "1", km: 3.165, platform: P.WD1 }, { dir: -1, track: "2", km: 3.015, platform: P.WD2 }], edges: st.WD.all },
      { code: "CW", name: "Coldwater", master: "Ashby", stops: [{ dir: 1, track: "1", km: 6.265, platform: P.CW }], edges: st.CW.all },
    ],
    sections: [
      { id: "A", name: "Ashgrove–Wending", from: "AG", to: "WD", edges: [agStub, mainA, wdStubS] },
      { id: "B", name: "Wending–Coldwater", from: "WD", to: "CW", edges: [wdStubN, mainB, cwStub] },
    ],
    neutral: [{ id: "N1", kmFrom: 4.19, kmTo: 4.21 }],
    crossings: [{ id: "X1", name: "Millers' Crossing", km: 4.70 }],
    st,
  };
}
