/**
 * The track is a graph. Nodes are joints (plain joints, switches, buffer
 * stops); edges are pieces of track with a length and a drawn polyline.
 * A Position is (edge, s, dir): s metres from the edge's a-end, dir the
 * direction of travel (+1 towards b, -1 towards a).
 */

export type Dir = 1 | -1;
export interface Pt { x: number; y: number }

export interface Node {
  id: string;
  x: number;
  y: number;
  edges: Edge[];
  switch?: Switch;
  buffer?: boolean;
}

export interface Edge {
  id: string;
  a: Node;
  b: Node;
  length: number;
  pts: Pt[];       // polyline from a to b, world metres
  cum: number[];   // cumulative length at each point
  /** kilometrage at the a end and its direction along the edge */
  kmA: number;
  kmDir: Dir;
  /** logical track name for placing things: "main" | "1" | "2" | "hs" ... */
  track: string;
  /** the line whose kilometrage this edge carries: "main" or "branch" */
  line: string;
}

export type SwitchState = "normal" | "reverse";
export interface Switch {
  id: string;
  node: Node;
  toe: Edge;
  normal: Edge;
  reverse: Edge;
  state: SwitchState;
  /** set while a route holds it */
  locked: boolean;
  /** ids of the live routes holding this switch in its position */
  locks: Set<string>;
}

export interface Position {
  edge: Edge;
  s: number;
  dir: Dir;
}

export const clonePos = (p: Position): Position => ({ edge: p.edge, s: p.s, dir: p.dir });
export const reversed = (p: Position): Position => ({ edge: p.edge, s: p.s, dir: (p.dir * -1) as Dir });

export function kmOf(p: Position): number {
  return p.edge.kmA + (p.edge.kmDir * p.s) / 1000;
}

/** Direction of travel in kilometrage terms: +1 = Down (increasing km). */
export function kmDirOf(p: Position): Dir {
  return (p.edge.kmDir * p.dir) as Dir;
}

export function pointAt(edge: Edge, s: number): Pt {
  const { pts, cum } = edge;
  if (s <= 0) return pts[0];
  if (s >= edge.length) return pts[pts.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < s) i++;
  const s0 = cum[i - 1], s1 = cum[i];
  const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
  const p0 = pts[i - 1], p1 = pts[i];
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

/** Unit tangent at s, pointing in +s direction. */
export function tangentAt(edge: Edge, s: number): Pt {
  const { pts, cum } = edge;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const p0 = pts[i - 1], p1 = pts[i];
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

export const worldPoint = (p: Position): Pt => pointAt(p.edge, p.s);

/** The edge you reach when leaving `from` through `node`, or null at a buffer. */
export function nextEdge(node: Node, from: Edge): { edge: Edge; trailingAgainst: boolean } | null {
  const sw = node.switch;
  if (sw) {
    if (from === sw.toe) {
      return { edge: sw.state === "normal" ? sw.normal : sw.reverse, trailingAgainst: false };
    }
    const selected = sw.state === "normal" ? sw.normal : sw.reverse;
    return { edge: sw.toe, trailingAgainst: from !== selected };
  }
  const others = node.edges.filter((e) => e !== from);
  if (others.length === 0) return null;
  return { edge: others[0], trailingAgainst: false };
}

export interface AdvanceResult {
  pos: Position;
  /** metres actually moved */
  moved: number;
  hitBuffer: boolean;
  trailedAgainst: Switch | null;
  /** edges traversed, including start and end edges */
  edges: Edge[];
}

/** Move a position `d` metres along its direction of travel (d may be negative). */
export function advance(start: Position, d: number): AdvanceResult {
  let pos = clonePos(start);
  if (d < 0) {
    const r = advance(reversed(start), -d);
    return { ...r, pos: reversed(r.pos) };
  }
  const edges: Edge[] = [pos.edge];
  let moved = 0;
  let trailedAgainst: Switch | null = null;
  let remaining = d;
  for (let guard = 0; guard < 64; guard++) {
    const room = pos.dir === 1 ? pos.edge.length - pos.s : pos.s;
    if (remaining <= room) {
      pos.s += pos.dir * remaining;
      moved += remaining;
      return { pos, moved, hitBuffer: false, trailedAgainst, edges };
    }
    remaining -= room;
    moved += room;
    const node = pos.dir === 1 ? pos.edge.b : pos.edge.a;
    const nx = nextEdge(node, pos.edge);
    if (!nx) {
      pos.s = pos.dir === 1 ? pos.edge.length : 0;
      return { pos, moved, hitBuffer: true, trailedAgainst, edges };
    }
    if (nx.trailingAgainst && node.switch) trailedAgainst = node.switch;
    const e = nx.edge;
    const dir: Dir = e.a === node ? 1 : -1;
    pos = { edge: e, s: dir === 1 ? 0 : e.length, dir };
    edges.push(e);
  }
  return { pos, moved, hitBuffer: false, trailedAgainst, edges };
}

/** Distance along the path from `from` (in its direction) to a point on `edge` at `s`, within `max`. */
export function distanceAlong(from: Position, edge: Edge, s: number, max: number): number | null {
  let pos = clonePos(from);
  let travelled = 0;
  for (let guard = 0; guard < 64 && travelled <= max; guard++) {
    if (pos.edge === edge) {
      const dd = (s - pos.s) * pos.dir;
      if (dd >= -1e-6) return travelled + dd;
    }
    const room = pos.dir === 1 ? pos.edge.length - pos.s : pos.s;
    travelled += room;
    const node = pos.dir === 1 ? pos.edge.b : pos.edge.a;
    const nx = nextEdge(node, pos.edge);
    if (!nx) return null;
    const e = nx.edge;
    const dir: Dir = e.a === node ? 1 : -1;
    pos = { edge: e, s: dir === 1 ? 0 : e.length, dir };
  }
  return null;
}

/** Enumerate (edge, sFrom, sTo, dir, offset) stretches ahead of `from` up to `max` metres. */
export interface Stretch { edge: Edge; s0: number; s1: number; dir: Dir; offset: number }
export function pathAhead(from: Position, max: number): Stretch[] {
  const out: Stretch[] = [];
  let pos = clonePos(from);
  let travelled = 0;
  for (let guard = 0; guard < 64 && travelled < max; guard++) {
    const room = pos.dir === 1 ? pos.edge.length - pos.s : pos.s;
    const take = Math.min(room, max - travelled);
    out.push({ edge: pos.edge, s0: pos.s, s1: pos.s + pos.dir * take, dir: pos.dir, offset: travelled });
    travelled += take;
    if (take < room) break;
    const node = pos.dir === 1 ? pos.edge.b : pos.edge.a;
    const nx = nextEdge(node, pos.edge);
    if (!nx) break;
    const e = nx.edge;
    const dir: Dir = e.a === node ? 1 : -1;
    pos = { edge: e, s: dir === 1 ? 0 : e.length, dir };
  }
  return out;
}

/* ---------- Building ---------- */

export class TrackGraph {
  nodes: Node[] = [];
  edges: Edge[] = [];
  switches: Switch[] = [];

  node(id: string, x: number, y: number, opts: { buffer?: boolean } = {}): Node {
    const n: Node = { id, x, y, edges: [], buffer: opts.buffer };
    this.nodes.push(n);
    return n;
  }

  edge(id: string, a: Node, b: Node, opts: { kmA: number; kmDir: Dir; track: string; pts?: Pt[]; line?: string }): Edge {
    const pts = opts.pts ?? [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const e: Edge = { id, a, b, pts, cum, length: cum[cum.length - 1], kmA: opts.kmA, kmDir: opts.kmDir, track: opts.track, line: opts.line ?? "main" };
    a.edges.push(e);
    b.edges.push(e);
    this.edges.push(e);
    return e;
  }

  switch(id: string, node: Node, toe: Edge, normal: Edge, reverse: Edge): Switch {
    const sw: Switch = { id, node, toe, normal, reverse, state: "normal", locked: false, locks: new Set() };
    node.switch = sw;
    this.switches.push(sw);
    return sw;
  }

  /** Find the edge of a given track containing the kilometre, and the position there. */
  atKm(track: string, km: number, kmDir: Dir): Position {
    for (const e of this.edges) {
      if (e.track !== track) continue;
      const kmB = e.kmA + (e.kmDir * e.length) / 1000;
      const lo = Math.min(e.kmA, kmB), hi = Math.max(e.kmA, kmB);
      if (km >= lo - 1e-9 && km <= hi + 1e-9) {
        const s = ((km - e.kmA) * e.kmDir) * 1000;
        return { edge: e, s: Math.max(0, Math.min(e.length, s)), dir: (e.kmDir * kmDir) as Dir };
      }
    }
    throw new Error(`no edge on track ${track} at km ${km}`);
  }

  /** Find the position at a kilometre on a line (any track of that line, plain running edges first). */
  atKmOn(line: string, km: number, kmDir: Dir): Position {
    const candidates = this.edges.filter((e) => e.line === line && e.track !== "sw").concat(this.edges.filter((e) => e.line === line && e.track === "sw"));
    for (const e of candidates) {
      const kmB = e.kmA + (e.kmDir * e.length) / 1000;
      const lo = Math.min(e.kmA, kmB), hi = Math.max(e.kmA, kmB);
      if (km >= lo - 1e-9 && km <= hi + 1e-9) {
        const s = ((km - e.kmA) * e.kmDir) * 1000;
        return { edge: e, s: Math.max(0, Math.min(e.length, s)), dir: (e.kmDir * kmDir) as Dir };
      }
    }
    throw new Error(`no edge on line ${line} at km ${km}`);
  }

  byId(id: string): Edge {
    const e = this.edges.find((x) => x.id === id);
    if (!e) throw new Error(`no edge ${id}`);
    return e;
  }
}

/** A gentle S-curve between two points for a diverging switch branch. */
export function sCurve(a: Pt, b: Pt, n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const e = t * t * (3 - 2 * t); // smoothstep
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * e });
  }
  return out;
}
