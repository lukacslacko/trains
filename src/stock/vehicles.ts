import { type Position, advance, reversed, clonePos } from "../track/graph";
import { clamp } from "../core/util";

export type End = "A" | "B";
export type LightState = "off" | "tail" | "head";
export type Reverser = "F" | "N" | "R";
export type BrakeStep = 0 | 1 | 2 | 3 | 4 | 5; // Release, 1, 2, 3, Full, Emergency
export const BRAKE_NAMES = ["Release", "1", "2", "3", "Full", "Emergency"];
export const PIPE_TARGET = [5.0, 4.6, 4.2, 3.9, 3.5, 0.0];

export interface VehicleType {
  cls: string;          // "Class 1"
  nickname: string;     // "Lark"
  length: number;       // m
  mass: number;         // t
  cabs: End[];          // which ends have cabs
  passenger: boolean;
  powerKW: number;
  maxTE: number;        // kN
  maxSpeed: number;     // km/h
  brakeDecel: number;   // m/s² at full service
  pantograph: boolean;
  doors: boolean;
}

export const CLASS_1: VehicleType = { cls: "Class 1", nickname: "Lark", length: 22, mass: 38, cabs: ["A", "B"], passenger: true, powerKW: 300, maxTE: 45, maxSpeed: 60, brakeDecel: 1.0, pantograph: true, doors: true };
export const CLASS_4: VehicleType = { cls: "Class 4", nickname: "Heron", length: 16, mass: 64, cabs: ["A", "B"], passenger: false, powerKW: 1200, maxTE: 140, maxSpeed: 90, brakeDecel: 1.0, pantograph: true, doors: false };
export const TYPE_C4: VehicleType = { cls: "Type C4", nickname: "coach", length: 20, mass: 30, cabs: [], passenger: true, powerKW: 0, maxTE: 0, maxSpeed: 90, brakeDecel: 1.0, pantograph: false, doors: true };

export interface Cab {
  end: End;
  reverser: Reverser;
  notch: number;        // 0..4
  brake: BrakeStep;
  lights: LightState;   // lights at this end
  active: boolean;      // driver present
}

export type PantoState = "down" | "raising" | "up" | "lowering";

export class Vehicle {
  id: string;
  number: string;
  type: VehicleType;
  /** position of end A; pos.dir points from B towards A ("A-forward") */
  pos: Position;
  cabs: Partial<Record<End, Cab>> = {};
  /** lights on ends without cabs (coach) are automatic */
  autoLights: Partial<Record<End, LightState>> = {};
  panto: PantoState = "down";
  pantoTimer = 0;
  doorsOpen = false;
  doorTimer = 0;
  pipe = 0;             // brake pipe pressure, bar
  /** parking (hand) brake, cabbed vehicles only; holds about half the full service force */
  parkingBrake = false;
  /** set by the world: false while the pantograph stands under a neutral section */
  lineVolts = true;
  /** sounding until this time (Infinity while the horn is held) */
  hornUntil = 0;
  lastHorn = -1e9;
  /** when the last long blast (held 1.5 s or more) ended */
  lastLongHorn = -1e9;

  constructor(id: string, number: string, type: VehicleType, pos: Position) {
    this.id = id; this.number = number; this.type = type; this.pos = pos;
    for (const end of type.cabs) {
      this.cabs[end] = { end, reverser: "N", notch: 0, brake: 4, lights: "off", active: false };
    }
  }

  get length() { return this.type.length; }
  get mass() { return this.type.mass; }

  /** position of end B (dir points outward from the vehicle, i.e. "B-forward") */
  get posB(): Position {
    return advance(reversed(this.pos), this.length).pos;
  }
  /** Position of an end, with dir pointing outward from the vehicle. */
  endPos(end: End): Position {
    return end === "A" ? clonePos(this.pos) : this.posB;
  }
  lightsAt(end: End): LightState {
    const cab = this.cabs[end];
    if (cab) return cab.lights;
    return this.autoLights[end] ?? "off";
  }
  get activeCab(): Cab | undefined {
    return Object.values(this.cabs).find((c) => c && c.active);
  }
  /** brake force fraction 0..1 from pipe pressure */
  get brakeFraction() {
    return clamp((5.0 - this.pipe) / 1.5, 0, 1);
  }
  get powered() {
    return this.type.pantograph && this.panto === "up" && this.lineVolts;
  }
}

export interface Coupling { pipe: boolean }

/**
 * A consist is a chain of mechanically coupled vehicles. vehicles[0] is the
 * "front" for the purposes of the consist's reference direction; flip[i] says
 * whether vehicle i's A end points towards the rear of the consist.
 */
export class Consist {
  id: string;
  vehicles: Vehicle[];
  flip: boolean[];
  couplings: Coupling[] = []; // between i and i+1
  v = 0;                      // m/s, positive towards vehicles[0]'s leading end
  brakeProved = false;
  hasMovedSinceStop = false;
  /** the cab whose brake valve and controller act on this consist (may be unattended) */
  control: { vehicle: Vehicle; cab: Cab; index: number } | null = null;
  /** passed a home signal on its subsidiary: proceed at shunting speed to the vehicles ahead */
  callOn = false;
  /**
   * A shunting move rather than a train: works under ground signals and subsidiaries at 15 km/h,
   * stop boards do not apply. The signal passed says which it is; a vehicle without passenger
   * accommodation starts as one, and anything stabled in a shed is one until it leaves under a main aspect.
   */
  shunting: boolean;

  constructor(id: string, vehicles: Vehicle[], flip: boolean[]) {
    this.id = id; this.vehicles = vehicles; this.flip = flip;
    for (let i = 0; i + 1 < vehicles.length; i++) this.couplings.push({ pipe: true });
    this.shunting = !vehicles.some((v) => v.type.passenger);
  }

  get mass() { return this.vehicles.reduce((m, v) => m + v.mass, 0); }
  get length() { return this.vehicles.reduce((l, v) => l + v.length, 0); }
  get isTrain() { return !this.shunting; }
  get speedKmh() { return Math.abs(this.v) * 3.6; }

  /** Reference direction of the consist as a track Position at the front end (dir outward). */
  frontEnd(): { vehicle: Vehicle; end: End } {
    const v = this.vehicles[0];
    return { vehicle: v, end: this.flip[0] ? "B" : "A" };
  }
  rearEnd(): { vehicle: Vehicle; end: End } {
    const i = this.vehicles.length - 1;
    const v = this.vehicles[i];
    return { vehicle: v, end: this.flip[i] ? "A" : "B" };
  }
  /** Position of the leading end in the direction of a signed velocity (dir outward). */
  leadingPos(sign: number): Position {
    const e = sign >= 0 ? this.frontEnd() : this.rearEnd();
    return e.vehicle.endPos(e.end);
  }

  /** Sign relative to the consist reference of "forward" for a given cab. */
  cabForwardSign(index: number, cab: Cab): number {
    const aForward = cab.end === "A" ? 1 : -1;
    return aForward * (this.flip[index] ? -1 : 1);
  }

  /** Move all vehicles by dx metres (signed, in consist reference). Returns whether a buffer was struck. */
  translate(dx: number): { hitBuffer: boolean; trailed: string | null } {
    let hitBuffer = false;
    let trailed: string | null = null;
    for (let i = 0; i < this.vehicles.length; i++) {
      const veh = this.vehicles[i];
      const d = this.flip[i] ? -dx : dx;
      const r = advance(veh.pos, d);
      veh.pos = r.pos;
      if (r.hitBuffer) hitBuffer = true;
      if (r.trailedAgainst) trailed = r.trailedAgainst.id;
    }
    return { hitBuffer, trailed };
  }

  /** Pipe connectivity groups; group containing the controller follows the cab, others vent. */
  pipeGroups(): Vehicle[][] {
    const groups: Vehicle[][] = [];
    let cur: Vehicle[] = [this.vehicles[0]];
    for (let i = 0; i + 1 < this.vehicles.length; i++) {
      if (this.couplings[i].pipe) cur.push(this.vehicles[i + 1]);
      else { groups.push(cur); cur = [this.vehicles[i + 1]]; }
    }
    groups.push(cur);
    return groups;
  }

  allPipesConnected() { return this.couplings.every((c) => c.pipe); }
  anyDoorsOpen() { return this.vehicles.some((v) => v.doorsOpen); }
}

export interface Forces { traction: number; brake: number; resistance: number }

/** One physics step for a consist. Returns events. */
/**
 * @param gravityN  the downhill force on the whole consist, signed in the consist reference (N)
 */
export function stepConsist(c: Consist, dt: number, gravityN = 0): { hitBuffer: boolean; trailed: string | null; forces: Forces } {
  const ctl = c.control;

  // Pantographs
  for (const v of c.vehicles) {
    if (v.panto === "raising") { v.pantoTimer -= dt; if (v.pantoTimer <= 0) v.panto = "up"; }
    if (v.panto === "lowering") { v.pantoTimer -= dt; if (v.pantoTimer <= 0) v.panto = "down"; }
    if (v.doorTimer > 0) v.doorTimer -= dt;
  }

  // Brake pipe
  const groups = c.pipeGroups();
  for (const g of groups) {
    const controlled = ctl && g.includes(ctl.vehicle);
    const target = controlled ? PIPE_TARGET[ctl!.cab.brake] : 0;
    for (const v of g) {
      if (v.pipe > target) {
        const rate = target === 0 && ctl?.cab.brake === 5 ? 6 : (target === 0 ? 2.5 : 1.0);
        v.pipe = Math.max(target, v.pipe - rate * dt);
      } else if (v.pipe < target) {
        v.pipe = Math.min(target, v.pipe + 0.45 * dt);
      }
    }
  }

  // Forces (N)
  const M = c.mass * 1000;
  let traction = 0;
  if (ctl) {
    const { vehicle, cab, index } = ctl;
    const doorsOpen = c.anyDoorsOpen();
    if (vehicle.powered && cab.reverser !== "N" && cab.notch > 0 && !doorsOpen) {
      const sign = c.cabForwardSign(index, cab) * (cab.reverser === "F" ? 1 : -1);
      const vabs = Math.abs(c.v);
      // in multiple working every powered car in the pipe group answers the leading controller
      const group = c.pipeGroups().find((g) => g.includes(vehicle)) ?? [vehicle];
      let te = 0;
      for (const v of group) if (v.powered && v.type.powerKW > 0) te += Math.min(v.type.maxTE * 1000, (v.type.powerKW * 1000) / Math.max(vabs, 1.5));
      // taper to zero above max speed
      const vmax = vehicle.type.maxSpeed / 3.6;
      const taper = clamp((vmax - vabs) / 2, 0, 1);
      traction = sign * (cab.notch / 4) * te * taper;
    }
  }
  const brake = c.vehicles.reduce((f, v) => f + (v.brakeFraction + (v.parkingBrake ? 0.5 : 0)) * v.mass * 1000 * v.type.brakeDecel, 0);
  const vabs = Math.abs(c.v);
  const resistance = M * 9.81 * 0.0015 + 0.6 * vabs * vabs;
  // gravity acts like traction: it has a direction of its own
  const drive = traction + gravityN;

  let v = c.v;
  if (v === 0) {
    // static: the driving forces must beat brake + rolling resistance, else the train stays put
    if (Math.abs(drive) > brake + resistance) {
      const a = (Math.abs(drive) - brake - resistance) / M;
      v = Math.sign(drive) * a * dt;
    }
  } else {
    const s = Math.sign(v);
    const a = (drive - s * (brake + resistance)) / M;
    const nv = v + a * dt;
    v = Math.sign(nv) !== s ? 0 : nv;
  }
  c.v = v;
  const dx = v * dt;
  let hitBuffer = false, trailed: string | null = null;
  if (dx !== 0) {
    const r = c.translate(dx);
    hitBuffer = r.hitBuffer; trailed = r.trailed;
    if (hitBuffer) c.v = 0;
    c.hasMovedSinceStop = true;
  }
  return { hitBuffer, trailed, forces: { traction, brake, resistance } };
}
