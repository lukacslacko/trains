import { World } from "./world";
import { type Leg, legDir } from "./duty";
import { type Vehicle, type End, type BrakeStep, type Consist } from "../stock/vehicles";
import { parseTime } from "../core/util";
import { distanceAlong, type Position } from "../track/graph";

type NpcState = "prep" | "riding" | "waiting" | "running" | "dwell" | "done";

export interface NpcOptions {
  /** leg indexes after whose arrival this driver uncouples the other car before leaving */
  splitAfterLeg?: number[];
  /** stations where this driver arrives on a call-on and couples to a standing train */
  joinAt?: string[];
  /** stations where this driver, riding in a train that divides there, uncouples their own car and drives it on */
  divideAt?: string[];
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
  /** standing still at a platform since (for dividing while riding) */
  private stoodSince: number | null = null;

  constructor(w: World, vehicle: Vehicle, legs: Leg[], opts: NpcOptions = {}) {
    this.vehicle = vehicle; this.legs = legs; this.opts = opts;
    w.npc.add(vehicle);
    w.npcDrivers.push(this);
    w.hooks.push((world, dt) => this.step(world, dt));
  }

  private cabFor(w: World, dir: 1 | -1): End {
    const e = this.vehicle.pos.edge;
    let aDown = e.kmDir * this.vehicle.pos.dir; // +1 when the A end faces Down (increasing km)
    // on a shed road the kilometres run into the shed: facing out (decreasing shed km) is facing the line's outDir
    const shed = w.layout.sheds.find((sh) => sh.line === e.line);
    if (shed) aDown = -aDown * shed.outDir;
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

  /**
   * Distance along the route as set to where this train stops at its destination: the stop board for its
   * direction on whichever platform track the route leads to, or, where that track has none, the far end of
   * its platform. Null while the route leads nowhere useful (the home still at STOP, say).
   */
  private distanceToStop(w: World, lead: Position, code: string, dir: 1 | -1, track?: string): number | null {
    const st = w.station(code);
    let best: number | null = null;
    const consider = (track: string, km: number) => {
      let p: Position;
      try { p = w.layout.graph.atKm(track, km, dir); } catch { return; }
      const d = distanceAlong(lead, p.edge, p.s, 9000);
      if (d !== null && (best === null || d < best)) best = d;
    };
    // a shed road: stop three metres short of its buffer stop (nearer vehicles are stopped short of separately)
    const road = w.layout.sheds.find((sh) => sh.station === code)?.roads.find((r) => r.track === track);
    if (road) return distanceAlong(lead, road.edge, road.edge.length - 3, 9000);
    for (const s of st.stops) if (s.dir === dir && (!track || s.track === track)) consider(s.track, s.km);
    if (best !== null) return best;
    for (const p of w.layout.platforms) {
      if (!st.edges?.some((e) => e.track === p.track)) continue;
      consider(p.track, dir === 1 ? p.kmTo - 0.004 : p.kmFrom + 0.004);
    }
    return best;
  }

  /** the consist stands within a station's limits */
  private standsAt(w: World, c: Consist, code: string): boolean {
    const edges = w.station(code).edges ?? [];
    return c.vehicles.some((veh) => w.edgesOf(veh).some((e) => edges.includes(e)));
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
    if (this.state === "running" && c.vehicles.length > this.lastLen && leg && (leg.joins || this.opts.joinAt?.includes(leg.to))) {
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
      // the train divides here: once it has stood at the platform a while, uncouple my car from the driver's portion
      if (leg && (leg.divides || this.opts.divideAt?.includes(leg.from)) && this.standsAt(w, c, leg.from) && !this.splitDone.has(-1 - this.index)) {
        if (Math.abs(c.v) > 0.01) this.stoodSince = null;
        else if (this.stoodSince === null) this.stoodSince = w.time;
        else if (w.time - this.stoodSince > 20 && c.control) {
          const me = c.vehicles.indexOf(v), drv = c.vehicles.indexOf(c.control.vehicle);
          w.uncoupleAt(c, me < drv ? me : me - 1);
          this.splitDone.add(-1 - this.index);
          this.stoodSince = null;
        }
      }
      return;
    }
    if (this.state === "riding") {
      // a day that begins by riding: nobody's train yet, but not mine to take until it has divided
      if (leg && leg.divides && c.vehicles.length > 1) return;
      // on our own again (uncoupled, or the other driver keyed out): take the cab for the current leg
      if (!leg) { this.state = "done"; return; }
      this.takeCab(w, this.cabFor(w, legDir(w, leg)));
      w.consistOf(v).control!.cab.reverser = "F";
      this.state = "waiting";
      return;
    }

    switch (this.state) {
      case "prep": {
        if (!leg) { this.state = "done"; return; }
        // riding first: keep the car ready and leave the cab to the driver of the train
        if (leg.divides && c.vehicles.length > 1) {
          if (v.panto === "down") { v.panto = "raising"; v.pantoTimer = 4; }
          v.parkingBrake = false;
          this.state = "riding";
          return;
        }
        if (!cab) this.takeCab(w, this.cabFor(w, legDir(w, leg)));
        if (v.panto !== "up") { if (v.panto === "down") { v.panto = "raising"; v.pantoTimer = 4; } return; }
        v.parkingBrake = false;
        c.control!.cab.reverser = "F";
        this.state = "waiting";
        return;
      }
      case "waiting": {
        if (!leg || !cab) { this.state = "done"; return; }
        this.whistled.clear();
        const dep = parseTime(leg.dep);
        const st = w.station(leg.from);
        if (w.time >= dep - 30 && c.anyDoorsOpen()) for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = false;
        // a colleague proves the brake through a coupled train during the dwell
        if (c.vehicles.length > 1 && !c.brakeProved && c.allPipesConnected() && w.time >= dep - 90) c.brakeProved = true;
        if (w.time < dep) return;
        if (c.anyDoorsOpen()) return;
        // a divided portion waits until the rest of the train has been uncoupled
        if (leg.portion !== undefined && c.vehicles.length > leg.portion) return;
        const ahead = w.ahead(c, 400);
        let proceed: boolean, baton: boolean;
        if (leg.kind === "shunt") {
          // a shunt moves on the first signal ahead showing anything but STOP, ground or subsidiary, and needs no baton
          c.shunting = true;
          const first = ahead.find((i) => i.kind === "signal" && i.obj && i.obj.kind === "signal" && i.obj.type !== "distant");
          proceed = !first || first.aspect !== "stop";
          baton = true;
        } else {
          const sig = ahead.find((i) => i.kind === "signal" && i.obj && i.obj.kind === "signal" && i.obj.type === "main");
          proceed = !sig || (sig.aspect === "caution" || sig.aspect === "clear");
          baton = !st.master || st.baton.has(v.number);
        }
        if (!proceed || !baton) return;
        if (w.time - v.lastHorn > 20) { v.hornUntil = w.time + 1; v.lastHorn = w.time; return; }
        cab.reverser = "F"; cab.brake = 0;
        this.state = "running";
        return;
      }
      case "running": {
        if (!leg || !cab) { this.state = "done"; return; }
        const dir = legDir(w, leg);
        const joining = leg.joins ?? this.opts.joinAt?.includes(leg.to) ?? false;
        const sign = c.v !== 0 ? Math.sign(c.v) : c.cabForwardSign(c.control!.index, cab);
        const lead = c.leadingPos(sign);
        const toStop = this.distanceToStop(w, lead, leg.to, dir, leg.toTrack);
        const items = w.ahead(c, 1500);
        let target = toStop === null ? 1e9 : toStop - 0.6;
        for (const i of items) {
          if (i.kind !== "signal" || !i.obj || i.obj.kind !== "signal") continue;
          if (i.obj.type === "main") {
            // a train needs a main aspect; a shunting move may take the subsidiary; a call-on takes it onto the occupied platform
            if (i.aspect === "stop" || (i.aspect === "shunt" && c.isTrain && !(joining && i.obj.callOn))) { target = Math.min(target, i.dist - 3); break; }
          } else if (i.obj.type === "ground" && c.shunting && i.aspect === "stop") { target = Math.min(target, i.dist - 3); break; }
        }
        for (const i of items) if (i.kind === "buffer") target = Math.min(target, i.dist - 4);
        let coupling = false;
        // vehicles ahead: couple to them when that is the plan, otherwise stop two metres short
        for (const i of items) if (i.kind === "vehicle") { if (joining) { target = Math.min(target, i.dist - 0.2); coupling = true; } else target = Math.min(target, i.dist - 2.0); break; }
        for (const i of items) {
          if (i.dist > 15 || !i.obj || i.obj.kind !== "board") continue;
          if (i.obj.board === "whistle" && !this.whistled.has(i.obj.id)) { this.whistled.add(i.obj.id); v.hornUntil = w.time + 1.5; v.lastHorn = w.time; v.lastLongHorn = w.time; }
          if (i.obj.board === "section") this.powerOff = true;
          if (i.obj.board === "resume") this.powerOff = false;
        }
        const speed = Math.abs(c.v);
        const lim = w.limitFor(c) / 3.6;
        const decel = target < 30 ? 0.3 : 0.45;
        let vAllowed = Math.min(lim, Math.sqrt(2 * decel * Math.max(target - 0.4, 0)), target < 8 ? 0.7 : 99);
        // a lower speed board ahead: be down to its speed by the board (Rule R 10)
        for (const i of items) {
          if (i.kind !== "board" || !i.obj || i.obj.kind !== "board" || i.obj.board !== "speed" || !i.applies) continue;
          const v2 = (i.obj.value ?? 99) / 3.6;
          if (v2 < lim) vAllowed = Math.min(vAllowed, Math.sqrt(v2 * v2 + 2 * 0.45 * Math.max(i.dist - 5, 0)));
        }
        // a call-on ahead: at shunting speed by the signal (Rule S 30)
        if (joining) for (const i of items) {
          if (i.kind !== "signal" || !i.obj || i.obj.kind !== "signal" || i.obj.type !== "main") continue;
          if (i.aspect === "shunt" && i.obj.callOn) { const v2 = 15 / 3.6; vAllowed = Math.min(vAllowed, Math.sqrt(v2 * v2 + 2 * 0.45 * Math.max(i.dist - 5, 0))); }
          break;
        }
        // moving off again after a stop on the way (at a signal, say): one short blast first (Rule R 18)
        if (speed < 0.05 && vAllowed > 0.3 && target > 1.2 && w.time - v.lastHorn > 25) { v.hornUntil = w.time + 1; v.lastHorn = w.time; return; }
        if (coupling) { if (target < 20) vAllowed = Math.min(vAllowed, 1.1); if (target < 3) vAllowed = Math.min(vAllowed, 0.4); if (target < 0.8) vAllowed = 0.3; }
        if (!coupling && target <= 1.2) {
          cab.notch = 0; cab.brake = 4;
          if (speed < 0.05 && ((toStop !== null && toStop < 4) || (leg.kind === "shunt" && target < 2.5))) {
            this.state = "dwell"; this.dwellStarted = w.time;
            if (w.atPlatform(c) && (leg.kind ?? "passenger") === "passenger") for (const x of c.vehicles) if (x.type.doors) x.doorsOpen = true;
          }
          return;
        }
        // gentler braking at creeping speeds, so the release comes through before the car stops; and a nudge of power when creeping too slowly
        if (speed > vAllowed + 0.2) { cab.notch = 0; cab.brake = (speed - vAllowed > 2 ? 3 : speed > 1.5 ? 2 : 1) as BrakeStep; }
        else if (speed < vAllowed - (vAllowed < 1 ? 0.15 : 0.4) && !this.powerOff) { cab.brake = 0; cab.notch = target > 100 ? 3 : 1; }
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
          // stabled in a shed: pantograph down, lights out
          if (leg && /^sh\d/.test(leg.toTrack ?? "")) {
            for (const x of c.vehicles) { if (x.panto === "up") { x.panto = "lowering"; x.pantoTimer = 4; } for (const cb of Object.values(x.cabs)) if (cb) cb.lights = "off"; }
          }
          this.state = "done";
          return;
        }
        if (w.time - this.dwellStarted < 40) return;
        const end = this.cabFor(w, legDir(w, next));
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
