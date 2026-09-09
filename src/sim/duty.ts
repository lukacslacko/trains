import { World } from "./world";
import { type ValleyLayout, type StationLayout, type Signal, type Stop } from "../track/layouts";
import { type Edge, type SwitchState, type Switch, kmOf } from "../track/graph";
import { type Route } from "./world";
import { fmtTime, parseTime } from "../core/util";
import { type Consist, type Vehicle } from "../stock/vehicles";

export interface Leg { from: string; to: string; dep: string; arr: string }

export type LegPhase = "waiting" | "running" | "done";
export interface LegState { leg: Leg; phase: LegPhase; departed?: number; arrived?: number }

/** km direction of travel for a leg: on one line by the stops' kilometres, otherwise towards the branch is Down. */
export function legDir(w: World, leg: Leg): 1 | -1 {
  const a = w.station(leg.from).stops[0], b = w.station(leg.to).stops[0];
  if (a.line === b.line) return b.km > a.km ? 1 : -1;
  return b.line === "branch" ? 1 : -1;
}
/** the stop a train uses at a station when arriving in km direction `dir` */
export function stopFor(w: World, code: string, dir: 1 | -1): Stop {
  const st = w.station(code);
  return st.stops.find((s) => s.dir === dir) ?? st.stops[0];
}
/** the front of a consist in km direction `dir` (on the line the consist stands on) */
export function frontKm(c: Consist, dir: 1 | -1): number {
  const ks = c.vehicles.flatMap((v) => [kmOf(v.pos), kmOf(v.posB)]);
  return dir === 1 ? Math.max(...ks) : Math.min(...ks);
}

/** Watches the player's train against the booked legs and keeps the duty sheet. */
export class DutyTracker {
  readonly kind = "train";
  legs: LegState[];
  index = 0;
  private lastDoorsOpen = false;
  private stoppedAtBoard = false;
  private startedWithBaton: boolean | null = null;
  completion: (w: World) => string | null;
  prep: string[];

  constructor(w: World, legs: Leg[], prep: string[], completion: (w: World) => string | null) {
    this.legs = legs.map((leg) => ({ leg, phase: "waiting" }));
    this.prep = prep;
    this.completion = completion;
    w.hooks.push((world) => this.step(world));
  }

  get current(): LegState | null { return this.legs[this.index] ?? null; }

  private step(w: World) {
    const train = w.train;
    const cur = this.current;
    if (!cur) {
      if (!w.finished) {
        const msg = this.completion(w);
        if (msg) { w.finished = msg; w.say("General Manager's Office", msg, "system"); }
      }
      return;
    }
    const dir = legDir(w, cur.leg);
    const prev = this.legs[this.index - 1];
    const hereDir: 1 | -1 = prev ? legDir(w, prev.leg) : (-dir as 1 | -1);
    const here = stopFor(w, cur.leg.from, hereDir);

    const doorsOpen = train.anyDoorsOpen();
    if (doorsOpen && !this.lastDoorsOpen && Math.abs(train.v) < 0.01) {
      const stop = cur.phase === "waiting" ? here : stopFor(w, cur.leg.to, dir);
      const front = frontKm(train, stop.dir);
      const short = (stop.km - front) * stop.dir * 1000;
      if (short > 3 && short < 100) w.incident("STOP-SHORT", `Doors opened ${short.toFixed(0)} m short of the stop board at ${w.station(cur.phase === "waiting" ? cur.leg.from : cur.leg.to).name} (Rule R 12)`);
    }
    this.lastDoorsOpen = doorsOpen;

    if (cur.phase === "waiting") {
      const st = w.station(cur.leg.from);
      const platform = here.platform;
      const km = frontKm(train, dir);
      const outward = dir === 1 ? platform.kmTo + 0.02 : platform.kmFrom - 0.02;
      const left = dir === 1 ? km > outward : km < outward;
      // the baton is judged as the train starts to move; the box may put it away as soon as the starter is passed
      if (Math.abs(train.v) > 0.05 && this.startedWithBaton === null) this.startedWithBaton = st.baton.has(w.trainVehicle.number);
      if (Math.abs(train.v) < 0.01 && !left) this.startedWithBaton = null;
      if (left && Math.abs(train.v) > 0.1) {
        cur.phase = "running";
        cur.departed = w.time;
        const booked = parseTime(cur.leg.dep);
        if (w.time < booked - 5) w.incident("EARLY", `Departed ${st.name} at ${fmtTime(w.time)}, booked ${cur.leg.dep} (Rule R 20)`);
        if (st.master && !(this.startedWithBaton ?? st.baton.has(w.trainVehicle.number))) w.incident("NO-BATON", `Departed ${st.name} without the baton (Rule R 20)`);
        st.baton.delete(w.trainVehicle.number);
        this.startedWithBaton = null;
        this.stoppedAtBoard = false;
        w.say("Duty", `Service departed ${st.name} at ${fmtTime(w.time)} (booked ${cur.leg.dep}).`, "system");
      }
    } else if (cur.phase === "running") {
      const dest = w.station(cur.leg.to);
      const stop = stopFor(w, cur.leg.to, dir);
      const front = frontKm(train, dir);
      const short = (stop.km - front) * dir * 1000;
      const onPlatform = w.atPlatform(train);
      if (Math.abs(train.v) < 0.01 && onPlatform && short >= -0.5 && short < 60 && !this.stoppedAtBoard) {
        this.stoppedAtBoard = true;
        cur.phase = "done";
        cur.arrived = w.time;
        const booked = parseTime(cur.leg.arr);
        const late = w.time - booked;
        w.say("Duty", `Arrived ${dest.name} at ${fmtTime(w.time)} (booked ${cur.leg.arr}${late > 60 ? `, ${Math.round(late / 60)} min late` : ""}); stopped ${short.toFixed(1)} m short of the board.`, "system");
        this.index++;
      }
    }
  }
}

/* ---------------- Boxes: station masters with block working ---------------- */

/** Sides of a station: S towards Ashgrove, N the main line onward, B the branch. */
export type Side = "S" | "N" | "B";

export interface Visit {
  /** the vehicle number that identifies the train (its leading passenger vehicle) */
  train: string;
  /** the locomotive that runs round, if any */
  loco?: string;
  arrive: boolean;
  from?: Side;
  /** the platform track of the working; a signaller may receive the train on the other one, and the visit then follows the train */
  track: "1" | "2";
  /** booked arrival, for the register */
  arr?: string;
  depart: string | null;
  to?: Side;
  runRound?: boolean;
  /** this train arrives coupled to `splitFrom` and leaves on its own: it waits to be uncoupled */
  splitFrom?: string;
  /** this train arrives as a call-on and couples onto `joinTo`, which then leaves as one train */
  joinTo?: string;
}

export type MoveState = "offered" | "expecting" | "arrived" | "toHeadshunt" | "viaTrack2" | "toCouple" | "ready" | "lineClear" | "starterCleared" | "departing" | "done";

export interface Movement {
  visit: Visit; state: MoveState; said: Set<string>;
  arrivedAt?: number; batonAt?: number; departedAt?: number;
  /** standing at the home signal since (a manned box) */
  heldSince?: number; heldFlagged?: boolean;
}

/** A peer box asking a manned box for line clear, waiting for the signaller's answer. */
export interface LineClearRequest { train: string; from: Side; since: number; granted: boolean }
/** A train that has arrived complete at a manned box, its warrant not yet cancelled. */
export interface Arrival { train: string; side: Side; at: number }

/** Who works the box: the station master (an NPC) or the player in the signaller's chair. */
export type BoxMode = "npc" | "player";

interface Roles {
  homeS?: Signal; homeN?: Signal; homeB?: Signal;
  starter1S?: Signal; starter1N?: Signal; starter2S?: Signal; starter2N?: Signal;
  stubSIn?: Signal; stubNIn?: Signal;
  toHs?: Signal; hsIn?: Signal; t2stub?: Signal; stubIn?: Signal;
  hsEdge?: Edge; stubEdge?: Edge; swHs?: Switch; swMain?: Switch;
  hsSide?: Side;
}

export class Box {
  code: string;
  name: string;
  master: string;
  st: StationLayout;
  roles: Roles;
  /** the movements still in hand */
  movements: Movement[] = [];
  /** every movement planned, in the order planned: the train register */
  register: Movement[] = [];
  peers: Partial<Record<Side, Box>> = {};
  sections: Partial<Record<Side, string>> = {};
  mode: BoxMode = "npc";
  /** peers' requests for line clear awaiting the signaller (player mode) */
  requests: LineClearRequest[] = [];
  /** trains arrived complete whose warrant the signaller has not yet cancelled (player mode) */
  arrived: Arrival[] = [];

  constructor(w: World, layout: ValleyLayout, code: string) {
    this.code = code;
    this.st = layout.st[code];
    const info = w.station(code);
    this.name = info.name;
    this.master = info.master ?? "";
    this.roles = this.buildRoles();
    for (const sec of layout.sections) {
      if (sec.from === code) this.sections[sec.id === "C" ? "B" : "N"] = sec.id;
      if (sec.to === code) this.sections.S = sec.id;
    }
    this.defineRoutes(w);
    w.boxes.push(this);
    w.hooks.push((world) => this.step(world));
  }

  /** a is south of b on the main line (side "N" of a is b), or b hangs off a's branch */
  static link(a: Box, b: Box, viaBranch = false) {
    if (viaBranch) { a.peers.B = b; b.peers.S = a; } else { a.peers.N = b; b.peers.S = a; }
  }

  plan(v: Visit) {
    const m: Movement = { visit: v, state: v.arrive ? "offered" : "ready", said: new Set() };
    this.movements.push(m);
    this.register.push(m);
  }

  private buildRoles(): Roles {
    const s = this.st.signals, e = this.st.edges;
    switch (this.code) {
      case "AG": return { homeN: s["2"], starter1N: s["1"], stubNIn: s["6"], toHs: s["4"], hsIn: s["5"], t2stub: s["3"], stubIn: s["6"], hsEdge: e.stubS, stubEdge: e.stubN, swHs: this.st.switchS, swMain: this.st.switchN, hsSide: "S" };
      case "CW": return { homeS: s["1"], starter1S: s["2"], stubSIn: s["5"], toHs: s["3"], hsIn: s["6"], t2stub: s["4"], stubIn: s["5"], hsEdge: e.stubN, stubEdge: e.stubS, swHs: this.st.switchN, swMain: this.st.switchS, hsSide: "N" };
      case "FH": return { homeS: s["1"], starter1S: s["2"] };
      default: return { homeS: s["1"], homeN: s["8"], homeB: s["10"], starter1S: s["2"], starter2S: s["4"], starter1N: s["7"], starter2N: s["9"], stubSIn: s["5"], stubNIn: s["6"], toHs: s["7"], hsIn: s["6"], t2stub: s["4"], stubIn: s["5"], hsEdge: e.stubN, stubEdge: e.stubS, swHs: this.st.switchN, swMain: this.st.switchS, hsSide: "N" };
    }
  }

  private sign(text: string) { return this.mode === "player" ? `${text} — ${this.name}` : `${text} — ${this.master}, ${this.name}`; }
  private say(w: World, m: Movement, key: string, text: string) {
    if (m.said.has(key)) return;
    m.said.add(key);
    w.say(`${this.name} Box`, this.sign(text));
  }
  /** a line from the box in its own voice, not tied to a movement */
  private tell(w: World, text: string) { w.say(`${this.name} Box`, this.sign(text)); }
  /** a note from the frame or the warrant book: something refused */
  private refuse(w: World, text: string) { w.say(`${this.name} Box`, text, "system"); }

  private defineRoutes(w: World) {
    const c = this.code, e = this.st.edges, r = this.roles, swS = this.st.switchS, swN = this.st.switchN, swJ = this.st.switchJ;
    const R = (id: string, switches: [Switch, SwitchState][], signals: [Signal, Signal["aspect"]][], clear: Edge[], dest: Edge) => w.routes.push({ id: `${c}:${id}`, station: c, switches, signals, clear, dest });
    const t1 = e.t1, t2 = e.t2;
    if (r.homeS && swS && e.bS1) { R("homeS→1", [[swS, "normal"]], [[r.homeS, "caution"]], [e.bS1, t1], t1); if (t2 && e.bS2) R("homeS→2", [[swS, "reverse"]], [[r.homeS, "caution"]], [e.bS2, t2], t2); }
    if (r.homeS && !swS) R("homeS→1", [], [[r.homeS, "caution"]], [t1], t1);
    if (r.homeN && swN && e.bN1) {
      const J: [Switch, SwitchState][] = swJ ? [[swJ, "normal"]] : [];
      const stubN = e.stubN ? [e.stubN] : [];
      R("homeN→1", [...J, [swN, "normal"]], [[r.homeN, "caution"]], [...stubN, e.bN1, t1], t1);
      if (t2 && e.bN2) R("homeN→2", [...J, [swN, "reverse"]], [[r.homeN, "caution"]], [...stubN, e.bN2, t2], t2);
      if (r.homeN.callOn) {
        R("homeN→1c", [...J, [swN, "normal"]], [[r.homeN, "shunt"]], [...stubN, e.bN1], t1);
        if (t2 && e.bN2) R("homeN→2c", [...J, [swN, "reverse"]], [[r.homeN, "shunt"]], [...stubN, e.bN2], t2);
      }
    }
    if (r.homeB && swN && swJ && e.bN1 && e.stubN) {
      R("homeB→1", [[swJ, "reverse"], [swN, "normal"]], [[r.homeB, "caution"]], [e.stubN, e.bN1, t1], t1);
      if (t2 && e.bN2) R("homeB→2", [[swJ, "reverse"], [swN, "reverse"]], [[r.homeB, "caution"]], [e.stubN, e.bN2, t2], t2);
      if (r.homeB.callOn) {
        R("homeB→1c", [[swJ, "reverse"], [swN, "normal"]], [[r.homeB, "shunt"]], [e.stubN, e.bN1], t1);
        if (t2 && e.bN2) R("homeB→2c", [[swJ, "reverse"], [swN, "reverse"]], [[r.homeB, "shunt"]], [e.stubN, e.bN2], t2);
      }
    }
    if (r.starter1S && swS && e.bS1 && e.stubS) R("1→S", [[swS, "normal"]], [[r.starter1S, "clear"]], [e.bS1, e.stubS], e.stubS);
    if (r.starter1S && !swS && e.stubS) R("1→S", [], [[r.starter1S, "clear"]], [e.stubS], e.stubS);
    if (r.starter2S && swS && e.bS2 && e.stubS) R("2→S", [[swS, "reverse"]], [[r.starter2S, "clear"]], [e.bS2, e.stubS], e.stubS);
    if (r.starter1N && swN && e.bN1 && e.stubN) {
      const onward = e.mainN ?? e.stubN;
      R("1→N", swJ ? [[swN, "normal"], [swJ, "normal"]] : [[swN, "normal"]], [[r.starter1N, "clear"]], [e.bN1, e.stubN, ...(e.mainN ? [e.mainN] : [])], onward);
      if (swJ && e.stubB) R("1→B", [[swN, "normal"], [swJ, "reverse"]], [[r.starter1N, "clear"]], [e.bN1, e.stubN, e.stubB], e.stubB);
    }
    if (r.starter2N && swN && e.bN2 && e.stubN) {
      const onward = e.mainN ?? e.stubN;
      R("2→N", swJ ? [[swN, "reverse"], [swJ, "normal"]] : [[swN, "reverse"]], [[r.starter2N, "clear"]], [e.bN2, e.stubN, ...(e.mainN ? [e.mainN] : [])], onward);
      if (swJ && e.stubB) R("2→B", [[swN, "reverse"], [swJ, "reverse"]], [[r.starter2N, "clear"]], [e.bN2, e.stubN, e.stubB], e.stubB);
    }
    // run-round
    if (r.toHs && r.hsIn && r.t2stub && r.stubIn && r.hsEdge && r.stubEdge && r.swHs && r.swMain && t2) {
      const bHs1 = (r.hsSide === "S" ? e.bS1 : e.bN1)!, bHs2 = (r.hsSide === "S" ? e.bS2 : e.bN2)!;
      const bMain1 = (r.hsSide === "S" ? e.bN1 : e.bS1)!, bMain2 = (r.hsSide === "S" ? e.bN2 : e.bS2)!;
      R("1→hs", [[r.swHs, "normal"]], [[r.toHs, "shunt"]], [bHs1, r.hsEdge], r.hsEdge);
      R("hs→2→stub", [[r.swHs, "reverse"], [r.swMain, "reverse"]], [[r.hsIn, "shunt"], [r.t2stub, "shunt"]], [bHs2, t2, bMain2, r.stubEdge], r.stubEdge);
      R("stub→1", [[r.swMain, "normal"]], [[r.stubIn, "shunt"]], [bMain1], t1);
    }
  }

  private home(side: Side) { return side === "S" ? this.roles.homeS : side === "N" ? this.roles.homeN : this.roles.homeB; }
  private starter(track: "1" | "2", to: Side) {
    return to === "S" ? (track === "1" ? this.roles.starter1S : this.roles.starter2S) : (track === "1" ? this.roles.starter1N : this.roles.starter2N);
  }
  /** the starting signal a movement leaves under */
  starterFor(m: Movement): Signal | undefined { return m.visit.to ? this.starter(m.visit.track, m.visit.to) : undefined; }
  /** the side of `peer` on which this box lies */
  private sideAt(peer: Box): Side { return peer.peers.S === this ? "S" : peer.peers.B === this ? "B" : "N"; }
  /** the name of the station on a side: the peer box, or the far end of the section when no box is planned there */
  sideName(w: World, side: Side | undefined): string {
    if (!side) return "";
    const peer = this.peers[side];
    if (peer) return peer.name;
    const sec = this.sections[side];
    if (!sec) return "";
    const s = w.section(sec);
    return w.station(s.from === this.code ? s.to : s.from)?.name ?? "";
  }
  /** the route id that receives a movement's train from its side into its track */
  homeRouteFor(m: Movement): string | null {
    const v = m.visit;
    return v.from ? `${this.code}:home${v.from}→${v.track}${v.joinTo ? "c" : ""}` : null;
  }
  /** the route id that sends a movement's train on its way */
  starterRouteFor(m: Movement): string | null {
    const v = m.visit;
    return v.to ? `${this.code}:${v.track}→${v.to}` : null;
  }

  /** The peer box asks: may train `train` enter the section towards us? */
  acceptTrain(w: World, train: string, fromSide: Side): boolean {
    if (this.mode === "player") {
      // the signaller answers; until then the request stands
      let req = this.requests.find((r) => r.train === train && r.from === fromSide);
      if (!req) {
        req = { train, from: fromSide, since: w.time, granted: false };
        this.requests.push(req);
        const peer = this.peers[fromSide];
        if (peer) w.say(`${peer.name} Box`, `Is line clear for ${train} to ${this.name}? — ${peer.master}, ${peer.name}`);
      }
      return req.granted;
    }
    const m = this.movements.find((x) => x.visit.train === train && x.state === "offered" && x.visit.from === fromSide);
    if (!m) return false;
    const sec = this.sections[fromSide]!;
    if (!w.lineClear(sec, train)) return false;
    const routeId = this.homeRouteFor(m)!;
    if (!w.setRoute(routeId)) { w.warrants.delete(sec); return false; }
    m.state = "expecting";
    const home = this.home(fromSide)!;
    this.say(w, m, "expect", m.visit.joinTo
      ? `Line clear for ${train} to ${this.name}. Warrant ${sec} issued; ${home.id} shows its subsidiary: call on to platform ${m.visit.track} and couple to ${m.visit.joinTo} standing there.`
      : `Line clear for ${train} to ${this.name}. Warrant ${sec} issued; ${home.id} cleared into track ${m.visit.track}.`);
    return true;
  }

  /* ---------- the signaller's actions (player mode; the NPC box does the same things by itself) ---------- */

  /** why a section cannot be given to a train, or null when it can */
  refusal(w: World, sec: string, train: string): string | null {
    const out = w.warrants.get(sec);
    if (out && out !== train) return `warrant ${sec} is out to ${out}`;
    if (!out && !w.sectionClear(sec)) return `section ${sec} is occupied`;
    return null;
  }

  /** Give line clear for a train offered from `from`: the warrant is issued with it (Rule S 34). */
  giveLineClear(w: World, train: string, from: Side): boolean {
    const sec = this.sections[from];
    if (!sec) return false;
    const why = this.refusal(w, sec, train);
    if (why) { this.refuse(w, `Line clear for ${train} refused: ${why}.`); return false; }
    w.lineClear(sec, train);
    const req = this.requests.find((r) => r.train === train && r.from === from);
    if (req) req.granted = true;
    const m = this.movements.find((x) => x.visit.train === train && x.state === "offered" && x.visit.from === from);
    if (m) m.state = "expecting";
    else {
      // a train the working does not show: enter it in the register so that its arrival is watched
      const nm: Movement = { visit: { train, arrive: true, from, track: "1", depart: null }, state: "expecting", said: new Set() };
      this.movements.push(nm); this.register.push(nm);
    }
    this.tell(w, `Line clear for ${train} to ${this.name}; warrant ${sec} issued.`);
    return true;
  }

  /** Ask the box on side `to` for line clear for a train standing here and booked that way. */
  askLineClear(w: World, train: string, to: Side): boolean {
    const peer = this.peers[to];
    const m = this.movements.find((x) => x.visit.train === train && x.state === "ready" && x.visit.to === to);
    if (!peer || !m) return false;
    const fromSide = this.sideAt(peer);
    if (peer.acceptTrain(w, train, fromSide)) { m.state = "lineClear"; return true; }
    const sec = this.sections[to]!;
    const why = peer.refusal(w, sec, train)
      ?? (peer.mode === "npc" && !peer.movements.some((x) => x.visit.train === train && x.state === "offered" && x.visit.from === fromSide) ? `I have no working for ${train} from ${this.name}` : null);
    if (why) w.say(`${peer.name} Box`, `Not yet for ${train}: ${why}. — ${peer.master}, ${peer.name}`);
    return false;
  }

  /** for a starter route, the block section it leads into */
  starterSection(id: string): string | null {
    const mm = /^[12]→([SNB])$/.exec(id.split(":")[1] ?? "");
    return mm ? this.sections[mm[1] as Side] ?? null : null;
  }
  /** why a lever cannot be pulled, or null: the frame's checks, and no starter without a warrant (Rule S 28) */
  routeBlocked(w: World, id: string): string | null {
    const r = w.routes.find((x) => x.id === id);
    if (!r) return "no such route";
    if (r.live) return null;
    const sec = this.starterSection(id);
    if (sec) {
      // the warrant must be one issued for a departure this way, not an arriving train's warrant still uncancelled
      const t = w.warrants.get(sec);
      const forDeparture = !!t && this.movements.some((m) => m.visit.train === t && m.visit.to && this.sections[m.visit.to] === sec && (m.state === "lineClear" || m.state === "starterCleared" || m.state === "departing"));
      if (!forDeparture) return t ? `warrant ${sec} is out to ${t} arriving, not for a departure` : `no warrant for section ${sec}`;
    }
    return w.routeBlocked(id);
  }
  /** Pull a lever: set a route. */
  pullRoute(w: World, id: string): boolean {
    const why = this.routeBlocked(w, id);
    if (why) { this.refuse(w, `${this.routeLabel(w, id)}: ${why}.`); return false; }
    return w.setRoute(id);
  }
  /** Put a signal back to STOP; its route releases once nothing is approaching it. */
  replace(w: World, signalId: string) { w.replaceSignal(signalId); }

  /** Show the baton to a train standing here under a cleared starter with its doors closed (Rule S 40). */
  showBaton(w: World, train: string): boolean {
    const m = this.movements.find((x) => x.visit.train === train && x.visit.depart && (x.state === "ready" || x.state === "lineClear" || x.state === "starterCleared"));
    const tr = this.trainOf(w, train);
    if (!m || !tr) return false;
    if (m.state !== "starterCleared") { this.refuse(w, `${this.starterFor(m)?.id ?? "The starter"} is not cleared for ${train}.`); return false; }
    if (tr.anyDoorsOpen()) { this.refuse(w, `${train} still has its doors open.`); return false; }
    w.station(this.code).baton.add(train);
    m.state = "departing"; m.batonAt = w.time;
    this.tell(w, `Baton shown to ${train}.`);
    return true;
  }

  /** Train out of section: cancel the warrant on a side. Early, and it is written in the Incident Book (Rule S 36). */
  cancelWarrant(w: World, side: Side): boolean {
    const sec = this.sections[side]; if (!sec) return false;
    const train = w.warrants.get(sec); if (!train) return false;
    const i = this.arrived.findIndex((a) => a.train === train && a.side === side);
    if (i < 0) w.incident("WARRANT-EARLY", `Warrant ${sec} cancelled before ${train} had arrived complete at ${this.name} (Rule S 36)`);
    else this.arrived.splice(i, 1);
    w.trainOutOfSection(sec);
    this.requests = this.requests.filter((r) => !(r.train === train && r.from === side));
    this.tell(w, `${train} arrived complete at ${this.name}; warrant ${sec} cancelled.`);
    return true;
  }

  /** the lever's label on the frame */
  routeLabel(w: World, id: string): string {
    const name = id.split(":")[1] ?? id;
    const peer = (s: string) => this.sideName(w, s as Side) || s;
    let mm: RegExpExecArray | null;
    if ((mm = /^home[SNB]→([12])(c?)$/.exec(name))) return mm[2] ? `Call on to ${mm[1]}` : `→ Platform ${mm[1]}`;
    if ((mm = /^([12])→([SNB])$/.exec(name))) return `→ ${peer(mm[2])}`;
    const hs = this.roles.hsEdge?.track === "hs" ? "headshunt" : "stub";
    if (name === "1→hs") return `1 → ${hs}`;
    if (name === "hs→2→stub") return `${hs} → 2 → stub`;
    if (name === "stub→1") return "stub → 1";
    return name;
  }
  /** what a signal is for, in the frame's words */
  signalRole(w: World, sid: string): string {
    const r = this.roles;
    const peer = (s: Side) => this.sideName(w, s);
    // where a branch leaves, the levers name the destinations and the role only says which way
    const north = this.sections.B ? "northwards" : `to ${peer("N")}`;
    if (r.homeS?.id === sid) return `home from ${peer("S")}`;
    if (r.homeN?.id === sid) return `home from ${peer("N")}`;
    if (r.homeB?.id === sid) return `home from ${peer("B")}`;
    if (r.starter1S?.id === sid) return `platform 1 to ${peer("S")}`;
    if (r.starter2S?.id === sid) return `platform 2 to ${peer("S")}`;
    if (r.starter1N?.id === sid) return `platform 1 ${north}`;
    if (r.starter2N?.id === sid) return `platform 2 ${north}`;
    if (r.toHs?.id === sid) return `platform 1 to the ${r.hsEdge?.track === "hs" ? "headshunt" : "stub"}`;
    if (r.hsIn?.id === sid) return `from the ${r.hsEdge?.track === "hs" ? "headshunt" : "stub"}`;
    if (r.stubIn?.id === sid) return "from the stub";
    return "";
  }
  /** the routes of this box's frame, in frame order */
  frameRoutes(w: World): Route[] { return w.routes.filter((r) => r.station === this.code); }

  trainOf(w: World, number: string): Consist | null {
    const v = w.vehicles.find((x) => x.number === number);
    return v ? w.consistOf(v) : null;
  }
  private trainVehicle(w: World, number: string): Vehicle | undefined { return w.vehicles.find((x) => x.number === number); }
  /** a portion of a split train stands on its own (or the visit is not a split) */
  standsAlone(w: World, m: Movement): boolean {
    const v = m.visit;
    if (!v.splitFrom) return true;
    const other = this.trainOf(w, v.splitFrom);
    return !other || other !== this.trainOf(w, v.train);
  }
  /** any end of the train within 30 m of the signal, on its edge */
  private standsAt(train: Consist, sig: Signal): boolean {
    for (const v of train.vehicles) for (const p of [v.pos, v.posB]) if (p.edge === sig.pos.edge && Math.abs(p.s - sig.pos.s) < 30) return true;
    return false;
  }

  private step(w: World) {
    for (const m of this.movements) this.stepMovement(w, m);
    this.movements = this.movements.filter((m) => m.state !== "done");
  }

  private stepMovement(w: World, m: Movement) {
    const v = m.visit;
    const train = this.trainOf(w, v.train);
    if (!train) return;
    const e = this.st.edges, r = this.roles;
    const platforms = [e.t1, e.t2].filter((x): x is Edge => !!x);
    const booked = v.depart ? parseTime(v.depart) : null;
    const loco = v.loco ? this.trainVehicle(w, v.loco) : undefined;
    const locoConsist = loco ? w.consistOf(loco) : null;
    const stn = w.station(this.code);
    const t = w.time;
    const player = this.mode === "player";

    switch (m.state) {
      case "offered": break;
      case "expecting": {
        const on = platforms.find((tr) => w.whollyOn(train, [tr]));
        if (on && Math.abs(train.v) < 0.01 && (!v.joinTo || train.vehicles.length > 1)) {
          v.track = on === e.t1 ? "1" : "2";
          m.arrivedAt = t;
          const sec = this.sections[v.from!]!;
          if (player) this.arrived.push({ train: v.train, side: v.from!, at: t });
          else w.trainOutOfSection(sec);
          if (v.joinTo) {
            m.state = "done";
            if (!player) this.say(w, m, "joined", `${v.train} coupled to ${v.joinTo} at platform ${v.track}; warrant ${sec} cancelled. Connect the pipe and prove the brake before ${v.joinTo} leaves.`);
            break;
          }
          m.state = v.runRound ? "arrived" : "ready";
          if (player) break;
          const hsName = r.hsEdge && r.hsEdge.track === "hs" ? "headshunt" : "stub";
          if (v.runRound) this.say(w, m, "arr", `Welcome to ${this.name}. Warrant ${sec} cancelled. When you have uncoupled and are back in the cab, I will clear ${r.toHs!.id} for the loco to the ${hsName}.`);
          else this.say(w, m, "arr", `Train ${v.train} arrived complete at ${this.name}; warrant ${sec} cancelled.${v.depart ? ` ${this.starter(v.track, v.to!)?.id} will be cleared at ${fmtTime(booked! - 120)} for the ${v.depart} departure${v.to === "B" ? " to Fernhollow" : v.to === "N" ? " to Coldwater" : ""}.` : ""}`);
        } else if (player) {
          // a train stood at the home signal is a train the signaller is holding
          const home = v.from ? this.home(v.from) : undefined;
          if (home && home.aspect === "stop" && Math.abs(train.v) < 0.01 && this.standsAt(train, home)) {
            if (m.heldSince === undefined) m.heldSince = t;
            else if (!m.heldFlagged && t - m.heldSince > 90) { m.heldFlagged = true; w.incident("HELD-AT-HOME", `${v.train} held at ${home.id} for ${Math.round(t - m.heldSince)} s (Rule S 38)`); }
          } else m.heldSince = undefined;
        }
        break;
      }
      case "arrived": {
        if (locoConsist && locoConsist.vehicles.length === 1 && w.driver.kind === "cab" && w.driver.vehicle === loco) {
          if (w.setRoute(`${this.code}:1→hs`)) {
            m.state = "toHeadshunt";
            const hsName = r.hsEdge && r.hsEdge.track === "hs" ? "headshunt" : "stub";
            this.say(w, m, "hs", `Loco to the ${hsName}. ${r.toHs!.id} cleared. Stop clear of switch ${r.swHs!.id}${r.hsEdge!.track === "hs" ? ", short of the buffer stop" : ", short of the Limit of Shunt"}.`);
          }
        }
        break;
      }
      case "toHeadshunt": {
        if (locoConsist && w.whollyOn(locoConsist, [r.hsEdge!]) && Math.abs(locoConsist.v) < 0.01) {
          if (w.setRoute(`${this.code}:hs→2→stub`)) {
            m.state = "viaTrack2";
            this.say(w, m, "t2", `Change ends and set back via track 2 to the stub. ${r.hsIn!.id} and ${r.t2stub!.id} cleared. Stop short of the Limit of Shunt.`);
          }
        }
        break;
      }
      case "viaTrack2": {
        if (locoConsist && w.whollyOn(locoConsist, [r.stubEdge!]) && Math.abs(locoConsist.v) < 0.01) {
          if (w.setRoute(`${this.code}:stub→1`)) {
            m.state = "toCouple";
            this.say(w, m, "cp", `Change ends; onto track 1 to the coach. ${r.stubIn!.id} cleared. Couple gently, then connect and prove the brake.`);
          }
        }
        break;
      }
      case "toCouple": {
        const tr = this.trainOf(w, v.train)!;
        if (tr.vehicles.length >= 2 && tr.allPipesConnected()) {
          m.state = "ready";
          if (v.depart) this.say(w, m, "cpd", `Coupled. ${this.starter(v.track, v.to!)!.id} will be cleared at ${fmtTime(booked! - 120)} for the ${v.depart} departure.`);
          else this.say(w, m, "cpd", `Coupled. That completes the duty once the brake is proved and the train is stabled. Thank you.`);
        }
        break;
      }
      case "ready": {
        if (!booked) { m.state = "done"; break; }
        // a portion of a split train waits until it stands on its own
        if (!this.standsAlone(w, m)) {
          if (!player && t >= booked - 240) this.say(w, m, "split", `${v.train} to be uncoupled from ${v.splitFrom} for the ${v.depart} departure${v.to === "B" ? " to Fernhollow" : ""}.`);
          break;
        }
        if (player) break;
        if (t >= booked - 120) {
          const to = v.to!, peer = this.peers[to];
          if (!peer) { m.state = "done"; break; }
          if (peer.acceptTrain(w, v.train, this.sideAt(peer))) m.state = "lineClear";
          else this.say(w, m, "stblk", `Waiting for line clear from ${peer.name} for the ${v.depart} departure of ${v.train}.`);
        }
        break;
      }
      case "lineClear": {
        // the warrant is in hand; the starter route may still be held by a movement ahead
        const to = v.to!, sec = this.sections[to]!;
        const id = this.starterRouteFor(m)!;
        if (player) {
          if (w.routes.find((x) => x.id === id)?.live) m.state = "starterCleared";
          break;
        }
        if (w.setRoute(id)) {
          m.state = "starterCleared";
          this.say(w, m, "st", `Warrant ${sec} in hand. ${this.starter(v.track, to)!.id} cleared for the ${v.depart} departure${to === "B" ? " to Fernhollow: switch WD J lies for the branch" : to === "N" && this.code === "WD" ? " to Coldwater: switch WD J lies straight" : ""}. I will show the baton at the booked time when your doors are closed.`);
        } else {
          this.say(w, m, "stroute", `Warrant ${sec} in hand for ${v.train}; ${this.starter(v.track, to)!.id} will clear once the route ahead is free.`);
        }
        break;
      }
      case "starterCleared": {
        if (player) break;
        if (t >= booked!) {
          const tr = this.trainOf(w, v.train)!;
          if (!tr.anyDoorsOpen() && Math.abs(tr.v) < 0.01 && !stn.baton.has(v.train)) {
            if (tr.vehicles.length > 1 && !tr.brakeProved) this.say(w, m, "bp", `Prove the brake before I show the baton (Rule D 14).`);
            else { stn.baton.add(v.train); m.state = "departing"; m.batonAt = t; this.say(w, m, "bat", `Baton shown to ${v.train}. Ready to start.`); }
          }
        }
        break;
      }
      case "departing": {
        const track = v.track === "1" ? e.t1 : e.t2!;
        const starter = this.starter(v.track, v.to!)!;
        let gone = false;
        if (starter.aspect === "stop" && !w.isOccupied(track)) gone = true;
        else if (starter.aspect === "stop" && v.splitFrom === undefined && this.movements.some((o) => o !== m && o.visit.splitFrom === v.train)) gone = true; // the first portion has left; the platform still holds the second
        if (gone) {
          stn.baton.delete(v.train); m.state = "done"; m.departedAt = t;
          if (player && m.batonAt !== undefined && booked !== null) {
            const ref = Math.max(booked, (m.arrivedAt ?? -1e9) + 60);
            if (m.batonAt - ref > 60) w.incident("BATON-LATE", `Baton shown to ${v.train} at ${fmtTime(m.batonAt)}, booked away ${v.depart} (Rule S 40)`);
          }
        }
        break;
      }
      case "done": break;
    }
  }
}

/* ---------------- The signaller's duty ---------------- */

/** The player's duty in a box: the register, what comes next, and completion. */
export class BoxDuty {
  readonly kind = "box";
  box: Box;
  prep: string[];
  completion: (w: World) => string | null;

  constructor(w: World, box: Box, prep: string[], completion: (w: World) => string | null) {
    this.box = box; this.prep = prep; this.completion = completion;
    w.hooks.push((world) => this.step(world));
  }

  private step(w: World) {
    if (w.finished) return;
    const msg = this.completion(w);
    if (msg) { w.finished = msg; w.say("General Manager's Office", msg, "system"); }
  }

  /** the booked time a movement is first felt at the box */
  static timeOf(m: Movement): number {
    const v = m.visit;
    return v.arr ? parseTime(v.arr) : v.depart ? parseTime(v.depart) : 1e9;
  }
  /** the register in time order */
  get rows(): Movement[] { return this.box.register.slice().sort((a, b) => BoxDuty.timeOf(a) - BoxDuty.timeOf(b)); }
  /** the next booked event still to come, and the moment the signaller should be ready for it */
  nextEvent(w: World): { t: number; ready: number; label: string } | null {
    let best: { t: number; ready: number; label: string } | null = null;
    for (const m of this.box.register) {
      if (m.state === "done") continue;
      const v = m.visit;
      const cands: { t: number; ready: number; label: string }[] = [];
      if (v.arr && m.arrivedAt === undefined && m.state === "offered") {
        // the peer asks for line clear two minutes before its booked departure: that is the first thing to answer
        const arr = parseTime(v.arr);
        const peer = v.from ? this.box.peers[v.from] : undefined;
        const pm = peer?.register.filter((x) => x.visit.train === v.train && x.visit.depart && parseTime(x.visit.depart) < arr).sort((a, b) => parseTime(b.visit.depart!) - parseTime(a.visit.depart!))[0];
        if (pm) { const t = parseTime(pm.visit.depart!) - 120; cands.push({ t, ready: t - 30, label: `${this.box.sideName(w, v.from)} asking line clear for ${v.train}` }); }
        else cands.push({ t: arr, ready: arr - 150, label: `${v.train} due from ${this.box.sideName(w, v.from)}` });
      }
      if (v.depart && (m.state === "ready" || m.state === "expecting" || m.state === "arrived" || m.state === "toCouple")) { const t = parseTime(v.depart); cands.push({ t, ready: t - 150, label: `${v.train} away to ${this.box.sideName(w, v.to)}` }); }
      for (const c of cands) if (c.ready > w.time + 20 && (!best || c.ready < best.ready)) best = c;
    }
    return best;
  }
}
