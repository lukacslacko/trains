import { World } from "./world";
import { type Leg, legDir, stopFor, frontKm } from "./duty";
import { type Vehicle, type End, type BrakeStep } from "../stock/vehicles";
import { parseTime } from "../core/util";

type NpcState = "prep" | "waiting" | "running" | "dwell" | "done";

/**
 * A colleague driving a train to its booked legs: obeys signals, boards and the baton,
 * keeps to the speed limits, works the doors, and changes ends at the termini.
 */
export class NpcDriver {
  vehicle: Vehicle;
  legs: Leg[];
  index = 0;
  state: NpcState = "prep";
  private tick = 0;
  private powerOff = false;
  private whistled = new Set<string>();
  private dwellStarted = 0;
  private cabEnd: End = "A";

  constructor(w: World, vehicle: Vehicle, legs: Leg[]) {
    this.vehicle = vehicle; this.legs = legs;
    w.npc.add(vehicle);
    w.npcDrivers.push(this);
    w.hooks.push((world, dt) => this.step(world, dt));
  }

  private cabFor(w: World, dir: 1 | -1): End {
    // the cab whose outward direction is `dir` in km terms
    void w;
    const aDown = this.vehicle.pos.edge.kmDir * this.vehicle.pos.dir; // +1 when the A end faces Down
    return aDown === dir ? "A" : "B";
  }

  private takeCab(w: World, end: End) {
    const c = w.consistOf(this.vehicle);
    const cab = this.vehicle.cabs[end]!;
    for (const v of c.vehicles) for (const cb of Object.values(v.cabs)) if (cb) { cb.active = false; }
    cab.active = true;
    c.control = { vehicle: this.vehicle, cab, index: c.vehicles.indexOf(this.vehicle) };
    this.cabEnd = end;
    const other: End = end === "A" ? "B" : "A";
    cab.lights = "head";
    if (this.vehicle.cabs[other]) this.vehicle.cabs[other]!.lights = "tail";
    cab.reverser = "N"; cab.notch = 0; cab.brake = 4;
  }

  private step(w: World, dt: number) {
    this.tick += dt;
    if (this.tick < 0.2) return;
    this.tick = 0;
    const c = w.consistOf(this.vehicle);
    const leg = this.legs[this.index];
    const v = this.vehicle;
    const cab = c.control?.cab;

    switch (this.state) {
      case "prep": {
        if (!leg) { this.state = "done"; return; }
        const dir = legDir(w, leg);
        if (!cab) this.takeCab(w, this.cabFor(w, dir));
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
        if (w.time < dep) return;
        if (c.anyDoorsOpen()) return;
        // signal and baton
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
        const front = frontKm(c, dir);
        const items = w.ahead(c, 1500);
        // stopping points: a main signal at STOP (or showing only its subsidiary), the stop board, the buffer
        let target = (stop.km - front) * dir * 1000 - 0.6;
        for (const i of items) {
          if (i.kind === "signal" && i.obj && i.obj.kind === "signal" && i.obj.type === "main" && (i.aspect === "stop" || i.aspect === "shunt")) { target = Math.min(target, i.dist - 3); break; }
        }
        for (const i of items) if (i.kind === "buffer") target = Math.min(target, i.dist - 4);
        // boards: whistle, section, resume
        for (const i of items) {
          if (i.dist > 15 || !i.obj || i.obj.kind !== "board") continue;
          if (i.obj.board === "whistle" && !this.whistled.has(i.obj.id)) { this.whistled.add(i.obj.id); v.hornUntil = w.time + 1.5; v.lastHorn = w.time; }
          if (i.obj.board === "section") this.powerOff = true;
          if (i.obj.board === "resume") this.powerOff = false;
        }
        const speed = Math.abs(c.v);
        const lim = w.limitFor(c) / 3.6;
        // a gentle final approach: the brake pipe needs a moment, so aim to be crawling over the last metres
        const decel = target < 30 ? 0.3 : 0.45;
        const vAllowed = Math.min(lim, Math.sqrt(2 * decel * Math.max(target - 0.4, 0)), target < 8 ? 0.7 : 99);
        if (target <= 1.2) {
          cab.notch = 0; cab.brake = 4;
          if (speed < 0.05) {
            const short = (stop.km - front) * dir * 1000;
            if (short < 3 && short > -2) {
              this.state = "dwell"; this.dwellStarted = w.time;
              if (w.atPlatform(c)) for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = true;
            }
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
        if (!next) {
          // stable
          for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = false;
          if (cab) { cab.reverser = "N"; cab.notch = 0; cab.brake = 4; }
          v.parkingBrake = true;
          this.state = "done";
          return;
        }
        if (w.time - this.dwellStarted < 40) return;
        const end = this.cabFor(w, legDir(w, next));
        if (end !== this.cabEnd) this.takeCab(w, end);
        c.control!.cab.reverser = "F";
        this.index++;
        this.state = "waiting";
        return;
      }
      case "done": return;
    }
  }
}
