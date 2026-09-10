import { TrackGraph, sCurve, type Position, type Dir, type Edge, type Switch, type SwitchState, type Pt, pointAt, tangentAt } from "./graph";

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
  /** a home whose subsidiary may also be used to call a train on to an occupied platform */
  callOn?: boolean;
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
  sw?: Switch;
  approach?: "toe" | "normal" | "reverse";
}
export type Trackside = Signal | Board;

export interface Platform { name: string; track: string; kmFrom: number; kmTo: number; side: 1 | -1 }

/** A place where passenger trains stop: one per platform track and direction. */
export interface Stop { dir: Dir; track: string; km: number; platform: Platform; line: string }

/** A hectometre or kilometre post: a position reference, not a signal. */
export interface Post { line: string; km: number; x: number; y: number; angle: number; major: boolean; label: string }

/** Lateral lane of the hectometre plates: beyond the signals and boards (which stand about 3 m out). */
export const POST_LANE = 6.8;

export interface StationInfo {
  code: string;
  name: string;
  master?: string;
  stops: Stop[];
  edges?: Edge[];
}

export interface BlockSection { id: string; name: string; from: string; to: string; edges: Edge[] }
export interface NeutralSection { id: string; line: string; kmFrom: number; kmTo: number }
export interface Crossing { id: string; name: string; line: string; km: number }

/** A line with its own kilometrage: profile and speed zones. */
export interface LineInfo {
  id: string;
  name: string;
  kmMax: number;
  profile: [number, number, number][];
  speedZones: [number, number, number][];
  /** height of km 0 of this line above the Ashgrove buffer stop */
  baseHeight: number;
  /** the km on the main line where a branch leaves, for diagrams */
  junctionKm?: number;
}

/** A stabling road in a shed: the edge, its exit signal, and how the ladder is set to reach it. */
export interface ShedRoad {
  track: string;
  edge: Edge;
  exit: Signal;
  switches: [Switch, SwitchState][];
  /** the lead edges between the headshunt and the road, in order */
  leads: Edge[];
}
/** A shed: roads off a station's headshunt, and the building drawn over their far ends. */
export interface Shed {
  id: string;
  station: string;
  name: string;
  /** the line whose kilometrage the shed edges carry */
  line: string;
  /** where the shed lead leaves the station's headshunt, in the station line's km */
  mainKm: number;
  /** the station line's km direction of "out of the shed": shed kilometres run into the shed, so a car facing out faces -1 on the shed's km and `outDir` on the line's */
  outDir: Dir;
  roads: ShedRoad[];
  /** the building, world metres */
  building: { x: number; y: number; w: number; h: number; angle: number };
}

export interface Layout {
  name: string;
  graph: TrackGraph;
  objects: Trackside[];
  platforms: Platform[];
  stations: StationInfo[];
  sheds: Shed[];
  kmMax: number;
  posts: Post[];
  lines: Record<string, LineInfo>;
  /** conveniences for the main line */
  speedZones: [number, number, number][];
  profile: [number, number, number][];
  limitAt(km: number, line?: string): number;
  limitOver(kmA: number, kmB: number, line?: string): number;
  gradientAt(km: number, line?: string): number;
  elevationAt(km: number, line?: string): number;
  zones: [number, number, number][];
  sections: BlockSection[];
  neutral: NeutralSection[];
  crossings: Crossing[];
}

/* ------------------------------------------------------------------ */

const LINE_SPEED = 50, STATION_SPEED = 25, BRANCH_SPEED = 40;
const AG_LIMIT = 0.45, WD_S_LIMIT = 2.85, WD_N_LIMIT = 3.50, CW_LIMIT = 5.95;
const KM_MAX = 6.4;
const T2 = -5;
const J_KM = 3.36;            // the junction switch WD J
const BR_MAX = 2.32;          // the branch's buffer stop
const BR_LIMIT = 0.14, FH_LIMIT = 2.0;

export const WARNING_DISTANCE_KM = 0.2;
export const WARNING_DISTANCE_FALLING_KM = 0.25;

const mainLine: LineInfo = {
  id: "main", name: "Ashgrove–Wending–Coldwater", kmMax: KM_MAX, baseHeight: 0,
  profile: [[0, 0.5, 0], [0.5, 2.4, 12], [2.4, 2.8, 6], [2.8, 3.4, 0], [3.4, 5.6, 8], [5.6, KM_MAX, 0]],
  speedZones: [[0, AG_LIMIT, STATION_SPEED], [AG_LIMIT, WD_S_LIMIT, LINE_SPEED], [WD_S_LIMIT, WD_N_LIMIT, STATION_SPEED], [WD_N_LIMIT, CW_LIMIT, LINE_SPEED], [CW_LIMIT, KM_MAX, STATION_SPEED]],
};
function elevationOf(line: LineInfo, km: number) {
  let h = line.baseHeight;
  for (const [a, b, g] of line.profile) { if (km <= a) break; h += (Math.min(km, b) - a) * g; }
  return h;
}
const branchLine: LineInfo = {
  id: "branch", name: "Fernhollow branch", kmMax: BR_MAX, baseHeight: elevationOf(mainLine, J_KM), junctionKm: J_KM,
  profile: [[0, 0.3, 0], [0.3, 1.9, 10], [1.9, BR_MAX, 0]],
  speedZones: [[0, BR_LIMIT, STATION_SPEED], [BR_LIMIT, FH_LIMIT, BRANCH_SPEED], [FH_LIMIT, BR_MAX, STATION_SPEED]],
};
/** the Ashgrove shed roads: flat, 15 km/h, their own short kilometrage from the shed switch */
const agShedLine: LineInfo = { id: "agshed", name: "Ashgrove Shed", kmMax: 0.2, baseHeight: 0, profile: [[0, 0.2, 0]], speedZones: [[0, 0.2, 15]] };
const LINES: Record<string, LineInfo> = { main: mainLine, branch: branchLine, agshed: agShedLine };

function limitAt(km: number, line = "main") {
  for (const [a, b, lim] of LINES[line].speedZones) if (km >= a && km < b) return lim;
  return STATION_SPEED;
}
function limitOver(kmA: number, kmB: number, line = "main") {
  const lo = Math.min(kmA, kmB), hi = Math.max(kmA, kmB);
  let lim = Infinity;
  for (const [a, b, l] of LINES[line].speedZones) if (hi > a && lo < b) lim = Math.min(lim, l);
  return lim === Infinity ? limitAt(lo, line) : lim;
}
function gradientAt(km: number, line = "main") {
  for (const [a, b, g] of LINES[line].profile) if (km >= a && km < b) return g;
  return 0;
}
function elevationAt(km: number, line = "main") { return elevationOf(LINES[line], km); }

const platforms: Platform[] = [
  { name: "Ashgrove", track: "1", kmFrom: 0.13, kmTo: 0.29, side: 1 },
  { name: "Wending", track: "1", kmFrom: 3.01, kmTo: 3.17, side: 1 },
  { name: "Wending 2", track: "2", kmFrom: 3.01, kmTo: 3.17, side: -1 },
  { name: "Coldwater", track: "1", kmFrom: 6.11, kmTo: 6.27, side: 1 },
  { name: "Fernhollow", track: "b1", kmFrom: 2.10, kmTo: 2.26, side: 1 },
];
const P = { AG: platforms[0], WD1: platforms[1], WD2: platforms[2], CW: platforms[3], FH: platforms[4] };

function board(g: TrackGraph, id: string, board: Board["board"], track: string, km: number, facing: Dir, extra: Partial<Board> = {}): Board {
  return { kind: "board", id, board, pos: g.atKm(track, km, facing), ...extra };
}
function signal(g: TrackGraph, id: string, type: Signal["type"], track: string, km: number, facing: Dir, station: string, extra: Partial<Signal> = {}): Signal {
  return { kind: "signal", id, type, pos: g.atKm(track, km, facing), aspect: type === "distant" ? "caution" : "stop", station, ...extra };
}

/** Posts every 100 m along a line, on the left of the line in the Down direction, further out where a loop track lies between. */
function postsOn(g: TrackGraph, line: LineInfo, extraLane: (km: number) => number, upTo = line.kmMax): Post[] {
  const out: Post[] = [];
  for (let i = 0; i <= Math.round(upTo * 10) + 1e-9; i++) {
    const km = i / 10;
    if (km > upTo + 1e-9) break;
    let pos: Position;
    try { pos = g.atKmOn(line.id, km, 1); } catch { continue; }
    const p = pointAt(pos.edge, pos.s), t = tangentAt(pos.edge, pos.s);
    const tt = pos.dir === 1 ? t : { x: -t.x, y: -t.y };     // the Down direction
    const left = { x: tt.y, y: -tt.x };                         // left-hand side of Down
    const lane = POST_LANE + extraLane(km);
    out.push({ line: line.id, km, x: p.x + left.x * lane, y: p.y + left.y * lane, angle: Math.atan2(tt.y, tt.x), major: i % 10 === 0, label: `${Math.floor(i / 10)}.${i % 10}` });
  }
  return out;
}

function gradientPosts(g: TrackGraph, line: LineInfo, upTo = line.kmMax): Board[] {
  const out: Board[] = [];
  for (let i = 1; i < line.profile.length; i++) {
    const km = line.profile[i][0];
    if (km >= upTo) break;
    const before = line.profile[i - 1][2], after = line.profile[i][2];
    out.push({ kind: "board", id: `GP-${line.id}-${km}-D`, board: "gradient", pos: g.atKmOn(line.id, km, 1), value: after, label: String(before) });
    out.push({ kind: "board", id: `GP-${line.id}-${km}-U`, board: "gradient", pos: g.atKmOn(line.id, km, -1), value: -before, label: String(-after) });
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

/** Speed boards for a station limit: the lower board facing the approach, the higher facing away, and the advance board. */
function limitBoards(g: TrackGraph, code: string, track: string, km: number, approachDir: Dir, falling: boolean, lower: number, higher: number): Board[] {
  const warn = falling ? WARNING_DISTANCE_FALLING_KM : WARNING_DISTANCE_KM;
  return [
    board(g, `SB-${code}${lower}`, "speed", track, km, approachDir, { value: lower }),
    board(g, `SB-${code}${higher}`, "speed", track, km, (-approachDir) as Dir, { value: higher }),
    board(g, `SBA-${code}${lower}`, "speedAdvance", track, km - approachDir * warn, approachDir, { value: lower }),
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
    ...limitBoards(g, "AG", "main", AG_LIMIT, -1, true, 25, 50),
    ...limitBoards(g, "WD", "main", WD_S_LIMIT, 1, false, 25, 50),
    ...gradientPosts(g, mainLine, 2.85),
  ];
  const lines = { main: { ...mainLine, kmMax: 3.3 } };
  return {
    name: "Ashgrove–Wending (single line)",
    graph: g, objects, platforms: [P.AG, P.WD1], kmMax: 3.3, lines, speedZones: mainLine.speedZones, profile: mainLine.profile,
    limitAt, limitOver, gradientAt, elevationAt, zones: [[0, 3.3, 1]],
    posts: postsOn(g, mainLine, () => 0, 3.3),
    stations: [
      { code: "AG", name: "Ashgrove", stops: [{ dir: -1, track: "1", km: 0.135, platform: P.AG, line: "main" }] },
      { code: "WD", name: "Wending", stops: [{ dir: 1, track: "1", km: 3.165, platform: P.WD1, line: "main" }] },
    ],
    sections: [], neutral: [], crossings: [], sheds: [],
  };
}

/* ---------- The full line with the Fernhollow branch ---------- */

export interface StationLayout {
  code: string;
  kind: "terminus" | "through" | "simple";
  switchS?: Switch;
  switchN?: Switch;
  /** the junction switch on the north side of a through station with a branch */
  switchJ?: Switch;
  /** hsIn: the part of the headshunt between the station switch and the shed switch, where there is a shed */
  edges: { stubS?: Edge; stubN?: Edge; stubB?: Edge; t1: Edge; t2?: Edge; bS1?: Edge; bS2?: Edge; bN1?: Edge; bN2?: Edge; mainN?: Edge; hsIn?: Edge };
  mainSide?: "S" | "N";
  /** the switch on the headshunt that leads to the shed (normal: the headshunt, reverse: the shed lead) */
  switchShed?: Switch;
  shed?: Shed;
  signals: Record<string, Signal>;
  all: Edge[];
}

export interface ValleyLayout extends Layout {
  st: Record<string, StationLayout>;
}

/** A gentle curve turning by `angle` radians over `length` metres, starting at `from` heading +x. */
function arc(from: Pt, length: number, angle: number, n = 12): Pt[] {
  const R = length / Math.abs(angle);
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (angle * i) / n;
    out.push({ x: from.x + R * Math.sin(Math.abs(th)), y: from.y + Math.sign(angle) * R * (1 - Math.cos(th)) });
  }
  return out;
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

  // ----- Ashgrove -----
  const agBuf = g.node("AG-buf", 0, 0, { buffer: true });
  const agS = g.node("AG-S", 40, 0);
  const agB = g.node("AG-B", 80, 0);
  const agT1a = g.node("AG-t1a", 110, 0), agT2a = g.node("AG-t2a", 110, T2);
  const agT1b = g.node("AG-t1b", 310, 0), agT2b = g.node("AG-t2b", 310, T2);
  const agA = g.node("AG-A", 340, 0);
  const agH = g.node("AG-H", AG_LIMIT * 1000, 0);
  // the headshunt in two parts: the shed switch AG S lies 40 m from the buffer stop
  const agHs = g.edge("AG-hsOut", agBuf, agS, { kmA: 0, kmDir: 1, track: "hs" });
  const agHsIn = g.edge("AG-hsIn", agS, agB, { kmA: 0.04, kmDir: 1, track: "hs" });
  // Ashgrove Shed: three roads off the headshunt on the loop side, a ladder of switches, 70 m each to a buffer stop
  const SH = T2;
  const agT = g.node("AG-T", 10, SH), agU = g.node("AG-U", -20, 2 * SH), agSh3a = g.node("AG-sh3a", -50, 3 * SH);
  const FAR = -140; // every road ends at the same far wall
  const sh1b = g.node("AG-sh1b", FAR, SH, { buffer: true }), sh2b = g.node("AG-sh2b", FAR, 2 * SH, { buffer: true }), sh3b = g.node("AG-sh3b", FAR, 3 * SH, { buffer: true });
  const lead1 = g.edge("AG-lead1", agS, agT, { kmA: 0, kmDir: 1, track: "shl", line: "agshed", pts: sCurve({ x: 40, y: 0 }, { x: 10, y: SH }) });
  const road1 = g.edge("AG-sh1", agT, sh1b, { kmA: lead1.length / 1000, kmDir: 1, track: "sh1", line: "agshed" });
  const lead2 = g.edge("AG-lead2", agT, agU, { kmA: lead1.length / 1000, kmDir: 1, track: "shl", line: "agshed", pts: sCurve({ x: 10, y: SH }, { x: -20, y: 2 * SH }) });
  const road2 = g.edge("AG-sh2", agU, sh2b, { kmA: (lead1.length + lead2.length) / 1000, kmDir: 1, track: "sh2", line: "agshed" });
  const lead3 = g.edge("AG-lead3", agU, agSh3a, { kmA: (lead1.length + lead2.length) / 1000, kmDir: 1, track: "shl", line: "agshed", pts: sCurve({ x: -20, y: 2 * SH }, { x: -50, y: 3 * SH }) });
  const road3 = g.edge("AG-sh3", agSh3a, sh3b, { kmA: (lead1.length + lead2.length + lead3.length) / 1000, kmDir: 1, track: "sh3", line: "agshed" });
  const agB1 = g.edge("AG-B1", agB, agT1a, { kmA: 0.08, kmDir: 1, track: "sw" });
  const agB2 = g.edge("AG-B2", agB, agT2a, { kmA: 0.08, kmDir: 1, track: "sw", pts: sCurve({ x: 80, y: 0 }, { x: 110, y: T2 }) });
  const agT1 = g.edge("AG-t1", agT1a, agT1b, { kmA: 0.11, kmDir: 1, track: "1" });
  const agT2 = g.edge("AG-t2", agT2a, agT2b, { kmA: 0.11, kmDir: 1, track: "2" });
  const agA1 = g.edge("AG-A1", agT1b, agA, { kmA: 0.31, kmDir: 1, track: "sw" });
  const agA2 = g.edge("AG-A2", agT2b, agA, { kmA: 0.31, kmDir: 1, track: "sw", pts: sCurve({ x: 310, y: T2 }, { x: 340, y: 0 }) });
  const agStub = g.edge("AG-stub", agA, agH, { kmA: 0.34, kmDir: 1, track: "main" });
  const agSwB = g.switch("AG B", agB, agHsIn, agB1, agB2);
  const agSwA = g.switch("AG A", agA, agStub, agA1, agA2);
  const agSwS = g.switch("AG S", agS, agHsIn, agHs, lead1);
  const agSwT = g.switch("AG T", agT, lead1, road1, lead2);
  const agSwU = g.switch("AG U", agU, lead2, road2, lead3);
  const agShedSignals = {
    "7": sig("AG 7", "ground", "sh1", road1.kmA + 0.004, -1, "AG"),
    "9": sig("AG 9", "ground", "sh2", road2.kmA + 0.004, -1, "AG"),
    "11": sig("AG 11", "ground", "sh3", road3.kmA + 0.004, -1, "AG"),
  };
  const agShed: Shed = {
    id: "AGS", station: "AG", name: "Ashgrove Shed", line: "agshed", mainKm: 0.04, outDir: 1,
    roads: [
      { track: "sh1", edge: road1, exit: agShedSignals["7"], switches: [[agSwS, "reverse"], [agSwT, "normal"]], leads: [lead1] },
      { track: "sh2", edge: road2, exit: agShedSignals["9"], switches: [[agSwS, "reverse"], [agSwT, "reverse"], [agSwU, "normal"]], leads: [lead1, lead2] },
      { track: "sh3", edge: road3, exit: agShedSignals["11"], switches: [[agSwS, "reverse"], [agSwT, "reverse"], [agSwU, "reverse"]], leads: [lead1, lead2, lead3] },
    ],
    building: { x: FAR - 2, y: 3 * SH - 3.2, w: 62, h: -3 * SH + 6.4, angle: 0 },
  };
  st.AG = {
    code: "AG", kind: "terminus", mainSide: "N", switchS: agSwB, switchN: agSwA, switchShed: agSwS, shed: agShed,
    edges: { stubS: agHs, hsIn: agHsIn, stubN: agStub, t1: agT1, t2: agT2, bS1: agB1, bS2: agB2, bN1: agA1, bN2: agA2 },
    signals: {
      "1": sig("AG 1", "main", "1", 0.305, 1, "AG"),
      "2": sig("AG 2", "main", "main", 0.42, -1, "AG"),
      "3": sig("AG 3", "ground", "2", 0.305, 1, "AG"),
      "4": sig("AG 4", "ground", "1", 0.115, -1, "AG"),
      "5": sig("AG 5", "ground", "hs", 0.07, 1, "AG"),
      "6": sig("AG 6", "ground", "main", 0.35, -1, "AG"),
      ...agShedSignals,
    },
    all: [agHs, agHsIn, lead1, lead2, lead3, road1, road2, road3, agB1, agB2, agT1, agT2, agA1, agA2, agStub],
  };
  objects.push(
    board(g, "STOP-AG", "stop", "1", 0.135, -1, { label: "ASHGROVE" }),
    board(g, "LOS-AG", "limitOfShunt", "main", 0.4, 1, { label: "LIMIT OF SHUNT" }),
    board(g, "BUF-AG", "buffer", "hs", 0.0, -1),
    board(g, "BUF-SH1", "buffer", "sh1", road1.kmA + road1.length / 1000, 1),
    board(g, "BUF-SH2", "buffer", "sh2", road2.kmA + road2.length / 1000, 1),
    board(g, "BUF-SH3", "buffer", "sh3", road3.kmA + road3.length / 1000, 1),
  );

  // ----- Section A -----
  const wdH = g.node("WD-HS", WD_S_LIMIT * 1000, 0);
  const mainA = g.edge("main-A", agH, wdH, { kmA: AG_LIMIT, kmDir: 1, track: "main" });

  // ----- Wending: through station with the junction beyond its north switch -----
  const wdA = g.node("WD-A", 2960, 0);
  const wdT1a = g.node("WD-t1a", 2990, 0), wdT2a = g.node("WD-t2a", 2990, T2);
  const wdT1b = g.node("WD-t1b", 3190, 0), wdT2b = g.node("WD-t2b", 3190, T2);
  const wdB = g.node("WD-B", 3220, 0);
  const wdJ = g.node("WD-J", J_KM * 1000, 0);
  const wdHN = g.node("WD-HN", WD_N_LIMIT * 1000, 0);
  const wdStubS = g.edge("WD-stubS", wdH, wdA, { kmA: WD_S_LIMIT, kmDir: 1, track: "main" });
  const wdA1 = g.edge("WD-A1", wdA, wdT1a, { kmA: 2.96, kmDir: 1, track: "sw" });
  const wdA2 = g.edge("WD-A2", wdA, wdT2a, { kmA: 2.96, kmDir: 1, track: "sw", pts: sCurve({ x: 2960, y: 0 }, { x: 2990, y: T2 }) });
  const wdT1 = g.edge("WD-t1", wdT1a, wdT1b, { kmA: 2.99, kmDir: 1, track: "1" });
  const wdT2 = g.edge("WD-t2", wdT2a, wdT2b, { kmA: 2.99, kmDir: 1, track: "2" });
  const wdB1 = g.edge("WD-B1", wdT1b, wdB, { kmA: 3.19, kmDir: 1, track: "sw" });
  const wdB2 = g.edge("WD-B2", wdT2b, wdB, { kmA: 3.19, kmDir: 1, track: "sw", pts: sCurve({ x: 3190, y: T2 }, { x: 3220, y: 0 }) });
  const wdStubN = g.edge("WD-stubN", wdB, wdJ, { kmA: 3.22, kmDir: 1, track: "main" });
  const wdMainN = g.edge("WD-mainN", wdJ, wdHN, { kmA: J_KM, kmDir: 1, track: "main" });
  // the branch leaves the junction, curving away over 100 m, then runs straight into the side valley
  const brCurvePts = arc({ x: J_KM * 1000, y: 0 }, 100, -25 * Math.PI / 180);
  const brC = g.node("BR-c", brCurvePts[brCurvePts.length - 1].x, brCurvePts[brCurvePts.length - 1].y);
  const brDir = { x: Math.cos(-25 * Math.PI / 180), y: Math.sin(-25 * Math.PI / 180) };
  const at = (km: number): Pt => ({ x: brC.x + brDir.x * (km - 0.1) * 1000, y: brC.y + brDir.y * (km - 0.1) * 1000 });
  const fhH = g.node("FH-H", at(FH_LIMIT).x, at(FH_LIMIT).y);
  const fhP = g.node("FH-p", at(2.06).x, at(2.06).y);
  const fhBuf = g.node("FH-buf", at(BR_MAX).x, at(BR_MAX).y, { buffer: true });
  const brCurve = g.edge("BR-curve", wdJ, brC, { kmA: 0, kmDir: 1, track: "bm", line: "branch", pts: brCurvePts });
  const brMain = g.edge("BR-main", brC, fhH, { kmA: 0.1, kmDir: 1, track: "bm", line: "branch" });
  const fhStub = g.edge("FH-stub", fhH, fhP, { kmA: FH_LIMIT, kmDir: 1, track: "bm", line: "branch" });
  const fhT1 = g.edge("FH-1", fhP, fhBuf, { kmA: 2.06, kmDir: 1, track: "b1", line: "branch" });
  const wdSwA = g.switch("WD A", wdA, wdStubS, wdA1, wdA2);
  const wdSwB = g.switch("WD B", wdB, wdStubN, wdB1, wdB2);
  const wdSwJ = g.switch("WD J", wdJ, wdStubN, wdMainN, brCurve);
  st.WD = {
    code: "WD", kind: "through", switchS: wdSwA, switchN: wdSwB, switchJ: wdSwJ,
    edges: { stubS: wdStubS, stubN: wdStubN, stubB: brCurve, mainN: wdMainN, t1: wdT1, t2: wdT2, bS1: wdA1, bS2: wdA2, bN1: wdB1, bN2: wdB2 },
    signals: {
      "1": sig("WD 1", "main", "main", 2.88, 1, "WD"),
      "2": sig("WD 2", "main", "1", 2.995, -1, "WD"),
      "4": sig("WD 4", "main", "2", 2.995, -1, "WD", { subsidiary: true }),
      "5": sig("WD 5", "ground", "main", 2.95, 1, "WD"),
      "6": sig("WD 6", "ground", "main", 3.23, -1, "WD"),
      "7": sig("WD 7", "main", "1", 3.185, 1, "WD", { subsidiary: true }),
      "8": sig("WD 8", "main", "main", 3.44, -1, "WD", { subsidiary: true, callOn: true }),
      "9": sig("WD 9", "main", "2", 3.185, 1, "WD"),
      "10": sig("WD 10", "main", "bm", 0.08, -1, "WD", { subsidiary: true, callOn: true }),
    },
    all: [wdStubS, wdA1, wdA2, wdT1, wdT2, wdB1, wdB2, wdStubN],
  };
  objects.push(
    board(g, "STOP-WD1", "stop", "1", 3.165, 1, { label: "WENDING" }),
    board(g, "STOP-WD2", "stop", "2", 3.015, -1, { label: "WENDING" }),
    board(g, "LOS-WDS", "limitOfShunt", "main", 2.9, -1, { label: "LIMIT OF SHUNT" }),
    board(g, "LOS-WDN", "limitOfShunt", "main", 3.28, 1, { label: "LIMIT OF SHUNT" }),
  );

  // ----- Section B: Wending–Coldwater -----
  const cwH = g.node("CW-H", CW_LIMIT * 1000, 0);
  const mainB = g.edge("main-B", wdHN, cwH, { kmA: WD_N_LIMIT, kmDir: 1, track: "main" });
  objects.push(
    board(g, "SEC-D", "section", "main", 4.10, 1), board(g, "RES-U", "resume", "main", 4.10, -1),
    board(g, "RES-D", "resume", "main", 4.30, 1), board(g, "SEC-U", "section", "main", 4.30, -1),
    board(g, "W-D", "whistle", "main", 4.50, 1), board(g, "W-U", "whistle", "main", 4.90, -1),
  );

  // ----- Coldwater -----
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

  // ----- Fernhollow: a simple terminus on the branch, one platform track, no loop -----
  st.FH = {
    code: "FH", kind: "simple", mainSide: "S",
    edges: { stubS: fhStub, t1: fhT1 },
    signals: {
      "1": sig("FH 1", "main", "bm", 2.03, 1, "FH"),
      "2": sig("FH 2", "main", "b1", 2.085, -1, "FH"),
    },
    all: [fhStub, fhT1],
  };
  objects.push(
    board(g, "STOP-FH", "stop", "b1", 2.255, 1, { label: "FERNHOLLOW" }),
    board(g, "BUF-FH", "buffer", "b1", BR_MAX, 1),
  );

  // ----- distants -----
  sig("AG 2D", "distant", "main", 0.42 + WARNING_DISTANCE_FALLING_KM, -1, "AG", { distantOf: "AG 2" });
  sig("WD 1D", "distant", "main", 2.88 - WARNING_DISTANCE_KM, 1, "WD", { distantOf: "WD 1" });
  sig("WD 8D", "distant", "main", 3.44 + WARNING_DISTANCE_KM, -1, "WD", { distantOf: "WD 8" });
  sig("WD 10D", "distant", "bm", 0.08 + WARNING_DISTANCE_FALLING_KM, -1, "WD", { distantOf: "WD 10" });   // Up approach falls 10‰
  sig("CW 1D", "distant", "main", 5.98 - WARNING_DISTANCE_KM, 1, "CW", { distantOf: "CW 1" });
  sig("FH 1D", "distant", "bm", 2.03 - WARNING_DISTANCE_KM, 1, "FH", { distantOf: "FH 1" });

  // ----- speed boards, posts, indicators -----
  objects.push(
    ...limitBoards(g, "AG", "main", AG_LIMIT, -1, true, 25, 50),
    ...limitBoards(g, "WDS", "main", WD_S_LIMIT, 1, false, 25, 50),
    ...limitBoards(g, "WDN", "main", WD_N_LIMIT, -1, false, 25, 50),
    ...limitBoards(g, "CW", "main", CW_LIMIT, 1, false, 25, 50),
    ...limitBoards(g, "WDB", "bm", BR_LIMIT, -1, true, 25, 40),
    ...limitBoards(g, "FH", "bm", FH_LIMIT, 1, false, 25, 40),
    ...gradientPosts(g, mainLine), ...gradientPosts(g, branchLine), ...switchIndicators(g),
  );

  const inLoop = (km: number) => (km > 0.08 && km < 0.34) || (km > 2.96 && km < 3.22) || (km > 6.06 && km < 6.32);
  return {
    name: "Ashgrove–Wending–Coldwater and the Fernhollow branch",
    graph: g, objects, platforms, kmMax: KM_MAX, lines: LINES, speedZones: mainLine.speedZones, profile: mainLine.profile,
    limitAt, limitOver, gradientAt, elevationAt, zones: [[0, KM_MAX, 1]],
    posts: [...postsOn(g, mainLine, (km) => (inLoop(km) ? -T2 : 0)), ...postsOn(g, branchLine, () => 0)],
    stations: [
      { code: "AG", name: "Ashgrove", master: "Marrow", stops: [{ dir: -1, track: "1", km: 0.135, platform: P.AG, line: "main" }], edges: st.AG.all },
      { code: "WD", name: "Wending", master: "Pell", stops: [{ dir: 1, track: "1", km: 3.165, platform: P.WD1, line: "main" }, { dir: -1, track: "2", km: 3.015, platform: P.WD2, line: "main" }], edges: st.WD.all },
      { code: "CW", name: "Coldwater", master: "Ashby", stops: [{ dir: 1, track: "1", km: 6.265, platform: P.CW, line: "main" }], edges: st.CW.all },
      { code: "FH", name: "Fernhollow", master: "Thorne", stops: [{ dir: 1, track: "b1", km: 2.255, platform: P.FH, line: "branch" }], edges: st.FH.all },
    ],
    sections: [
      { id: "A", name: "Ashgrove–Wending", from: "AG", to: "WD", edges: [agStub, mainA, wdStubS] },
      { id: "B", name: "Wending–Coldwater", from: "WD", to: "CW", edges: [wdMainN, mainB, cwStub] },
      { id: "C", name: "Wending–Fernhollow", from: "WD", to: "FH", edges: [brCurve, brMain, fhStub] },
    ],
    neutral: [{ id: "N1", line: "main", kmFrom: 4.19, kmTo: 4.21 }],
    crossings: [{ id: "X1", name: "Millers' Crossing", line: "main", km: 4.70 }],
    sheds: [agShed],
    st,
  };
}
