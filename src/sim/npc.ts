import { World } from "./world";
import { type Leg, legDir, stopFor } from "./duty";
import { type Vehicle, type End, type BrakeStep } from "../stock/vehicles";
import { parseTime } from "../core/util";
import { distanceAlong } from "../track/graph";

type NpcState = "prep" | "riding" | "waiting" | "running" | "dwell" | "done";

export interface NpcOptions {
  /** leg indexes after whose arrival this driver uncouples the other car before leaving */
  splitAfterLeg?: number[];
  /** stations where this driver arrives on a call-on and couples to a standing train */
  joinAt?: string[];
  /** a name for the messages */
  name?: string;
}

/**
 * A colleague driving a train to its booked legs: obeys signals, boards and the baton,
 * keeps to the speed limits, works the doors, changes ends, splits and joins.
 */
export class NpcDriver {
  vehicle: Vehicle;
  legs: Leg[];
  index = 0;
  state: NpcState = "prep";
  opts: NpcOptions;
  private tick = 0;
  private powerOff = false;
  private whistled = new Set<string>();
  private dwellStarted = 0;
  private cabEnd: End = "A";
  private splitDone = new Set<number>();
  private lastLen = 1;

  constructor(w: World, vehicle: Vehicle, legs: Leg[], opts: NpcOptions = {}) {
    this.vehicle = vehicle; this.legs = legs; this.opts = opts;
    w.npc.add(vehicle);
    w.npcDrivers.push(this);
    w.hooks.push((world, dt) => this.step(world, dt));
  }

  private cabFor(dir: 1 | -1): End {
    const aDown = this.vehicle.pos.edge.kmDir * this.vehicle.pos.dir; // +1 when the A end faces Down
    return aDown === dir ? "A" : "B";
  }

  private takeCab(w: World, end: End) {
    const c = w.consistOf(this.vehicle);
    const cab = this.vehicle.cabs[end]!;
    for (const x of c.vehicles) for (const cb of Object.values(x.cabs)) if (cb) cb.active = false;
    cab.active = true;
    c.control = { vehicle: this.vehicle, cab, index: c.vehicles.indexOf(this.vehicle) };
    this.cabEnd = end;
    const other: End = end === "A" ? "B" : "A";
    cab.lights = "head";
    if (this.vehicle.cabs[other]) this.vehicle.cabs[other]!.lights = "tail";
    cab.reverser = "N"; cab.notch = 0; cab.brake = 4;
  }

  /** true when another vehicle's cab controls the consist this car stands in */
  private ridesBehind(w: World): boolean {
    const c = w.consistOf(this.vehicle);
    return !!c.control && c.control.vehicle !== this.vehicle;
  }

  private step(w: World, dt: number) {
    this.tick += dt;
    if (this.tick < 0.2) return;
    this.tick = 0;
    const c = w.consistOf(this.vehicle);
    const leg = this.legs[this.index];
    const v = this.vehicle;
    const cab = c.control?.vehicle === v ? c.control.cab : undefined;

    // just coupled onto another train while running a call-on: connect the pipe and control line at my coupling
    if (this.state === "running" && c.vehicles.length > this.lastLen && leg && this.opts.joinAt?.includes(leg.to)) {
      const me = c.vehicles.indexOf(v);
      const k = me === 0 ? 0 : me - 1;
      w.connectAt(c, k);
      this.index++;
      this.state = this.legs[this.index] ? "riding" : "done";
      this.lastLen = c.vehicles.length;
      return;
    }
    this.lastLen = c.vehicles.length;

    // coupled into a train someone else drives: keep the car ready and wait
    if (this.ridesBehind(w)) {
      if (v.panto === "down") { v.panto = "raising"; v.pantoTimer = 4; }
      v.parkingBrake = false;
      if (this.state !== "riding") { this.state = "riding"; }
      return;
    }
    if (this.state === "riding") {
      // on our own again (uncoupled, or the other driver keyed out): take the cab for the current leg
      if (!leg) { this.state = "done"; return; }
      this.takeCab(w, this.cabFor(legDir(w, leg)));
      w.consistOf(v).control!.cab.reverser = "F";
      this.state = "waiting";
      return;
    }

    switch (this.state) {
      case "prep": {
        if (!leg) { this.state = "done"; return; }
        if (!cab) this.takeCab(w, this.cabFor(legDir(w, leg)));
        if (v.panto !== "up") { if (v.panto === "down") { v.panto = "raising"; v.pantoTimer = 4; } return; }
        v.parkingBrake = false;
        c.control!.cab.reverser = "F";
        this.state = "waiting";
        return;
      }
      case "waiting": {
        if (!leg || !cab) { this.state = "done"; return; }
        const dep = parseTime(leg.dep);
        const st = w.station(leg.from);
        if (w.time >= dep - 30 && c.anyDoorsOpen()) for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = false;
        // a colleague proves the brake through a coupled train during the dwell
        if (c.vehicles.length > 1 && !c.brakeProved && c.allPipesConnected() && w.time >= dep - 90) c.brakeProved = true;
        if (w.time < dep) return;
        if (c.anyDoorsOpen()) return;
        const ahead = w.ahead(c, 400);
        const sig = ahead.find((i) => i.kind === "signal" && i.obj && i.obj.kind === "signal" && i.obj.type === "main");
        const proceed = !sig || (sig.aspect === "caution" || sig.aspect === "clear");
        const baton = !st.master || st.baton.has(v.number);
        if (!proceed || !baton) return;
        if (w.time - v.lastHorn > 20) { v.hornUntil = w.time + 1; v.lastHorn = w.time; return; }
        cab.reverser = "F"; cab.brake = 0;
        this.state = "running";
        return;
      }
      case "running": {
        if (!leg || !cab) { this.state = "done"; return; }
        const dir = legDir(w, leg);
        const stop = stopFor(w, leg.to, dir);
        const joining = this.opts.joinAt?.includes(leg.to) ?? false;
        const sign = c.v !== 0 ? Math.sign(c.v) : c.cabForwardSign(c.control!.index, cab);
        const lead = c.leadingPos(sign);
        const stopPos = w.layout.graph.atKm(stop.track, stop.km, stop.dir);
        const toStop = distanceAlong(lead, stopPos.edge, stopPos.s, 9000);
        const items = w.ahead(c, 1500);
        let target = toStop === null ? 1e9 : toStop - 0.6;
        for (const i of items) {
          if (i.kind === "signal" && i.obj && i.obj.kind === "signal" && i.obj.type === "main") {
            if (i.aspect === "stop" || (i.aspect === "shunt" && !(joining && i.obj.callOn))) { target = Math.min(target, i.dist - 3); break; }
          }
        }
        for (const i of items) if (i.kind === "buffer") target = Math.min(target, i.dist - 4);
        let coupling = false;
        if (joining) for (const i of items) if (i.kind === "vehicle") { target = Math.min(target, i.dist - 0.2); coupling = true; break; }
        for (const i of items) {
          if (i.dist > 15 || !i.obj || i.obj.kind !== "board") continue;
          if (i.obj.board === "whistle" && !this.whistled.has(i.obj.id)) { this.whistled.add(i.obj.id); v.hornUntil = w.time + 1.5; v.lastHorn = w.time; }
          if (i.obj.board === "section") this.powerOff = true;
          if (i.obj.board === "resume") this.powerOff = false;
        }
        const speed = Math.abs(c.v);
        const lim = w.limitFor(c) / 3.6;
        const decel = target < 30 ? 0.3 : 0.45;
        let vAllowed = Math.min(lim, Math.sqrt(2 * decel * Math.max(target - 0.4, 0)), target < 8 ? 0.7 : 99);
        if (coupling) { if (target < 20) vAllowed = Math.min(vAllowed, 1.1); if (target < 3) vAllowed = Math.min(vAllowed, 0.4); if (target < 0.8) vAllowed = 0.3; }
        if (!coupling && target <= 1.2) {
          cab.notch = 0; cab.brake = 4;
          if (speed < 0.05 && toStop !== null && toStop < 4) {
            this.state = "dwell"; this.dwellStarted = w.time;
            if (w.atPlatform(c)) for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = true;
          }
          return;
        }
        if (speed > vAllowed + 0.2) { cab.notch = 0; cab.brake = (speed - vAllowed > 2 ? 3 : 2) as BrakeStep; }
        else if (speed < vAllowed - 0.4 && !this.powerOff) { cab.brake = 0; cab.notch = target > 100 ? 3 : 1; }
        else { cab.notch = 0; if (cab.brake !== 0 && speed < vAllowed) cab.brake = 0; }
        if (this.powerOff) cab.notch = 0;
        return;
      }
      case "dwell": {
        const next = this.legs[this.index + 1];
        // split: uncouple the rear car after a short dwell
        if (leg && this.opts.splitAfterLeg?.includes(this.index) && !this.splitDone.has(this.index) && c.vehicles.length > 1 && w.time - this.dwellStarted > 25) {
          const me = c.vehicles.indexOf(v);
          const k = me === 0 ? 0 : me - 1; // part the coupling next to this car
          w.uncoupleAt(c, k);
          this.splitDone.add(this.index);
          return;
        }
        if (!next) {
          for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = false;
          if (cab) { cab.reverser = "N"; cab.notch = 0; cab.brake = 4; }
          v.parkingBrake = true;
          this.state = "done";
          return;
        }
        if (w.time - this.dwellStarted < 40) return;
        const end = this.cabFor(legDir(w, next));
        if (end !== this.cabEnd) this.takeCab(w, end);
        w.consistOf(v).control!.cab.reverser = "F";
        this.index++;
        this.state = "waiting";
        return;
      }
      default: return;
    }
  }
}
