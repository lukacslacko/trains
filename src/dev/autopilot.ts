/**
 * A scripted driver for headless tests: drives a consist to a kilometre,
 * changes ends, couples, proves the brake. Not a player feature.
 */
import { World } from "../sim/world";
import { type Consist, type Vehicle, type End } from "../stock/vehicles";
import { kmOf } from "../track/graph";
import { fmtTime } from "../core/util";

export class Autopilot {
  w: World;
  log: string[] = [];
  private powerOff = false;
  constructor(w: World) { this.w = w; }

  step(n: number) { for (let i = 0; i < n; i++) this.w.step(0.05); }
  until(cond: () => boolean, max = 900): boolean {
    let t = 0;
    while (!cond() && t < max) { this.w.step(0.05); t += 0.05; }
    return cond();
  }
  frontKm(c: Consist, dir: 1 | -1) {
    const ks = c.vehicles.flatMap((v) => [kmOf(v.pos), kmOf(v.posB)]);
    return dir === 1 ? Math.max(...ks) : Math.min(...ks);
  }
  say(s: string) { this.log.push(`${fmtTime(this.w.time, true)} ${s}`); }

  /** Drive `c` until its leading end (in km direction `dir`) stands at targetKm. */
  drive(c: Consist, targetKm: number, dir: 1 | -1, opts: { couple?: boolean; max?: number } = {}) {
    const w = this.w;
    let t = 0; const max = opts.max ?? 900;
    const zonesOf = (line: string) => w.layout.lines[line]?.speedZones ?? w.layout.speedZones;
    const n0 = w.consists.length;
    while (t < max) {
      if (opts.couple && w.consists.length < n0) break;
      const front = this.frontKm(c, dir);
      let dist = (targetKm - front) * dir * 1000;
      // signals at STOP ahead, whistle boards, section boards
      const items = w.ahead(c, 1500);
      for (const i of items) {
        if (i.kind === "signal" && i.obj && i.obj.kind === "signal" && i.obj.type === "main" && (i.aspect === "stop" || (i.aspect === "shunt" && c.isTrain))) { dist = Math.min(dist, i.dist - 3); break; }
      }
      const ctlV = c.control?.vehicle;
      for (const i of items) {
        if (i.dist > 15 || !i.obj || i.obj.kind !== "board") continue;
        if (i.obj.board === "whistle" && ctlV && w.time - ctlV.lastHorn > 30) { ctlV.hornUntil = w.time + 1.5; ctlV.lastHorn = w.time; }
        if (i.obj.board === "section") this.powerOff = true;
        if (i.obj.board === "resume") this.powerOff = false;
      }
      const v = Math.abs(c.v);
      let lim = w.limitFor(c) / 3.6;
      // the next zone boundary ahead where the limit drops
      const line = c.leadingPos(dir === 1 ? 1 : -1).edge.line;
      for (const [a, b, l] of zonesOf(line)) {
        const boundary = dir === 1 ? a : b;
        const dZone = (boundary - front) * dir * 1000;
        if (dZone > 0 && l / 3.6 < lim && dZone < (v * v) / (2 * 0.5) + 20) lim = Math.min(lim, l / 3.6);
      }
      let vd = Math.min(lim, Math.sqrt(2 * 0.45 * Math.max(dist - 0.6, 0)));
      if (opts.couple) { if (dist < 20) vd = Math.min(vd, 1.1); if (dist < 3) vd = Math.min(vd, 0.4); if (dist < 0.6) vd = 0.3; }
      if (!opts.couple && (dist <= 0.6 || (v < 0.05 && dist < 1.2))) { w.setNotch(0); w.setBrake(4); if (v < 0.05) break; }
      else if (v > vd + 0.3) { w.setNotch(0); w.setBrake(v - vd > 2 ? 3 : 2); }
      else if (v < vd - 0.3) { w.setBrake(0); w.setNotch(this.powerOff ? 0 : dist > 50 ? 3 : 1); }
      else { w.setNotch(0); w.setBrake(0); }
      w.step(0.05); t += 0.05;
    }
    w.setNotch(0); w.setBrake(4);
    const cc = w.consistOf(c.vehicles[0]);
    this.until(() => Math.abs(cc.v) < 0.001, 30);
    return { t: Math.round(t), short: Number(((targetKm - this.frontKm(cc, dir)) * dir * 1000).toFixed(2)), consists: w.consists.length };
  }
  secure() { this.w.setNotch(0); this.w.setReverser("N"); this.w.setBrake(4); }
  walkTo(label: string) {
    const t = this.w.walkTargets().find((x) => x.label.includes(label));
    if (!t) throw new Error(`no walk target ${label} among ${this.w.walkTargets().map((x) => x.label).join(", ")}`);
    this.w.walkTo(t.anchor);
    this.until(() => this.w.driver.kind === "ground");
  }
  toCab(v: Vehicle, end: End) { this.walkTo(`Cab ${end} of ${v.number}`); this.w.enterCab(); this.w.setLights("head"); this.w.setReverser("F"); }
  changeEnds(v: Vehicle, end: End) { this.secure(); this.w.setLights("tail"); this.w.leaveCab(); this.toCab(v, end); }
  prove(v: Vehicle) { this.w.setBrake(4); this.until(() => v.pipe <= 3.6, 30); this.w.startBrakeTest(); this.until(() => !this.w.brakeTest, 40); }
  waitUntilTime(t: number) { this.until(() => this.w.time >= t, 4000); }
  waitBaton(code: string, deadline: number) { const n = this.w.trainVehicle.number; this.until(() => this.w.station(code).baton.has(n), Math.max(1, deadline - this.w.time) + 240); return this.w.station(code).baton.has(n); }
  depart(v: Vehicle) { this.w.horn(); this.w.setBrake(0); this.until(() => v.pipe >= 4.9, 60); }
  report() {
    const w = this.w;
    return { log: this.log, finished: w.finished, incidents: w.incidents.map((i) => `${fmtTime(i.t, true)} ${i.text}`), boxes: w.messages.filter((m) => m.kind === "box").map((m) => `${fmtTime(m.t, true)} ${m.text}`) };
  }
}
