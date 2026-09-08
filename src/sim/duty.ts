import { World, type Route } from "./world";
import { type LoopStation } from "../track/layouts";
import { kmOf } from "../track/graph";
import { fmtTime, parseTime } from "../core/util";
import { type Consist } from "../stock/vehicles";

export interface Leg { from: string; to: string; dep: string; arr: string }

export type LegPhase = "waiting" | "running" | "done";
export interface LegState { leg: Leg; phase: LegPhase; departed?: number; arrived?: number }

/** Watches the passenger train against the booked legs and keeps the duty sheet. */
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

  /** Booked departure time (s) for a station visit, or null. */
  bookedDeparture(station: string, w: World): number | null {
    for (let i = this.index; i < this.legs.length; i++) {
      const l = this.legs[i];
      if (l.phase === "waiting" && l.leg.from === station) return parseTime(l.leg.dep);
    }
    void w;
    return null;
  }

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
    const st = w.station(cur.phase === "waiting" ? cur.leg.from : cur.leg.to);
    const platform = st.platform;
    const lead = this.trainFront(w, train, st.arriveDir);
    const km = kmOf(lead);

    // doors opened at this station: check stopping accuracy
    const doorsOpen = train.anyDoorsOpen();
    if (doorsOpen && !this.lastDoorsOpen && Math.abs(train.v) < 0.01) {
      const front = kmOf(this.trainFront(w, train, st.arriveDir));
      const short = (st.stopBoardKm - front) * st.arriveDir * 1000; // metres short of the board
      if (short > 3 && short < 100) w.incident("STOP-SHORT", `Doors opened ${short.toFixed(0)} m short of the stop board at ${st.name} (Rule R 12)`);
    }
    this.lastDoorsOpen = doorsOpen;

    if (cur.phase === "waiting") {
      // departure: the train's leading end leaves the platform towards the main line
      const outward = st.arriveDir === 1 ? platform.kmFrom - 0.02 : platform.kmTo + 0.02;
      const left = st.arriveDir === 1 ? km < outward : km > outward;
      if (left && Math.abs(train.v) > 0.1) {
        cur.phase = "running";
        cur.departed = w.time;
        const booked = parseTime(cur.leg.dep);
        if (w.time < booked - 5) w.incident("EARLY", `Departed ${st.name} at ${fmtTime(w.time)}, booked ${cur.leg.dep} (Rule R 20)`);
        if (st.master && !st.batonShown) w.incident("NO-BATON", `Departed ${st.name} without the baton (Rule R 20)`);
        st.batonShown = false;
        this.stoppedAtBoard = false;
        w.say("Duty", `Service departed ${st.name} at ${fmtTime(w.time)} (booked ${cur.leg.dep}).`, "system");
      }
    } else if (cur.phase === "running") {
      const dest = w.station(cur.leg.to);
      const front = kmOf(this.trainFront(w, train, dest.arriveDir));
      const short = (dest.stopBoardKm - front) * dest.arriveDir * 1000;
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

  private trainFront(w: World, train: Consist, arriveDir: 1 | -1) {
    void w;
    // the end of the train that faces the arrival direction
    const a = train.frontEnd(), b = train.rearEnd();
    const pa = a.vehicle.endPos(a.end), pb = b.vehicle.endPos(b.end);
    const ka = kmOf(pa), kb = kmOf(pb);
    return arriveDir === 1 ? (ka > kb ? pa : pb) : (ka < kb ? pa : pb);
  }
}

/* ---------------- Station masters for the loop layout ---------------- */

type SMState = "idle" | "expecting" | "arrived" | "toHeadshunt" | "viaTrack2" | "toCouple" | "coupled" | "starterCleared" | "departing";

export interface Visit { arrive: boolean; depart: string | null }

export class LoopStationMaster {
  code: string;
  name: string;
  master: string;
  loop: LoopStation;
  state: SMState = "idle";
  visits: Visit[];
  visit = 0;
  private msgOnce = new Set<string>();
  /** the other station, for the line-clear exchange */
  peer: LoopStationMaster | null = null;

  constructor(w: World, loop: LoopStation, visits: Visit[]) {
    this.loop = loop;
    this.code = loop.code;
    const st = w.station(loop.code);
    this.name = st.name;
    this.master = st.master ?? "";
    this.visits = visits;
    this.defineRoutes(w);
    const first = visits[0];
    if (first && !first.arrive) this.state = "coupled"; // train already stands here, coupled
    w.hooks.push((world) => this.step(world));
  }

  private sign(text: string) { return `${text} — ${this.master}, ${this.name}`; }
  private say(w: World, key: string, text: string) {
    if (this.msgOnce.has(key)) return;
    this.msgOnce.add(key);
    w.say(`${this.name} Box`, this.sign(text));
  }

  /** Signals by role, per WORLD.md §4.2. */
  get sig() {
    const s = this.loop.signals;
    return this.code === "AG"
      ? { home: s["2"], starter: s["1"], t1hs: s["4"], hsIn: s["5"], t2stub: s["3"], stubIn: s["6"] }
      : { home: s["1"], starter: s["2"], t1hs: s["3"], hsIn: s["6"], t2stub: s["4"], stubIn: s["5"] };
  }
  get home() { return this.sig.home; }
  get starter() { return this.sig.starter; }

  private defineRoutes(w: World) {
    const L = this.loop, c = this.code, S = this.sig;
    const routes: Route[] = [
      { id: `${c}:Main→1`, station: c, switches: [[L.switchA, "normal"]], signals: [[S.home, "caution"]], clear: [L.edges.bA1, L.edges.t1] },
      { id: `${c}:1→Main`, station: c, switches: [[L.switchA, "normal"]], signals: [[S.starter, "clear"]], clear: [L.edges.bA1, L.edges.stub, w.layout.graph.byId("main")] },
      { id: `${c}:1→Headshunt`, station: c, switches: [[L.switchB, "normal"]], signals: [[S.t1hs, "shunt"]], clear: [L.edges.bB1, L.edges.hs] },
      { id: `${c}:Headshunt→2→Stub`, station: c, switches: [[L.switchB, "reverse"], [L.switchA, "reverse"]], signals: [[S.hsIn, "shunt"], [S.t2stub, "shunt"]], clear: [L.edges.bB2, L.edges.t2, L.edges.bA2, L.edges.stub] },
      { id: `${c}:Stub→1`, station: c, switches: [[L.switchA, "normal"]], signals: [[S.stubIn, "shunt"]], clear: [L.edges.bA1] },
    ];
    w.routes.push(...routes);
  }

  /** Called by the peer when it has cleared its starter towards us. */
  expectTrain(w: World) {
    if (this.state !== "idle") return;
    if (w.setRoute(`${this.code}:Main→1`)) {
      this.state = "expecting";
      this.say(w, `expect${this.visit}`, `Line clear for the service to ${this.name}. ${this.home.id} cleared into track 1.`);
    }
  }

  private step(w: World) {
    const v = this.visits[this.visit];
    if (!v) return;
    const L = this.loop;
    const train = w.train;
    const loco = w.vehicles.find((x) => x.type.cabs.length > 0 && !x.type.passenger);
    const locoConsist = loco ? w.consistOf(loco) : null;
    const t = w.time;
    const booked = v.depart ? parseTime(v.depart) : null;

    switch (this.state) {
      case "idle":
        break;
      case "expecting": {
        // train stopped on track 1 at the board
        const onT1 = w.whollyOn(train, [L.edges.t1]);
        if (onT1 && Math.abs(train.v) < 0.01) {
          this.state = "arrived";
          this.say(w, `arr${this.visit}`, `Welcome to ${this.name}. When you have uncoupled and are back in the cab, I will clear ${this.sig.t1hs.id} for the loco to the headshunt.`);
        }
        break;
      }
      case "arrived": {
        // wait for uncoupling: loco alone in its own consist, driver in a cab of it
        if (locoConsist && locoConsist.vehicles.length === 1 && w.driver.kind === "cab" && w.driver.vehicle === loco) {
          if (w.setRoute(`${this.code}:1→Headshunt`)) {
            this.state = "toHeadshunt";
            this.say(w, `hs${this.visit}`, `Loco to the headshunt. ${this.sig.t1hs.id} cleared. Stop clear of switch ${L.switchB.id}, short of the buffer stop.`);
          }
        }
        break;
      }
      case "toHeadshunt": {
        if (locoConsist && w.whollyOn(locoConsist, [L.edges.hs]) && Math.abs(locoConsist.v) < 0.01) {
          if (w.setRoute(`${this.code}:Headshunt→2→Stub`)) {
            this.state = "viaTrack2";
            this.say(w, `t2${this.visit}`, `Change ends and set back via track 2 to the stub. ${this.sig.hsIn.id} and ${this.sig.t2stub.id} cleared. Stop short of the Limit of Shunt.`);
          }
        }
        break;
      }
      case "viaTrack2": {
        if (locoConsist && w.whollyOn(locoConsist, [L.edges.stub]) && Math.abs(locoConsist.v) < 0.01) {
          if (w.setRoute(`${this.code}:Stub→1`)) {
            this.state = "toCouple";
            this.say(w, `cp${this.visit}`, `Change ends; onto track 1 to the coach. ${this.sig.stubIn.id} cleared. Couple gently, then connect and prove the brake.`);
          }
        }
        break;
      }
      case "toCouple": {
        if (train.vehicles.length >= 2 && train.allPipesConnected()) {
          this.state = "coupled";
          if (v.depart) this.say(w, `cpd${this.visit}`, `Coupled. ${this.starter.id} will be cleared at ${fmtTime(booked! - 120)} for the ${v.depart} departure.`);
          else this.say(w, `cpd${this.visit}`, `Coupled. That completes the duty once the brake is proved and the train is stabled. Thank you.`);
        }
        break;
      }
      case "coupled": {
        if (!booked) { this.visit++; this.state = "idle"; break; }
        if (t >= booked - 120) {
          if (w.setRoute(`${this.code}:1→Main`)) {
            this.state = "starterCleared";
            this.say(w, `st${this.visit}`, `${this.starter.id} cleared for the ${v.depart} departure. I will show the baton at the booked time when your doors are closed.`);
            this.peer?.expectTrain(w);
          } else {
            this.say(w, `stblk${this.visit}`, `Cannot clear ${this.starter.id}: the line ahead is occupied.`);
          }
        }
        break;
      }
      case "starterCleared": {
        if (t >= booked!) {
          const st = w.station(this.code);
          if (!train.anyDoorsOpen() && Math.abs(train.v) < 0.01 && !st.batonShown) {
            if (!train.brakeProved) {
              this.say(w, `bp${this.visit}`, `Prove the brake before I show the baton (Rule D 14).`);
            } else {
              st.batonShown = true;
              this.state = "departing";
              this.say(w, `bat${this.visit}`, `Baton shown. Ready to start.`);
            }
          }
        }
        break;
      }
      case "departing": {
        // when the train has passed the starter (it replaces to stop) and cleared the loop
        if (this.starter.aspect === "stop" && !w.isOccupied(L.edges.t1) && !w.isOccupied(L.edges.bA1)) {
          this.state = "idle";
          this.visit++;
          w.station(this.code).batonShown = false;
        }
        break;
      }
    }
  }
}
