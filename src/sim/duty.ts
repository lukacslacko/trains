import { World } from "./world";
import { type ValleyLayout, type StationLayout, type Signal, type Stop } from "../track/layouts";
import { type Edge, type SwitchState, type Switch, kmOf } from "../track/graph";
import { fmtTime, parseTime } from "../core/util";
import { type Consist, type Vehicle } from "../stock/vehicles";

export interface Leg { from: string; to: string; dep: string; arr: string }

export type LegPhase = "waiting" | "running" | "done";
export interface LegState { leg: Leg; phase: LegPhase; departed?: number; arrived?: number }

/** km direction of travel for a leg, from the stations' stop positions */
export function legDir(w: World, leg: Leg): 1 | -1 {
  const a = w.station(leg.from).stops[0].km, b = w.station(leg.to).stops[0].km;
  return b > a ? 1 : -1;
}
/** the stop a train uses at a station when arriving in km direction `dir` */
export function stopFor(w: World, code: string, dir: 1 | -1): Stop {
  const st = w.station(code);
  return st.stops.find((s) => s.dir === dir) ?? st.stops[0];
}
/** the front of a consist in km direction `dir` */
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
    // where the train stands now: the origin's stop reached by the previous leg's direction, or the first stop
    const prev = this.legs[this.index - 1];
    const hereDir: 1 | -1 = prev ? legDir(w, prev.leg) : (-dir as 1 | -1);
    const here = stopFor(w, cur.leg.from, hereDir);

    // doors opened at a stop: check stopping accuracy against the stop the train is standing at
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
      if (left && Math.abs(train.v) > 0.1) {
        cur.phase = "running";
        cur.departed = w.time;
        const booked = parseTime(cur.leg.dep);
        if (w.time < booked - 5) w.incident("EARLY", `Departed ${st.name} at ${fmtTime(w.time)}, booked ${cur.leg.dep} (Rule R 20)`);
        if (st.master && !st.baton.has(w.trainVehicle.number)) w.incident("NO-BATON", `Departed ${st.name} without the baton (Rule R 20)`);
        st.baton.delete(w.trainVehicle.number);
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

export type Side = "S" | "N";

export interface Visit {
  /** the vehicle number that identifies the train (the passenger vehicle) */
  train: string;
  /** the locomotive that runs round, if any */
  loco?: string;
  arrive: boolean;
  /** which side the train arrives from, or departs towards if it does not arrive */
  from?: Side;
  track: "1" | "2";
  depart: string | null;
  /** the side it departs towards */
  to?: Side;
  runRound?: boolean;
}

type MoveState = "offered" | "expecting" | "arrived" | "toHeadshunt" | "viaTrack2" | "toCouple" | "ready" | "starterCleared" | "departing" | "done";

interface Movement { visit: Visit; state: MoveState; said: Set<string> }

/** Signals and switches by role for a station's box. */
interface Roles {
  homeS?: Signal; homeN?: Signal;
  starter1S?: Signal; starter1N?: Signal; starter2S?: Signal; starter2N?: Signal;
  stubSIn?: Signal; stubNIn?: Signal;
  /** run-round: track 1 → headshunt, headshunt → station, track 2 → stub, stub → station */
  toHs: Signal; hsIn: Signal; t2stub: Signal; stubIn: Signal;
  hsEdge: Edge; stubEdge: Edge; swHs: Switch; swMain: Switch;
  /** the side the headshunt lies on */
  hsSide: Side;
}

export class Box {
  code: string;
  name: string;
  master: string;
  st: StationLayout;
  roles: Roles;
  movements: Movement[] = [];
  peers: Partial<Record<Side, Box>> = {};
  /** section ids on each side */
  sections: Partial<Record<Side, string>> = {};

  constructor(w: World, layout: ValleyLayout, code: string) {
    this.code = code;
    this.st = layout.st[code];
    const info = w.station(code);
    this.name = info.name;
    this.master = info.master ?? "";
    this.roles = this.buildRoles();
    for (const sec of layout.sections) {
      if (sec.from === code) this.sections.N = sec.id;
      if (sec.to === code) this.sections.S = sec.id;
    }
    this.defineRoutes(w);
    w.hooks.push((world) => this.step(world));
  }

  static link(a: Box, b: Box) { a.peers.N = b; b.peers.S = a; }

  plan(v: Visit) {
    const state: MoveState = v.arrive ? "offered" : (v.runRound ? "ready" : "ready");
    this.movements.push({ visit: v, state, said: new Set() });
  }

  private buildRoles(): Roles {
    const s = this.st.signals, e = this.st.edges;
    switch (this.code) {
      case "AG": return { homeN: s["2"], starter1N: s["1"], stubNIn: s["6"], toHs: s["4"], hsIn: s["5"], t2stub: s["3"], stubIn: s["6"], hsEdge: e.stubS, stubEdge: e.stubN, swHs: this.st.switchS, swMain: this.st.switchN, hsSide: "S" };
      case "CW": return { homeS: s["1"], starter1S: s["2"], stubSIn: s["5"], toHs: s["3"], hsIn: s["6"], t2stub: s["4"], stubIn: s["5"], hsEdge: e.stubN, stubEdge: e.stubS, swHs: this.st.switchN, swMain: this.st.switchS, hsSide: "N" };
      default: return { homeS: s["1"], homeN: s["8"], starter1S: s["2"], starter2S: s["4"], starter1N: s["7"], starter2N: s["9"], stubSIn: s["5"], stubNIn: s["6"], toHs: s["7"], hsIn: s["6"], t2stub: s["4"], stubIn: s["5"], hsEdge: e.stubN, stubEdge: e.stubS, swHs: this.st.switchN, swMain: this.st.switchS, hsSide: "N" };
    }
  }

  private sign(text: string) { return `${text} — ${this.master}, ${this.name}`; }
  private say(w: World, m: Movement, key: string, text: string) {
    if (m.said.has(key)) return;
    m.said.add(key);
    w.say(`${this.name} Box`, this.sign(text));
  }

  private defineRoutes(w: World) {
    const c = this.code, e = this.st.edges, r = this.roles, swS = this.st.switchS, swN = this.st.switchN;
    const R = (id: string, switches: [Switch, SwitchState][], signals: [Signal, Signal["aspect"]][], clear: Edge[]) => w.routes.push({ id: `${c}:${id}`, station: c, switches, signals, clear });
    if (r.homeS) { R("homeS→1", [[swS, "normal"]], [[r.homeS, "caution"]], [e.bS1, e.t1]); R("homeS→2", [[swS, "reverse"]], [[r.homeS, "caution"]], [e.bS2, e.t2]); }
    if (r.homeN) { R("homeN→1", [[swN, "normal"]], [[r.homeN, "caution"]], [e.bN1, e.t1]); R("homeN→2", [[swN, "reverse"]], [[r.homeN, "caution"]], [e.bN2, e.t2]); }
    if (r.starter1S) R("1→S", [[swS, "normal"]], [[r.starter1S, "clear"]], [e.bS1, e.stubS]);
    if (r.starter2S) R("2→S", [[swS, "reverse"]], [[r.starter2S, "clear"]], [e.bS2, e.stubS]);
    if (r.starter1N) R("1→N", [[swN, "normal"]], [[r.starter1N, "clear"]], [e.bN1, e.stubN]);
    if (r.starter2N) R("2→N", [[swN, "reverse"]], [[r.starter2N, "clear"]], [e.bN2, e.stubN]);
    // run-round
    const bHs1 = r.hsSide === "S" ? e.bS1 : e.bN1, bHs2 = r.hsSide === "S" ? e.bS2 : e.bN2;
    const bMain1 = r.hsSide === "S" ? e.bN1 : e.bS1, bMain2 = r.hsSide === "S" ? e.bN2 : e.bS2;
    R("1→hs", [[r.swHs, "normal"]], [[r.toHs, "shunt"]], [bHs1, r.hsEdge]);
    R("hs→2→stub", [[r.swHs, "reverse"], [r.swMain, "reverse"]], [[r.hsIn, "shunt"], [r.t2stub, "shunt"]], [bHs2, e.t2, bMain2, r.stubEdge]);
    R("stub→1", [[r.swMain, "normal"]], [[r.stubIn, "shunt"]], [bMain1]);
  }

  private home(side: Side) { return side === "S" ? this.roles.homeS : this.roles.homeN; }
  private starter(track: "1" | "2", to: Side) {
    return to === "S" ? (track === "1" ? this.roles.starter1S : this.roles.starter2S) : (track === "1" ? this.roles.starter1N : this.roles.starter2N);
  }

  /** The peer box asks: may train `train` enter the section towards us, into our planned track? */
  acceptTrain(w: World, train: string, fromSide: Side): boolean {
    const m = this.movements.find((x) => x.visit.train === train && x.state === "offered" && x.visit.from === fromSide);
    if (!m) return false;
    const sec = this.sections[fromSide]!;
    if (!w.lineClear(sec, train)) return false;
    if (!w.setRoute(`${this.code}:home${fromSide}→${m.visit.track}`)) { w.warrants.delete(sec); return false; }
    m.state = "expecting";
    this.say(w, m, "expect", `Line clear for ${train} to ${this.name}. Warrant ${sec} issued; ${this.home(fromSide)!.id} cleared into track ${m.visit.track}.`);
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
    const track = v.track === "1" ? e.t1 : e.t2;
    const booked = v.depart ? parseTime(v.depart) : null;
    const loco = v.loco ? this.trainVehicle(w, v.loco) : undefined;
    const locoConsist = loco ? w.consistOf(loco) : null;
    const stn = w.station(this.code);
    const t = w.time;

    switch (m.state) {
      case "offered":
        break; // waiting for the peer to offer the train
      case "expecting": {
        if (w.whollyOn(train, [track]) && Math.abs(train.v) < 0.01) {
          w.trainOutOfSection(this.sections[v.from!]!);
          m.state = v.runRound ? "arrived" : "ready";
          if (v.runRound) this.say(w, m, "arr", `Welcome to ${this.name}. Warrant ${this.sections[v.from!]} cancelled. When you have uncoupled and are back in the cab, I will clear ${r.toHs.id} for the loco to the ${r.hsSide === this.mainSideOpposite() ? "headshunt" : "stub"}.`);
          else this.say(w, m, "arr", `Train ${v.train} arrived complete at ${this.name}; warrant ${this.sections[v.from!]} cancelled.${v.depart ? ` ${this.starter(v.track, v.to!)?.id} will be cleared at ${fmtTime(booked! - 120)} for the ${v.depart} departure.` : ""}`);
        }
        break;
      }
      case "arrived": {
        if (locoConsist && locoConsist.vehicles.length === 1 && w.driver.kind === "cab" && w.driver.vehicle === loco) {
          if (w.setRoute(`${this.code}:1→hs`)) {
            m.state = "toHeadshunt";
            this.say(w, m, "hs", `Loco to the ${r.hsSide === this.mainSideOpposite() ? "headshunt" : "stub"}. ${r.toHs.id} cleared. Stop clear of switch ${r.swHs.id}${r.hsEdge.track === "hs" ? ", short of the buffer stop" : ", short of the Limit of Shunt"}.`);
          }
        }
        break;
      }
      case "toHeadshunt": {
        if (locoConsist && w.whollyOn(locoConsist, [r.hsEdge]) && Math.abs(locoConsist.v) < 0.01) {
          if (w.setRoute(`${this.code}:hs→2→stub`)) {
            m.state = "viaTrack2";
            this.say(w, m, "t2", `Change ends and set back via track 2 to the stub. ${r.hsIn.id} and ${r.t2stub.id} cleared. Stop short of the Limit of Shunt.`);
          }
        }
        break;
      }
      case "viaTrack2": {
        if (locoConsist && w.whollyOn(locoConsist, [r.stubEdge]) && Math.abs(locoConsist.v) < 0.01) {
          if (w.setRoute(`${this.code}:stub→1`)) {
            m.state = "toCouple";
            this.say(w, m, "cp", `Change ends; onto track 1 to the coach. ${r.stubIn.id} cleared. Couple gently, then connect and prove the brake.`);
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
        if (t >= booked - 120) {
          const to = v.to!, peer = this.peers[to], sec = this.sections[to]!;
          if (!peer) { m.state = "done"; break; }
          if (peer.acceptTrain(w, v.train, to === "N" ? "S" : "N")) {
            if (w.setRoute(`${this.code}:${v.track}→${to}`)) {
              m.state = "starterCleared";
              this.say(w, m, "st", `Warrant ${sec} in hand. ${this.starter(v.track, to)!.id} cleared for the ${v.depart} departure. I will show the baton at the booked time when your doors are closed.`);
            } else {
              w.warrants.delete(sec);
            }
          } else {
            this.say(w, m, "stblk", `Waiting for line clear from ${peer.name} for the ${v.depart} departure.`);
          }
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
        break;
      }
      case "done": break;
    }
  }

  private mainSideOpposite(): Side { return this.st.mainSide === "N" ? "S" : this.st.mainSide === "S" ? "N" : "X" as Side; }
}
