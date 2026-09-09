import { World } from "./world";
import { type ValleyLayout, type StationLayout, type Signal, type Stop } from "../track/layouts";
import { type Edge, type SwitchState, type Switch, kmOf } from "../track/graph";
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
  track: "1" | "2";
  depart: string | null;
  to?: Side;
  runRound?: boolean;
  /** this train arrives coupled to `splitFrom` and leaves on its own: it waits to be uncoupled */
  splitFrom?: string;
  /** this train arrives as a call-on and couples onto `joinTo`, which then leaves as one train */
  joinTo?: string;
}

type MoveState = "offered" | "expecting" | "arrived" | "toHeadshunt" | "viaTrack2" | "toCouple" | "ready" | "lineClear" | "starterCleared" | "departing" | "done";

interface Movement { visit: Visit; state: MoveState; said: Set<string> }

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
  movements: Movement[] = [];
  peers: Partial<Record<Side, Box>> = {};
  sections: Partial<Record<Side, string>> = {};

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
    w.hooks.push((world) => this.step(world));
  }

  /** a is south of b on the main line (side "N" of a is b), or b hangs off a's branch */
  static link(a: Box, b: Box, viaBranch = false) {
    if (viaBranch) { a.peers.B = b; b.peers.S = a; } else { a.peers.N = b; b.peers.S = a; }
  }

  plan(v: Visit) {
    this.movements.push({ visit: v, state: v.arrive ? "offered" : "ready", said: new Set() });
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

  private sign(text: string) { return `${text} — ${this.master}, ${this.name}`; }
  private say(w: World, m: Movement, key: string, text: string) {
    if (m.said.has(key)) return;
    m.said.add(key);
    w.say(`${this.name} Box`, this.sign(text));
  }

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

  /** The peer box asks: may train `train` enter the section towards us? */
  acceptTrain(w: World, train: string, fromSide: Side): boolean {
    const m = this.movements.find((x) => x.visit.train === train && x.state === "offered" && x.visit.from === fromSide);
    if (!m) return false;
    const sec = this.sections[fromSide]!;
    if (!w.lineClear(sec, train)) return false;
    const routeId = `${this.code}:home${fromSide}→${m.visit.track}${m.visit.joinTo ? "c" : ""}`;
    if (!w.setRoute(routeId)) { w.warrants.delete(sec); return false; }
    m.state = "expecting";
    const home = this.home(fromSide)!;
    this.say(w, m, "expect", m.visit.joinTo
      ? `Line clear for ${train} to ${this.name}. Warrant ${sec} issued; ${home.id} shows its subsidiary: call on to platform ${m.visit.track} and couple to ${m.visit.joinTo} standing there.`
      : `Line clear for ${train} to ${this.name}. Warrant ${sec} issued; ${home.id} cleared into track ${m.visit.track}.`);
    return true;
  }

  private trainOf(w: World, number: string): Consist | null {
    const v = w.vehicles.find((x) => x.number === number);
    return v ? w.consistOf(v) : null;
  }
  private trainVehicle(w: World, number: string): Vehicle | undefined { return w.vehicles.find((x) => x.number === number); }

  private step(w: World) {
    for (const m of this.movements) this.stepMovement(w, m);
    this.movements = this.movements.filter((m) => m.state !== "done");
  }

  private stepMovement(w: World, m: Movement) {
    const v = m.visit;
    const train = this.trainOf(w, v.train);
    if (!train) return;
    const e = this.st.edges, r = this.roles;
    const track = v.track === "1" ? e.t1 : e.t2!;
    const booked = v.depart ? parseTime(v.depart) : null;
    const loco = v.loco ? this.trainVehicle(w, v.loco) : undefined;
    const locoConsist = loco ? w.consistOf(loco) : null;
    const stn = w.station(this.code);
    const t = w.time;

    switch (m.state) {
      case "offered": break;
      case "expecting": {
        if (w.whollyOn(train, [track]) && Math.abs(train.v) < 0.01 && (!v.joinTo || train.vehicles.length > 1)) {
          w.trainOutOfSection(this.sections[v.from!]!);
          if (v.joinTo) {
            m.state = "done";
            this.say(w, m, "joined", `${v.train} coupled to ${v.joinTo} at platform ${v.track}; warrant ${this.sections[v.from!]} cancelled. Connect the pipe and prove the brake before ${v.joinTo} leaves.`);
            break;
          }
          m.state = v.runRound ? "arrived" : "ready";
          const hsName = r.hsEdge && r.hsEdge.track === "hs" ? "headshunt" : "stub";
          if (v.runRound) this.say(w, m, "arr", `Welcome to ${this.name}. Warrant ${this.sections[v.from!]} cancelled. When you have uncoupled and are back in the cab, I will clear ${r.toHs!.id} for the loco to the ${hsName}.`);
          else this.say(w, m, "arr", `Train ${v.train} arrived complete at ${this.name}; warrant ${this.sections[v.from!]} cancelled.${v.depart ? ` ${this.starter(v.track, v.to!)?.id} will be cleared at ${fmtTime(booked! - 120)} for the ${v.depart} departure${v.to === "B" ? " to Fernhollow" : v.to === "N" ? " to Coldwater" : ""}.` : ""}`);
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
        if (v.splitFrom) {
          const other = this.trainOf(w, v.splitFrom);
          if (other && other === this.trainOf(w, v.train)) {
            if (t >= booked - 240) this.say(w, m, "split", `${v.train} to be uncoupled from ${v.splitFrom} for the ${v.depart} departure${v.to === "B" ? " to Fernhollow" : ""}.`);
            break;
          }
        }
        if (t >= booked - 120) {
          const to = v.to!, peer = this.peers[to];
          if (!peer) { m.state = "done"; break; }
          const fromSide: Side = to === "S" ? (peer.peers.S === this ? "S" : peer.peers.B === this ? "B" : "N") : "S";
          if (peer.acceptTrain(w, v.train, fromSide)) m.state = "lineClear";
          else this.say(w, m, "stblk", `Waiting for line clear from ${peer.name} for the ${v.depart} departure of ${v.train}.`);
        }
        break;
      }
      case "lineClear": {
        // the warrant is in hand; the starter route may still be held by a movement ahead
        const to = v.to!, sec = this.sections[to]!;
        if (w.setRoute(`${this.code}:${v.track}→${to}`)) {
          m.state = "starterCleared";
          this.say(w, m, "st", `Warrant ${sec} in hand. ${this.starter(v.track, to)!.id} cleared for the ${v.depart} departure${to === "B" ? " to Fernhollow: switch WD J lies for the branch" : to === "N" && this.code === "WD" ? " to Coldwater: switch WD J lies straight" : ""}. I will show the baton at the booked time when your doors are closed.`);
        } else {
          this.say(w, m, "stroute", `Warrant ${sec} in hand for ${v.train}; ${this.starter(v.track, to)!.id} will clear once the route ahead is free.`);
        }
        break;
      }
      case "starterCleared": {
        if (t >= booked!) {
          const tr = this.trainOf(w, v.train)!;
          if (!tr.anyDoorsOpen() && Math.abs(tr.v) < 0.01 && !stn.baton.has(v.train)) {
            if (tr.vehicles.length > 1 && !tr.brakeProved) this.say(w, m, "bp", `Prove the brake before I show the baton (Rule D 14).`);
            else { stn.baton.add(v.train); m.state = "departing"; this.say(w, m, "bat", `Baton shown to ${v.train}. Ready to start.`); }
          }
        }
        break;
      }
      case "departing": {
        const starter = this.starter(v.track, v.to!)!;
        if (starter.aspect === "stop" && !w.isOccupied(track)) { stn.baton.delete(v.train); m.state = "done"; }
        else if (starter.aspect === "stop" && v.splitFrom === undefined && this.movements.some((o) => o !== m && o.visit.splitFrom === v.train)) {
          // the first portion has left; the platform still holds the second
          stn.baton.delete(v.train); m.state = "done";
        }
        break;
      }
      case "done": break;
    }
  }
}
