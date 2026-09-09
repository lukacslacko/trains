import { type Layout, type Signal, type Board, type Trackside, type StationInfo } from "../track/layouts";
import { type Position, type Edge, type Pt, type Dir, type Switch, type SwitchState, advance, reversed, worldPoint, pathAhead, kmOf, kmDirOf, tangentAt } from "../track/graph";

/** metres from a vehicle end to the cab door, to the driver's seat, and how far beside the track a person stands */
const CAB_DOOR_INWARD = 2.6, SEAT_INWARD = 1.4, ASIDE = 2.6;
import { Vehicle, Consist, type End, type Cab, type LightState, type BrakeStep, type Reverser, stepConsist } from "../stock/vehicles";
import { fmtTime, kmh } from "../core/util";
import { type Box } from "./duty";

export interface Message { t: number; from: string; text: string; kind: "box" | "system" | "driver" }
export interface Incident { t: number; code: string; text: string; note?: boolean }

export type Anchor =
  | { kind: "cab"; vehicle: Vehicle; end: End }
  | { kind: "coupling"; consist: Consist; index: number };

export type DriverLocation =
  | { kind: "cab"; vehicle: Vehicle; end: End }
  | { kind: "ground"; at: Anchor }
  | { kind: "walking"; from: Pt; target: Anchor; t: number; duration: number }
  /** the player in the signaller's chair of a station's box */
  | { kind: "box"; code: string };

export interface Route {
  id: string;
  station: string;
  switches: [Switch, SwitchState][];
  signals: [Signal, Signal["aspect"]][];
  /** edges that must be unoccupied */
  clear: Edge[];
  /** the edge the movement ends on or continues along; not watched for release */
  dest?: Edge;
  /** set while the route holds its switches */
  live?: boolean;
}

export interface AheadItem { kind: "signal" | "board" | "vehicle" | "buffer"; label: string; dist: number; obj?: Trackside; aspect?: string; applies: boolean }

export interface Station extends StationInfo {
  /** vehicle numbers of the trains the baton is shown to */
  baton: Set<string>;
}

export class World {
  layout: Layout;
  time: number;
  warp = 1;
  paused = false;
  consists: Consist[] = [];
  vehicles: Vehicle[] = [];
  driver: DriverLocation;
  messages: Message[] = [];
  incidents: Incident[] = [];
  stations: Station[];
  routes: Route[] = [];
  /** the boxes of the line, in the order they were built */
  boxes: Box[] = [];
  /** the passenger train the duty is about */
  trainVehicle: Vehicle;
  brakeTest: { consist: Consist; t: number } | null = null;
  hooks: ((w: World, dt: number) => void)[] = [];
  /** when set, the UI runs the world quickly until this time (a "wait for departure" convenience) */
  skipUntil: number | null = null;
  private prevLead = new Map<Consist, { pos: Position; v: number }>();
  private flagsOf = new Map<Consist, { doorsMoving: boolean; lightsBad: boolean; overspeed: boolean }>();
  private flagsFor(c: Consist) {
    let f = this.flagsOf.get(c);
    if (!f) { f = { doorsMoving: false, lightsBad: false, overspeed: false }; this.flagsOf.set(c, f); }
    return f;
  }
  /** per-consist bookkeeping for rolling back, running away and dragging the parking brake */
  private motion = new Map<Consist, { intended: number; wrong: number; flagged: boolean; drag: number; dragFlagged: boolean }>();
  finished: string | null = null;
  /** vehicles driven by colleagues, whose incidents are not the player's */
  npc = new Set<Vehicle>();
  /** block warrants out: section id → train (vehicle number) */
  warrants = new Map<string, string>();
  private whistleDue = new Map<Consist, { km: number; dir: Dir; since: number }>();
  /** where each consist last came to rest, to tell a departure past a stop board from an overrun */
  private restKm = new Map<Consist, number>();
  /** drivers of the colleagues' trains, for inspection */
  npcDrivers: unknown[] = [];
  private inNeutral = new Map<Consist, boolean>();

  constructor(layout: Layout, startTime: number, trainVehicle: Vehicle, driver: DriverLocation) {
    this.layout = layout;
    this.time = startTime;
    this.trainVehicle = trainVehicle;
    this.driver = driver;
    this.stations = layout.stations.map((s) => ({ ...s, baton: new Set<string>() }));
  }

  /* ---------- messages & incidents ---------- */

  say(from: string, text: string, kind: Message["kind"] = "box") {
    this.messages.push({ t: this.time, from, text, kind });
  }
  isNpc(c: Consist): boolean { return c.vehicles.some((v) => this.npc.has(v)); }
  /** colleagues' incidents: not the player's book, but kept for the record */
  npcIncidents: string[] = [];
  incident(code: string, text: string, note = false, c?: Consist) {
    if (c && this.isNpc(c)) { this.npcIncidents.push(`${fmtTime(this.time)} ${code}: ${text}`); return; } // a colleague's affair, not the player's
    // de-duplicate identical incidents within 10 s
    const last = this.incidents[this.incidents.length - 1];
    if (last && last.code === code && this.time - last.t < 10) return;
    this.incidents.push({ t: this.time, code, text, note });
    this.say("Incident Book", `${fmtTime(this.time)} — ${text}`, "system");
  }

  /* ---------- queries ---------- */

  get signals(): Signal[] { return this.layout.objects.filter((o): o is Signal => o.kind === "signal"); }
  get boards(): Board[] { return this.layout.objects.filter((o): o is Board => o.kind === "board"); }
  signal(id: string): Signal { const s = this.signals.find((x) => x.id === id); if (!s) throw new Error(`no signal ${id}`); return s; }
  station(code: string): Station { return this.stations.find((s) => s.code === code)!; }

  consistOf(v: Vehicle): Consist { return this.consists.find((c) => c.vehicles.includes(v))!; }
  get train(): Consist { return this.consistOf(this.trainVehicle); }

  /** The consist the driver is driving (or standing at). */
  get driverConsist(): Consist | null {
    const d = this.driver;
    if (d.kind === "cab") return this.consistOf(d.vehicle);
    if (d.kind === "ground") return d.at.kind === "cab" ? this.consistOf(d.at.vehicle) : d.at.consist;
    return null;
  }
  get driverCab(): { vehicle: Vehicle; cab: Cab; consist: Consist } | null {
    const d = this.driver;
    if (d.kind !== "cab") return null;
    return { vehicle: d.vehicle, cab: d.vehicle.cabs[d.end]!, consist: this.consistOf(d.vehicle) };
  }

  edgesOf(v: Vehicle): Edge[] {
    return advance(reversed(v.pos), v.length).edges;
  }
  occupancy(): Map<Edge, Vehicle[]> {
    const m = new Map<Edge, Vehicle[]>();
    for (const v of this.vehicles) for (const e of this.edgesOf(v)) m.set(e, [...(m.get(e) ?? []), v]);
    return m;
  }
  isOccupied(e: Edge, except?: Consist): boolean {
    const occ = this.occupancy().get(e) ?? [];
    return occ.some((v) => !except || !except.vehicles.includes(v));
  }
  /** true when all the consist's vehicles lie entirely within the given edges */
  whollyOn(c: Consist, edges: Edge[]): boolean {
    return c.vehicles.every((v) => this.edgesOf(v).every((e) => edges.includes(e)));
  }

  /** A point beside the track: `inward` metres back from a vehicle end, `aside` metres to the platform side. */
  private besideTrack(endPos: Position, inward: number, aside: number): Pt {
    const p = advance(endPos, -inward).pos;
    const pt = worldPoint(p);
    const t = tangentAt(p.edge, p.s);
    // platform side is +y in the world; pick the normal that points that way
    let n = { x: -t.y, y: t.x };
    if (n.y < 0) n = { x: -n.x, y: -n.y };
    return { x: pt.x + n.x * aside, y: pt.y + n.y * aside };
  }
  /** Where the driver stands on the ground for an anchor: beside the cab door, or beside the coupling. */
  anchorPoint(a: Anchor): Pt {
    if (a.kind === "cab") return this.besideTrack(a.vehicle.endPos(a.end), CAB_DOOR_INWARD, ASIDE);
    const v = a.consist.vehicles[a.index];
    const end: End = a.consist.flip[a.index] ? "A" : "B";
    return this.besideTrack(v.endPos(end), 0, ASIDE);
  }
  /** The driver's seat in a cab: inside the vehicle, a little back from the end. */
  seatPoint(vehicle: Vehicle, end: End): Pt {
    return this.besideTrack(vehicle.endPos(end), SEAT_INWARD, 0);
  }
  /** The signal box of a station: at the stop-board end of its first platform, on the platform side, clear of the posts. */
  boxPoint(code: string): Pt {
    const stop = this.station(code).stops[0];
    const pos = this.layout.graph.atKm(stop.track, stop.km, 1);
    const p = worldPoint(pos);
    const t = tangentAt(pos.edge, pos.s);
    const tt = pos.edge.kmDir === 1 ? t : { x: -t.x, y: -t.y };
    const n = { x: -tt.y * stop.platform.side, y: tt.x * stop.platform.side };
    const along = stop.dir * 16, out = 9.5;
    return { x: p.x + tt.x * along + n.x * out, y: p.y + tt.y * along + n.y * out };
  }
  /** the tangent of the track beside a box, for drawing it square to the line */
  boxTangent(code: string): Pt {
    const stop = this.station(code).stops[0];
    const pos = this.layout.graph.atKm(stop.track, stop.km, 1);
    return tangentAt(pos.edge, pos.s);
  }
  /** Where the view follows: the driver, or, from the box, the middle of the station's first platform. */
  viewPoint(): Pt {
    const d = this.driver;
    if (d.kind !== "box") return this.driverPoint();
    const stop = this.station(d.code).stops[0];
    const km = (stop.platform.kmFrom + stop.platform.kmTo) / 2;
    return worldPoint(this.layout.graph.atKm(stop.track, km, 1));
  }
  driverPoint(): Pt {
    const d = this.driver;
    if (d.kind === "cab") return this.seatPoint(d.vehicle, d.end);
    if (d.kind === "ground") return this.anchorPoint(d.at);
    if (d.kind === "box") return this.boxPoint(d.code);
    const to = this.anchorPoint(d.target);
    const t = Math.min(1, d.t / d.duration);
    return { x: d.from.x + (to.x - d.from.x) * t, y: d.from.y + (to.y - d.from.y) * t };
  }

  /** What lies ahead of a consist's leading end (in the direction of its cab's Forward if stationary). */
  ahead(c: Consist, max = 1200): AheadItem[] {
    const ctl = c.control;
    let sign = c.v !== 0 ? Math.sign(c.v) : 0;
    if (sign === 0 && ctl) sign = c.cabForwardSign(ctl.index, ctl.cab) * (ctl.cab.reverser === "R" ? -1 : 1);
    if (sign === 0) sign = 1;
    const lead = c.leadingPos(sign);
    const items: AheadItem[] = [];
    const stretches = pathAhead(lead, max);
    for (const st of stretches) {
      const lo = Math.min(st.s0, st.s1), hi = Math.max(st.s0, st.s1);
      for (const o of this.layout.objects) {
        if (o.pos.edge !== st.edge) continue;
        if (o.pos.s < lo - 1e-6 || o.pos.s > hi + 1e-6) continue;
        const d = st.offset + Math.abs(o.pos.s - st.s0);
        if (d < 0.3 && o.kind !== "board") continue;
        const facing = o.pos.dir === st.dir;
        if (!facing) continue;
        if (o.kind === "signal") {
          const applies = o.type === "ground" ? !c.isTrain : true;
          const label = o.type === "distant" ? `${o.id} (distant for ${o.distantOf})` : o.id;
          items.push({ kind: "signal", label, dist: d, obj: o, aspect: o.aspect, applies });
        } else {
          let label = o.board === "stop" ? `Stop board ${o.label}` : o.board === "limitOfShunt" ? "Limit of Shunt" : o.board === "speed" ? `Speed ${o.value}` : o.board === "speedAdvance" ? `Speed ${o.value} ahead` : o.board === "gradient" ? `Gradient post · ${o.value === 0 ? "level" : `${Math.abs(o.value!)}‰ ${o.value! > 0 ? "rising" : "falling"}`} ahead` : o.board === "whistle" ? "Whistle board · one long blast" : o.board === "section" ? "Section board · power off" : o.board === "resume" ? "Resume board · power may be taken" : "Buffer stop";
          if (o.board === "switchIndicator" && o.sw) {
            const set = o.sw.state === "normal" ? o.sw.normal : o.sw.reverse;
            if (o.approach === "toe") {
              const far = set.a === o.sw.node ? set.b : set.a;
              const onward = far.edges.find((e) => e !== set);
              label = `Switch ${o.sw.id} · lies ${o.sw.state === "normal" ? "straight" : "diverging"}${onward && onward.track !== "sw" ? ` (to ${onward.track === "hs" ? "the headshunt" : onward.track === "main" ? "the main line" : onward.line === "branch" ? "the Fernhollow branch" : "track " + onward.track})` : ""}`;
            }
            else label = `Switch ${o.sw.id} · ${o.approach === o.sw.state ? "set for you" : "SET AGAINST YOU"}`;
          }
          const applies = o.board === "stop" ? c.isTrain : o.board === "limitOfShunt" ? !c.isTrain : true;
          items.push({ kind: o.board === "buffer" ? "buffer" : "board", label, dist: d, obj: o, applies });
        }
      }
      for (const other of this.consists) {
        if (other === c) continue;
        for (const v of other.vehicles) for (const end of ["A", "B"] as End[]) {
          const p = v.endPos(end);
          if (p.edge !== st.edge) continue;
          if (p.s < lo - 1e-6 || p.s > hi + 1e-6) continue;
          const d = st.offset + Math.abs(p.s - st.s0);
          items.push({ kind: "vehicle", label: `${v.type.cls} ${v.number} (end ${end})`, dist: d, applies: true });
        }
      }
    }
    items.sort((a, b) => a.dist - b.dist);
    // keep only the nearest vehicle end
    let seenVehicle = false;
    return items.filter((i) => { if (i.kind !== "vehicle") return true; if (seenVehicle) return false; seenVehicle = true; return true; });
  }

  /** Gradient in per mille under a vehicle's centre, positive = rising Down. */
  gradeUnder(v: Vehicle): number {
    const a = v.pos, b = v.posB;
    if (a.edge.line === b.edge.line) return this.layout.gradientAt((kmOf(a) + kmOf(b)) / 2, a.edge.line);
    return this.layout.gradientAt(kmOf(a), a.edge.line);
  }
  /** Downhill force on the consist, signed in the consist reference direction (N). */
  gravityOn(c: Consist): number {
    const f = c.frontEnd();
    const refDown = kmDirOf(f.vehicle.endPos(f.end)); // +1 when the reference direction is Down
    let F = 0;
    for (const v of c.vehicles) F += -v.mass * 1000 * 9.81 * (this.gradeUnder(v) / 1000) * refDown;
    return F;
  }
  /** Gradient ahead of a cab in the direction it faces, per mille, positive = rising ahead. */
  gradeAhead(vehicle: Vehicle, cab: Cab): number {
    const p = vehicle.endPos(cab.end);
    return this.layout.gradientAt(kmOf(p), p.edge.line) * kmDirOf(p);
  }
  setParkingBrake(on: boolean) {
    const c = this.requireCab(); if (!c) return;
    c.vehicle.parkingBrake = on;
  }

  /** Speed limit for a consist right now: the lowest limit under any part of it (Rule R 10). */
  limitFor(c: Consist): number {
    const f = c.frontEnd(), r = c.rearEnd();
    const pf = f.vehicle.endPos(f.end), pr = r.vehicle.endPos(r.end);
    let lim = pf.edge.line === pr.edge.line
      ? this.layout.limitOver(kmOf(pf), kmOf(pr), pf.edge.line)
      : Math.min(this.layout.limitAt(kmOf(pf), pf.edge.line), this.layout.limitAt(kmOf(pr), pr.edge.line));
    if (!c.isTrain || c.callOn) lim = Math.min(lim, 15);
    return lim;
  }

  /* ---------- routes / interlocking ---------- */

  /** No vehicle end within 12 m of the switch's node, and no vehicle standing across it. */
  switchClear(sw: Switch): boolean {
    const legs = [sw.toe, sw.normal, sw.reverse];
    for (const v of this.vehicles) {
      const occ = this.edgesOf(v);
      if (occ.filter((e) => legs.includes(e)).length >= 2) return false;
      for (const end of ["A", "B"] as End[]) {
        const p = v.endPos(end);
        if (!legs.includes(p.edge)) continue;
        const dNode = p.edge.a === sw.node ? p.s : p.edge.length - p.s;
        if (dNode < 12) return false;
      }
    }
    return true;
  }
  /** the track a route holds while it is live: its clear stretch and its destination */
  routeEdges(r: Route): Edge[] { return r.dest && !r.clear.includes(r.dest) ? [...r.clear, r.dest] : r.clear; }
  /** A live route holding track this route would need, or null. Two routes are never set over the same track. */
  conflictingRoute(r: Route): { route: Route; edge: Edge } | null {
    const mine = new Set(this.routeEdges(r));
    for (const o of this.routes) {
      if (o === r || !o.live) continue;
      const shared = this.routeEdges(o).find((e) => mine.has(e));
      if (shared) return { route: o, edge: shared };
    }
    return null;
  }
  /** Set a route: its switches must be free to move, its track clear and held by no other route; it then holds them until the train has passed. */
  setRoute(id: string): boolean {
    const r = this.routes.find((x) => x.id === id);
    if (!r) throw new Error(`no route ${id}`);
    if (r.live) return true;
    for (const [sw, st] of r.switches) {
      if (sw.state !== st && (sw.locks.size > 0 || !this.switchClear(sw))) return false;
    }
    if (r.clear.some((e) => this.isOccupied(e))) return false;
    if (this.conflictingRoute(r)) return false;
    for (const [sw, st] of r.switches) { sw.state = st; sw.locks.add(r.id); sw.locked = true; }
    for (const [sig, asp] of r.signals) sig.aspect = asp;
    r.live = true;
    return true;
  }
  /** Is any vehicle within the stretch [sA, sB] of an edge (an end inside it, or a vehicle spanning it)? */
  private occupiedBetween(edge: Edge, sA: number, sB: number): boolean {
    const lo = Math.min(sA, sB), hi = Math.max(sA, sB);
    for (const v of this.vehicles) {
      const pa = v.pos, pb = v.posB;
      const onA = pa.edge === edge, onB = pb.edge === edge;
      if (onA && pa.s >= lo && pa.s <= hi) return true;
      if (onB && pb.s >= lo && pb.s <= hi) return true;
      if (onA && onB && Math.min(pa.s, pb.s) < lo && Math.max(pa.s, pb.s) > hi) return true;
      if (onA !== onB && this.edgesOf(v).includes(edge)) {
        // one end off the edge: the vehicle covers from that end's side of the edge to its on-edge end
        const on = onA ? pa : pb;
        const towardsEnd = onA ? (pa.dir === 1 ? edge.length : 0) : (pb.dir === 1 ? edge.length : 0);
        const a = Math.min(on.s, towardsEnd), b = Math.max(on.s, towardsEnd);
        if (a < hi && b > lo) return true;
      }
    }
    return false;
  }
  /** Release live routes whose signals have been passed and whose approach, switches and sections the train has cleared. */
  private releaseRoutes() {
    for (const r of this.routes) {
      if (!r.live) continue;
      if (r.signals.some(([sig]) => sig.aspect !== "stop")) continue;
      const watch = new Set<Edge>(r.clear);
      if (r.dest) watch.delete(r.dest);
      if ([...watch].some((e) => this.isOccupied(e))) continue;
      // the approach: from each signal to the end of its edge in the direction it faces
      let approachBusy = false;
      for (const [sig] of r.signals) {
        const e = sig.pos.edge;
        const end = sig.pos.dir === 1 ? e.length : 0;
        if (this.occupiedBetween(e, sig.pos.s, end)) approachBusy = true;
      }
      if (approachBusy) continue;
      if (r.switches.some(([sw]) => !this.switchClear(sw))) continue;
      r.live = false;
      for (const [sw] of r.switches) { sw.locks.delete(r.id); sw.locked = sw.locks.size > 0; }
    }
  }
  replaceSignal(id: string) { this.signal(id).aspect = "stop"; }
  /** Why a route cannot be set now, in the frame's words, or null when it can. */
  routeBlocked(id: string): string | null {
    const r = this.routes.find((x) => x.id === id);
    if (!r) return "no such route";
    if (r.live) return null;
    for (const [sw, st] of r.switches) {
      if (sw.state === st) continue;
      if (sw.locks.size > 0) return `switch ${sw.id} is held by another route`;
      if (!this.switchClear(sw)) return `switch ${sw.id} is fouled`;
    }
    const occ = r.clear.find((e) => this.isOccupied(e));
    if (occ) return `${this.edgeName(occ)} is occupied`;
    const c = this.conflictingRoute(r);
    if (c) return `${c.route.signals[0][0].id} is already set over ${this.edgeName(c.edge)}`;
    return null;
  }
  /** a piece of track in words */
  edgeName(e: Edge): string {
    if (/^[12]$/.test(e.track)) return `track ${e.track}`;
    if (e.track === "hs") return "the headshunt";
    if (e.track === "shl") return "the shed lead";
    if (/^sh\d$/.test(e.track)) return `shed road ${e.track.slice(2)}`;
    if (e.track === "sw") return "the switch";
    if (e.track === "main") return "the main line";
    if (e.track === "b1" || e.track === "bm") return "the branch";
    return `track ${e.track}`;
  }

  /* ---------- block working ---------- */
  section(id: string) { const s = this.layout.sections.find((x) => x.id === id); if (!s) throw new Error(`no section ${id}`); return s; }
  sectionClear(id: string): boolean { return !this.section(id).edges.some((e) => this.isOccupied(e)); }
  /** Issue the section's warrant to a train if the section is clear and no warrant is out. */
  lineClear(id: string, train: string): boolean {
    if (this.warrants.has(id)) return this.warrants.get(id) === train;
    if (!this.sectionClear(id)) return false;
    this.warrants.set(id, train);
    return true;
  }
  trainOutOfSection(id: string) { this.warrants.delete(id); }

  /* ---------- driver actions ---------- */

  private requireCab(): { vehicle: Vehicle; cab: Cab; consist: Consist } | null {
    return this.driverCab;
  }
  setReverser(r: Reverser) {
    const c = this.requireControl(); if (!c) return;
    if (c.cab.notch > 0) { this.say("Cab", "Power controller must be at 0 to move the reverser.", "system"); return; }
    c.cab.reverser = r;
  }
  setNotch(n: number) {
    const c = this.requireControl(); if (!c) return;
    n = Math.max(0, Math.min(4, Math.round(n)));
    if (n > 0 && c.cab.reverser === "N") { this.say("Cab", "Reverser is in Neutral.", "system"); return; }
    c.cab.notch = n;
  }
  setBrake(step: BrakeStep) {
    const c = this.requireControl(); if (!c) return;
    c.cab.brake = step;
    if (step === 5) this.incident("EMERGENCY", "Emergency brake used", true);
  }
  togglePanto() {
    const c = this.requireCab(); if (!c) return;
    const v = c.vehicle;
    if (!v.type.pantograph) return;
    if (v.panto === "down" || v.panto === "lowering") { v.panto = "raising"; v.pantoTimer = 4; }
    else { v.panto = "lowering"; v.pantoTimer = 3; }
  }
  setLights(l: LightState) {
    const c = this.requireCab(); if (!c) return;
    c.cab.lights = l;
  }
  toggleDoors() {
    const c = this.requireCab(); if (!c) return;
    const open = !c.consist.anyDoorsOpen();
    if (open && !this.atPlatform(c.consist)) this.incident("DOORS-AWAY", "Doors opened away from a platform");
    if (open && Math.abs(c.consist.v) > 0.1) this.incident("DOORS-MOVING", "Doors opened while moving");
    const group = c.consist.pipeGroups().find((g) => g.includes(c.vehicle)) ?? [c.vehicle];
    for (const v of group) if (v.type.doors) { v.doorsOpen = open; v.doorTimer = 2.5; }
  }
  /** A held blast is long once it has lasted this many seconds (Rule R 18). */
  static readonly LONG_BLAST = 1.5;
  /** the horn held down: the vehicle sounding and the time it began */
  hornHeld: { vehicle: Vehicle; since: number } | null = null;
  /** Press the horn: it sounds until hornUp(). */
  hornDown() {
    if (this.hornHeld) return;
    const c = this.requireCab(); if (!c) return;
    c.vehicle.hornUntil = Infinity;
    c.vehicle.lastHorn = this.time;
    this.hornHeld = { vehicle: c.vehicle, since: this.time };
  }
  /** Release the horn: the blast was short or long by how long it was held. */
  hornUp() {
    const h = this.hornHeld; if (!h) return;
    this.hornHeld = null;
    const v = h.vehicle;
    v.hornUntil = this.time;
    v.lastHorn = this.time;
    if (this.time - h.since >= World.LONG_BLAST) { v.lastLongHorn = this.time; this.say("Driver", "One long blast.", "driver"); }
    else this.say("Driver", "One short blast.", "driver");
  }
  /** One short blast, as a single press gives. */
  horn() {
    const c = this.requireCab(); if (!c) return;
    if (this.hornHeld) return;
    c.vehicle.hornUntil = this.time + 1.0;
    c.vehicle.lastHorn = this.time;
    this.say("Driver", "One short blast.", "driver");
  }
  startBrakeTest() {
    const c = this.requireCab(); if (!c) return;
    if (c.cab.brake !== 4) { this.say("Cab", "Put the train brake to Full to prove the brake.", "system"); return; }
    if (c.consist.vehicles.length < 2) { this.say("Cab", "Single vehicle: the brake proves itself. (Test noted.)", "system"); c.consist.brakeProved = true; return; }
    this.brakeTest = { consist: c.consist, t: 15 };
    this.say("Driver", "Proving the brake through the train…", "driver");
  }

  secured(cab: Cab): boolean { return cab.notch === 0 && cab.reverser === "N" && cab.brake >= 4; }

  /** Bring the clock to `lead` seconds before `t`, provided the train stands still. The world still steps normally. */
  skipTo(t: number, lead = 15): boolean {
    const target = t - lead;
    if (target <= this.time) return false;
    if (this.consists.some((c) => c.v !== 0)) { this.say("Duty", "Cannot advance the clock while a vehicle is moving.", "system"); return false; }
    this.skipUntil = target;
    return true;
  }
  /** One frame's worth of fast-forward; returns true while still skipping. */
  runSkip(maxSteps = 3000): boolean {
    if (this.skipUntil === null) return false;
    const n0 = this.incidents.length;
    let n = 0;
    while (this.time < this.skipUntil && n < maxSteps) {
      this.step(0.05); n++;
      if (this.consists.some((c) => c.v !== 0) || this.incidents.length > n0 || this.finished) { this.skipUntil = null; return false; }
    }
    if (this.time >= this.skipUntil) { this.skipUntil = null; this.say("Duty", `Clock advanced to ${fmtTime(this.time, true)}.`, "system"); return false; }
    return true;
  }

  /** Why the cab may not be left yet, or null when secured (Rule R 22). */
  unsecuredReason(cab: Cab): string | null {
    if (cab.notch > 0) return "power controller is not at 0";
    if (cab.reverser !== "N") return "reverser is not in Neutral";
    if (cab.brake < 4) return "train brake is not fully applied";
    const d = this.driver;
    if (d.kind === "cab" && this.gradeUnder(d.vehicle) !== 0 && !d.vehicle.parkingBrake) return "parking brake is not applied and the vehicle stands on a gradient";
    return null;
  }
  leaveCab() {
    const d = this.driver; if (d.kind !== "cab") return;
    const cab = d.vehicle.cabs[d.end]!;
    const why = this.unsecuredReason(cab);
    if (why) { this.say("Cab", `Secure the cab before leaving: ${why} (Rule R 22).`, "system"); return; }
    if (this.consistOf(d.vehicle).v !== 0) { this.say("Cab", "The train is still moving.", "system"); return; }
    cab.active = false;
    this.driver = { kind: "ground", at: { kind: "cab", vehicle: d.vehicle, end: d.end } };
  }
  enterCab() {
    const d = this.driver; if (d.kind !== "ground" || d.at.kind !== "cab") return;
    const v = d.at.vehicle;
    const cab = v.cabs[d.at.end];
    if (!cab) return;
    cab.active = true;
    const c = this.consistOf(v);
    // a train a colleague is driving from another cab is theirs: the player rides in it
    const ctl = c.control;
    const colleague = ctl && ctl.vehicle !== v && this.npc.has(ctl.vehicle) && ctl.cab.active;
    if (!colleague) c.control = { vehicle: v, cab, index: c.vehicles.indexOf(v) };
    this.driver = { kind: "cab", vehicle: v, end: d.at.end };
  }
  /** a colleague's name from the vehicle they drive, for the panel */
  driverName(v: Vehicle): string {
    const d = (this.npcDrivers as { vehicle: Vehicle; opts: { name?: string } }[]).find((x) => x.vehicle === v);
    return d?.opts.name ? `${d.opts.name}` : `the driver of ${v.number}`;
  }
  /** the colleague whose cab controls the train the player sits in, or null when the player has the train */
  ridingWith(): Vehicle | null {
    const dc = this.driverCab; if (!dc) return null;
    const ctl = dc.consist.control;
    return ctl && ctl.vehicle !== dc.vehicle ? ctl.vehicle : null;
  }
  /** the cab, when the player has the train; otherwise a word from the cab */
  private requireControl(): { vehicle: Vehicle; cab: Cab; consist: Consist } | null {
    const c = this.requireCab(); if (!c) return null;
    const other = this.ridingWith();
    if (other) { this.say("Cab", `${other.number} has the train: you are riding.`, "system"); return null; }
    return c;
  }
  /** Places within walking reach (80 m): cabs of any vehicle, couplings of any consist. */
  walkTargets(): { label: string; anchor: Anchor; dist: number }[] {
    const d = this.driver;
    if (d.kind !== "ground") return [];
    const here = this.driverPoint();
    const out: { label: string; anchor: Anchor; dist: number }[] = [];
    const push = (label: string, anchor: Anchor) => {
      const p = this.anchorPoint(anchor);
      const dist = Math.hypot(p.x - here.x, p.y - here.y);
      if (dist <= 80) out.push({ label, anchor, dist });
    };
    for (const c of this.consists) {
      for (const v of c.vehicles) for (const end of v.type.cabs) {
        if (d.at.kind === "cab" && d.at.vehicle === v && d.at.end === end) continue;
        push(`Cab ${end} of ${v.number}`, { kind: "cab", vehicle: v, end });
      }
      for (let i = 0; i + 1 < c.vehicles.length; i++) {
        if (d.at.kind === "coupling" && d.at.consist === c && d.at.index === i) continue;
        push(`Coupling ${c.vehicles[i].number}–${c.vehicles[i + 1].number}`, { kind: "coupling", consist: c, index: i });
      }
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }
  walkTo(anchor: Anchor) {
    const d = this.driver; if (d.kind !== "ground") return;
    const from = this.driverPoint();
    const to = this.anchorPoint(anchor);
    const dist = Math.hypot(to.x - from.x, to.y - from.y) + 3;
    this.driver = { kind: "walking", from, target: anchor, t: 0, duration: dist / 1.2 };
  }
  /** Uncouple at the coupling the driver stands at. */
  uncouple() {
    const d = this.driver; if (d.kind !== "ground" || d.at.kind !== "coupling") return;
    const c = d.at.consist, k = d.at.index;
    if (c.v !== 0) { this.say("Driver", "The train is moving.", "system"); return; }
    const ctl = c.control;
    if (ctl && ctl.cab.brake < 4) this.incident("UNCOUPLE-UNBRAKED", "Uncoupled with the train brake not fully applied (Rule D 12)");
    const [partA] = this.uncoupleAt(c, k);
    // the driver stands at the parted coupling; anchor them to a parted end, preferring one with a cab
    const partB = this.consists.find((x) => x !== partA && c.vehicles.slice(k + 1).every((v) => x.vehicles.includes(v)))!;
    const endA: Anchor = { kind: "cab", vehicle: partA.vehicles[k], end: partA.flip[k] ? "A" : "B" };
    const endB: Anchor = { kind: "cab", vehicle: partB.vehicles[0], end: partB.flip[0] ? "B" : "A" };
    const hasCab = (a: Anchor) => a.kind === "cab" && !!a.vehicle.cabs[a.end];
    this.driver = { kind: "ground", at: hasCab(endA) ? endA : hasCab(endB) ? endB : endA };
    this.say("Driver", `Uncoupled ${c.vehicles[k].number} from ${c.vehicles[k + 1].number}. Brake pipe parted; both parts braked.`, "driver");
  }
  /** Part a consist at coupling k (between vehicles k and k+1); returns the two parts. */
  uncoupleAt(c: Consist, k: number): [Consist, Consist] {
    const ctl = c.control;
    const partA = new Consist(`${c.id}a`, c.vehicles.slice(0, k + 1), c.flip.slice(0, k + 1));
    const partB = new Consist(`${c.id}b`, c.vehicles.slice(k + 1), c.flip.slice(k + 1));
    partA.couplings = c.couplings.slice(0, k);
    partB.couplings = c.couplings.slice(k + 1);
    // each part is what the whole was, except that a part with no passenger accommodation is a shunting move
    for (const p of [partA, partB]) p.shunting = c.shunting || p.shunting;
    for (const p of [partA, partB]) {
      if (ctl && p.vehicles.includes(ctl.vehicle)) p.control = { vehicle: ctl.vehicle, cab: ctl.cab, index: p.vehicles.indexOf(ctl.vehicle) };
    }
    // the player sitting in a cab of the other part takes it
    const pd = this.driver;
    if (pd.kind === "cab") for (const p of [partA, partB]) if (!p.control && p.vehicles.includes(pd.vehicle)) p.control = { vehicle: pd.vehicle, cab: pd.vehicle.cabs[pd.end]!, index: p.vehicles.indexOf(pd.vehicle) };
    this.consists = this.consists.filter((x) => x !== c).concat([partA, partB]);
    this.prevLead.delete(c);
    const rest = this.restKm.get(c);
    if (rest !== undefined) { this.restKm.set(partA, rest); this.restKm.set(partB, rest); }
    return [partA, partB];
  }
  /** Connect the brake pipe at the coupling the driver stands at. */
  connectPipe() {
    const d = this.driver; if (d.kind !== "ground" || d.at.kind !== "coupling") return;
    this.connectAt(d.at.consist, d.at.index);
    this.say("Driver", "Brake pipe and control line connected.", "driver");
  }
  connectAt(c: Consist, k: number) {
    c.couplings[k].pipe = true;
    c.brakeProved = false;
  }

  atPlatform(c: Consist): boolean {
    for (const v of c.vehicles) {
      if (!v.type.passenger) continue;
      const kA = kmOf(v.pos), kB = kmOf(v.posB);
      const ok = this.layout.platforms.some((p) => {
        const onTrack = this.edgesOf(v).every((e) => e.track === p.track);
        return onTrack && Math.min(kA, kB) >= p.kmFrom - 0.006 && Math.max(kA, kB) <= p.kmTo + 0.006;
      });
      if (!ok) return false;
    }
    return true;
  }

  /* ---------- coupling on contact ---------- */

  private tryCouple(c: Consist) {
    if (c.v === 0) return;
    const sign = Math.sign(c.v);
    const lead = c.leadingPos(sign);
    const stretches = pathAhead(lead, 1.0);
    for (const st of stretches) {
      const lo = Math.min(st.s0, st.s1), hi = Math.max(st.s0, st.s1);
      for (const other of this.consists) {
        if (other === c) continue;
        for (let i = 0; i < other.vehicles.length; i++) {
          const v = other.vehicles[i];
          for (const end of ["A", "B"] as End[]) {
            const p = v.endPos(end);
            if (p.edge !== st.edge || p.s < lo - 1e-6 || p.s > hi + 1e-6) continue;
            // only free ends can be coupled to
            const isFront = i === 0 && end === (other.flip[0] ? "B" : "A");
            const isRear = i === other.vehicles.length - 1 && end === (other.flip[i] ? "A" : "B");
            if (!isFront && !isRear) continue;
            // above coupling speed, or against a train coming the other way, this is a collision
            if (kmh(Math.abs(c.v)) > 5 || other.v !== 0) {
              const names = `${c.vehicles.map((x) => x.number).join("+")} and ${other.vehicles.map((x) => x.number).join("+")}`;
              this.incident("COLLISION", `Collision between ${names} at ${(kmh(Math.abs(c.v)) + kmh(Math.abs(other.v))).toFixed(0)} km/h closing speed`);
              c.v = 0; other.v = 0;
              return;
            }
            this.couple(c, other, isFront ? "front" : "rear", sign);
            return;
          }
        }
      }
    }
  }

  private couple(c1: Consist, c2: Consist, touched: "front" | "rear", sign: number) {
    const speed = kmh(Math.abs(c1.v));
    // merged order: c2 far end ... c2 touched end, c1 leading ... c1 rear (in motion direction)
    const c2Vehicles = touched === "rear" ? c2.vehicles.slice() : c2.vehicles.slice().reverse();
    const c2Flip = touched === "rear" ? c2.flip.slice() : c2.flip.slice().reverse().map((f) => !f);
    const c2Coup = touched === "rear" ? c2.couplings.slice() : c2.couplings.slice().reverse();
    const c1Vehicles = sign > 0 ? c1.vehicles.slice() : c1.vehicles.slice().reverse();
    const c1Flip = sign > 0 ? c1.flip.slice() : c1.flip.slice().reverse().map((f) => !f);
    const c1Coup = sign > 0 ? c1.couplings.slice() : c1.couplings.slice().reverse();
    const merged = new Consist(`${c1.id}+${c2.id}`, [...c2Vehicles, ...c1Vehicles], [...c2Flip, ...c1Flip]);
    merged.couplings = [...c2Coup, { pipe: false }, ...c1Coup];
    // the standing train's driver keeps the train; the player's cab always wins
    const player = this.driver.kind === "cab" ? this.driver.vehicle : null;
    const playerCtl = player && (c1.control?.vehicle === player ? c1.control : c2.control?.vehicle === player ? c2.control : null);
    const ctl = playerCtl ?? c2.control ?? c1.control;
    if (ctl) merged.control = { vehicle: ctl.vehicle, cab: ctl.cab, index: merged.vehicles.indexOf(ctl.vehicle) };
    merged.callOn = false;
    merged.shunting = c1.shunting;
    merged.v = 0;
    merged.brakeProved = false;
    this.consists = this.consists.filter((x) => x !== c1 && x !== c2).concat([merged]);
    this.prevLead.delete(c1); this.prevLead.delete(c2);
    // the merged train rests where the standing one stood, so that leaving its platform is not an overrun
    const rest = this.restKm.get(c2) ?? this.restKm.get(c1);
    if (rest !== undefined) this.restKm.set(merged, rest);
    if (this.driver.kind === "ground" && this.driver.at.kind === "coupling") this.driver = { kind: "ground", at: { kind: "cab", vehicle: merged.vehicles[0], end: merged.flip[0] ? "B" : "A" } };
    const names = c1Vehicles.map((v) => v.number).join("+") + " to " + c2Vehicles.map((v) => v.number).join("+");
    if (speed > 5) this.incident("COUPLE-DAMAGE", `Coupled ${names} at ${speed.toFixed(1)} km/h — damage likely (Rule D 10)`);
    else if (speed > 2) this.incident("COUPLE-ROUGH", `Rough coupling ${names} at ${speed.toFixed(1)} km/h (Rule D 10)`);
    else this.say("Driver", `Coupled ${names} at ${speed.toFixed(1)} km/h. Brake pipe not yet connected.`, "driver");
  }

  /* ---------- the step ---------- */

  step(dt: number) {
    if (this.paused || this.finished) return;
    this.time += dt;

    // driver walking
    const d = this.driver;
    if (d.kind === "walking") {
      d.t += dt;
      if (d.t >= d.duration) this.driver = { kind: "ground", at: d.target };
    }

    // brake test
    if (this.brakeTest) {
      const bt = this.brakeTest;
      bt.t -= dt;
      if (bt.t <= 0) {
        const far = bt.consist.vehicles[bt.consist.vehicles.length - 1];
        const near = bt.consist.vehicles[0];
        const ok = bt.consist.allPipesConnected() && far.pipe <= 3.7 && near.pipe <= 3.7;
        if (ok) { bt.consist.brakeProved = true; this.say("Driver", `Brake proved through ${bt.consist.vehicles.length} vehicles.`, "driver"); }
        else this.incident("BRAKE-NOT-PROVED", "Brake continuity test failed: pipe not connected through the train");
        this.brakeTest = null;
      }
    }

    // physics
    for (const c of this.consists.slice()) {
      const sign = c.v !== 0 ? Math.sign(c.v) : 0;
      const before = sign !== 0 ? c.leadingPos(sign) : null;
      const r = stepConsist(c, dt, this.gravityOn(c));
      if (r.hitBuffer) { this.incident("BUFFER", `${c.vehicles.map((v) => v.number).join("+")} struck the buffer stop (Rule D 16)`, false, c); }
      if (r.trailed) this.incident("TRAILED", `Ran through switch ${r.trailed} set against the move (Rule S 22)`, false, c);
      if (before && Math.abs(c.v) > 0) this.checkPassings(c, before, Math.abs(c.v) * dt);
      if (this.consists.includes(c)) this.tryCouple(c);
    }

    this.releaseRoutes();
    for (const c of this.consists) if (c.callOn && c.v === 0) c.callOn = false;
    // distant signals repeat their home: CLEAR only when the home is CLEAR
    for (const s of this.signals) if (s.type === "distant" && s.distantOf) s.aspect = this.signal(s.distantOf).aspect === "clear" ? "clear" : "caution";
    // overhead line: no volts under a neutral section
    for (const v of this.vehicles) {
      if (!v.type.pantograph) continue;
      const km = (kmOf(v.pos) + kmOf(v.posB)) / 2;
      v.lineVolts = !this.layout.neutral.some((n) => n.line === v.pos.edge.line && km >= n.kmFrom && km <= n.kmTo);
    }
    this.checkContinuous(dt);
    for (const h of this.hooks) h(this, dt);
  }

  private checkPassings(c: Consist, before: Position, moved: number) {
    const stretches = pathAhead(before, moved + 1e-6);
    for (const st of stretches) {
      for (const o of this.layout.objects) {
        if (o.pos.edge !== st.edge || o.pos.dir !== st.dir) continue;
        // passed when the object lies strictly inside the moved interval (exclusive of the start point)
        const inside = st.dir === 1 ? (o.pos.s > st.s0 && o.pos.s <= st.s1) : (o.pos.s < st.s0 && o.pos.s >= st.s1);
        if (!inside) continue;
        this.onPassed(c, o);
      }
    }
  }

  private onPassed(c: Consist, o: Trackside) {
    const names = c.vehicles.map((v) => v.number).join("+");
    if (o.kind === "signal") {
      if (o.type === "distant") return; // information only; it follows its home
      if (o.type === "main") {
        // a main signal governs every movement: trains need CAUTION or CLEAR, shunting moves may also take the subsidiary,
        // and a train may take a home's subsidiary as a call-on onto an occupied platform at shunting speed
        const callOn = o.aspect === "shunt" && c.isTrain && !!o.callOn;
        const ok = o.aspect === "caution" || o.aspect === "clear" || (o.aspect === "shunt" && !c.isTrain) || callOn;
        if (!ok) this.incident("SPAD", `${names} passed ${o.id} at STOP (Rule S 10)`, false, c);
        if (callOn) c.callOn = true;
        // the aspect passed says what the movement is from here: a main aspect makes a train, the subsidiary a shunting move
        if (o.aspect === "caution" || o.aspect === "clear") c.shunting = false;
        else if (o.aspect === "shunt" && !callOn) c.shunting = true;
      } else if (!c.isTrain && o.aspect === "stop") {
        this.incident("SPAD", `${names} passed ${o.id} at SHUNT STOP (Rule S 10)`, false, c);
      } else if (o.aspect === "shunt") c.shunting = true;
      if (o.aspect !== "stop") o.aspect = "stop";
      return;
    }
    if (o.board === "stop" && c.isTrain) {
      // leaving the platform you stood at is not an overrun, wherever on it you stood; arriving past the board is
      const rest = this.restKm.get(c);
      const boardKm = kmOf(o.pos);
      const platform = this.layout.platforms.find((p) => p.track === o.pos.edge.track && boardKm >= p.kmFrom - 0.01 && boardKm <= p.kmTo + 0.01);
      const departing = rest !== undefined && (Math.abs(rest - boardKm) * 1000 < 60 || (!!platform && rest >= platform.kmFrom - 0.02 && rest <= platform.kmTo + 0.02));
      if (!departing) this.incident("OVERRUN", `${names} overran the stop board at ${o.label} (Rule R 12)`, false, c);
    }
    if (o.board === "limitOfShunt" && !c.isTrain) this.incident("LOS", `${names} passed the Limit of Shunt (Rule S 12)`, false, c);
    if (o.board === "whistle") {
      const dir = kmDirOf(o.pos);
      const crossing = this.layout.crossings.find((x) => x.line === o.pos.edge.line && (x.km - kmOf(o.pos)) * dir > 0 && (x.km - kmOf(o.pos)) * dir < 0.5);
      if (crossing) this.whistleDue.set(c, { km: crossing.km, dir, since: this.time - 10 });
    }
  }

  private checkContinuous(dt: number) {
    void dt;
    for (const c of this.consists) {
      const moving = Math.abs(c.v) > 0.05;
      const speed = c.speedKmh;
      const flags = this.flagsFor(c);
      // overspeed
      const lim = this.limitFor(c);
      if (moving && speed > lim + 2) {
        if (!flags.overspeed) { flags.overspeed = true; this.incident("OVERSPEED", `${c.vehicles.map((v) => v.number).join("+")} at ${speed.toFixed(0)} km/h where the limit is ${lim} (Rule R 10)`, false, c); }
      } else if (speed < lim) flags.overspeed = false;
      // whistle boards: one long blast before the crossing
      const wd = this.whistleDue.get(c);
      if (wd) {
        const front = kmOf(c.leadingPos(c.v >= 0 ? 1 : -1));
        if ((front - wd.km) * wd.dir >= 0) {
          const ctl = c.control;
          // a long blast since the board: either finished, or still being held and already long enough
          const held = this.hornHeld && ctl && this.hornHeld.vehicle === ctl.vehicle && this.time - this.hornHeld.since >= World.LONG_BLAST ? this.time : -1e9;
          if (!ctl || Math.max(ctl.vehicle.lastLongHorn, held) < wd.since) this.incident("WHISTLE", `${c.vehicles.map((v) => v.number).join("+")} passed the crossing without a long blast (Rule R 18)`, false, c);
          this.whistleDue.delete(c);
        }
      }
      // neutral section: no power to be taken
      {
        const ctl = c.control;
        const inside = c.vehicles.some((v) => v.type.pantograph && !v.lineVolts);
        if (inside && !this.inNeutral.get(c)) {
          this.inNeutral.set(c, true);
          if (ctl && ctl.cab.notch > 0) this.incident("POWER-IN-SECTION", `${c.vehicles.map((v) => v.number).join("+")} entered the neutral section with power applied (Rule D 24)`, false, c);
        } else if (!inside && this.inNeutral.get(c)) this.inNeutral.set(c, false);
      }
      // doors
      if (moving && c.anyDoorsOpen()) {
        if (!flags.doorsMoving) { flags.doorsMoving = true; this.incident("DOORS-MOVING", "Moved with doors open (Rule R 14)", false, c); }
      } else if (!c.anyDoorsOpen()) flags.doorsMoving = false;
      // lights on the main line
      if (moving && c.isTrain && speed > 5) {
        const lead = c.leadingPos(Math.sign(c.v));
        const onMain = lead.edge.track === "main";
        if (onMain) {
          const front = c.v > 0 ? c.frontEnd() : c.rearEnd();
          const rear = c.v > 0 ? c.rearEnd() : c.frontEnd();
          const ok = front.vehicle.lightsAt(front.end) === "head" && rear.vehicle.lightsAt(rear.end) === "tail";
          if (!ok) { if (!flags.lightsBad) { flags.lightsBad = true; this.incident("LIGHTS", `${c.vehicles.map((v) => v.number).join("+")}: incorrect lights on the main line: front shows ${front.vehicle.lightsAt(front.end).toUpperCase()}, rear shows ${rear.vehicle.lightsAt(rear.end).toUpperCase()} (Rule R 16)`, false, c); } }
          else flags.lightsBad = false;
        }
      }
      // horn before moving from rest
      const pl = this.prevLead.get(c);
      const wasStill = !pl || pl.v === 0;
      if (c.v === 0 && pl && pl.v !== 0) this.restKm.set(c, kmOf(c.leadingPos(pl.v >= 0 ? 1 : -1)));
      if (wasStill && c.v !== 0) {
        const ctl = c.control;
        if (ctl && this.time - ctl.vehicle.lastHorn > 25) this.incident("HORN", `${c.vehicles.map((v) => v.number).join("+")} moved from rest without one short blast (Rule R 18)`, false, c);
      }
      // rolling back, running away, dragging the parking brake
      {
        const ctl = c.control;
        const intended = ctl ? c.cabForwardSign(ctl.index, ctl.cab) * (ctl.cab.reverser === "F" ? 1 : ctl.cab.reverser === "R" ? -1 : 0) : 0;
        let m = this.motion.get(c);
        if (!m) { m = { intended, wrong: 0, flagged: false, drag: 0, dragFlagged: false }; this.motion.set(c, m); }
        if (wasStill && c.v !== 0) { m.intended = intended; m.wrong = 0; m.flagged = false; }
        if (c.v !== 0) {
          const wrongWay = m.intended === 0 || Math.sign(c.v) !== m.intended;
          if (wrongWay) m.wrong += Math.abs(c.v) * dt; else m.wrong = 0;
          if (!m.flagged && m.wrong > 0.5) {
            m.flagged = true;
            if (m.intended === 0) this.incident("RUNAWAY", `${c.vehicles.map((v) => v.number).join("+")} ran away: moved with no direction set (Rule D 22)`, false, c);
            else this.incident("ROLLBACK", `${c.vehicles.map((v) => v.number).join("+")} rolled back on the gradient (Rule D 20)`, false, c);
          }
          if (c.vehicles.some((v) => v.parkingBrake)) {
            m.drag += Math.abs(c.v) * dt;
            if (!m.dragFlagged && m.drag > 3) { m.dragFlagged = true; this.incident("PARKING-DRAG", `${c.vehicles.map((v) => v.number).join("+")} moved with the parking brake applied (Rule D 22)`, false, c); }
          } else { m.drag = 0; m.dragFlagged = false; }
        }
      }
      this.prevLead.set(c, { pos: c.leadingPos(c.v >= 0 ? 1 : -1), v: c.v });
      // in multiple working the other cars' cabs follow the driving cab: the leading end of the train shows head,
      // the trailing end tail, coupled ends nothing
      if (c.control && c.vehicles.length > 1) {
        const ctl = c.control;
        const drv = ctl.vehicle;
        const lit = ctl.cab.lights !== "off";
        const fwd = c.cabForwardSign(ctl.index, ctl.cab) * (ctl.cab.reverser === "R" ? -1 : 1);
        const lead = fwd >= 0 ? c.frontEnd() : c.rearEnd();
        const trail = fwd >= 0 ? c.rearEnd() : c.frontEnd();
        for (let i = 0; i < c.vehicles.length; i++) {
          const v = c.vehicles[i];
          if (v === drv || v.type.cabs.length === 0) continue;
          for (const end of v.type.cabs) {
            const cab = v.cabs[end]!;
            if (lead.vehicle === v && lead.end === end) cab.lights = lit ? "head" : "off";
            else if (trail.vehicle === v && trail.end === end) cab.lights = lit ? "tail" : "off";
            else cab.lights = "off";
          }
        }
      }
      // automatic coach lights
      for (let i = 0; i < c.vehicles.length; i++) {
        const v = c.vehicles[i];
        if (v.type.cabs.length > 0) continue;
        const litTrain = c.vehicles.some((x) => Object.values(x.cabs).some((cb) => cb && cb.lights !== "off"));
        const frontEnd: End = c.flip[i] ? "B" : "A", rearEnd: End = c.flip[i] ? "A" : "B";
        v.autoLights[frontEnd] = i === 0 && litTrain ? (c.v < 0 ? "head" : "tail") : "off";
        v.autoLights[rearEnd] = i === c.vehicles.length - 1 && litTrain ? (c.v > 0 || c.v === 0 ? "tail" : "head") : "off";
        // a coach shows tail at its free end(s); when it leads (pushed) it would show head — not used in these duties
        if (i === 0 && litTrain) v.autoLights[frontEnd] = "tail";
        if (i === c.vehicles.length - 1 && litTrain) v.autoLights[rearEnd] = "tail";
      }
    }
  }

  /** km and travel direction of the leading end of the train */
  trainKm(): { km: number; dir: Dir } {
    const c = this.train;
    const lead = c.leadingPos(c.v >= 0 ? 1 : -1);
    return { km: kmOf(lead), dir: kmDirOf(lead) };
  }
}
