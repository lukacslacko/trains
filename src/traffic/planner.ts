/**
 * From the working timetable to the day's work: the boxes' visits, the drivers' legs.
 */
import { World } from "../sim/world";
import { type Box, type Side, type Visit, type Leg } from "../sim/duty";
import { type NpcOptions } from "../sim/npc";
import { type Timetable, type Service, type Diagram, serviceOf } from "./timetable";

/** the side of a box on which a neighbouring station lies */
export function sideTowards(w: World, box: Box, code: string): Side {
  for (const side of ["S", "N", "B"] as Side[]) {
    const id = box.sections[side];
    if (!id) continue;
    const sec = w.section(id);
    if (sec.from === code || sec.to === code) return side;
  }
  throw new Error(`${box.code} has no side towards ${code}`);
}

/** Plan every box's working from the timetable. */
export function planBoxes(w: World, tt: Timetable, boxes: Record<string, Box>) {
  const lead = (s: Service) => (s.coupledTo ? serviceOf(tt, s.coupledTo.service).vehicle : s.vehicle);
  for (const s of tt.services) {
    const calls = s.calls;
    const untilIdx = s.coupledTo ? calls.findIndex((c) => c.at === s.coupledTo!.until) : -1;
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i], prev = calls[i - 1], next = calls[i + 1];
      const box = boxes[c.at];
      if (!box) continue;
      const track = box.trackName(c.track);
      const departs = next && next.at !== c.at;
      const to = departs ? sideTowards(w, box, next.at) : undefined;
      if (s.coupledTo && i < untilIdx) continue;                       // carried in another train
      if (s.coupledTo && i === untilIdx) {
        // the train divides here: this portion waits to be uncoupled, then leaves on its own
        if (departs) box.plan({ train: s.vehicle, arrive: false, splitFrom: lead(serviceOf(tt, s.coupledTo.service)), track, arr: c.arr, depart: c.dep!, to });
        continue;
      }
      if (prev && prev.at === c.at) {
        // reached by a shunt within the station
        box.plan({ train: s.vehicle, arrive: false, track, shunt: { from: box.trackName(prev.track), to: track }, depart: prev.dep!, arr: c.arr });
        if (departs) box.plan({ train: s.vehicle, arrive: false, track, depart: c.dep!, to });
        continue;
      }
      if (prev) {
        const v: Visit = { train: s.vehicle, arrive: true, from: sideTowards(w, box, prev.at), track, arr: c.arr, depart: departs ? c.dep! : null, to };
        if (s.joins && i === calls.length - 1) v.joinTo = serviceOf(tt, s.joins).vehicle;
        box.plan(v);
        continue;
      }
      if (departs) box.plan({ train: s.vehicle, arrive: false, track, depart: c.dep!, to });
    }
  }
  for (const b of Object.values(boxes)) b.sortRegister();
}

/** A driver's legs and what else they do, from their diagram. */
export function driverProgram(tt: Timetable, d: Diagram): { legs: Leg[]; opts: NpcOptions } {
  const legs: Leg[] = [];
  const opts: NpcOptions = { name: d.driver, divideAt: [], joinAt: [] };
  for (const num of d.turns) {
    const s = serviceOf(tt, num);
    const calls = s.calls;
    let start = 0;
    if (s.coupledTo) { start = calls.findIndex((c) => c.at === s.coupledTo!.until); opts.divideAt!.push(s.coupledTo.until); }
    // the lead of a divided train leaves the divide station with its own portion only
    const divided = tt.services.filter((x) => x.coupledTo && x.coupledTo.service === num).map((x) => x.coupledTo!.until);
    for (let i = start; i + 1 < calls.length; i++) {
      const a = calls[i], b = calls[i + 1];
      const leg: Leg = { from: a.at, to: b.at, dep: a.dep!, arr: b.arr!, fromTrack: a.track, toTrack: b.track, kind: a.at === b.at ? "shunt" : s.kind, service: s.number };
      if (divided.includes(a.at)) leg.portion = 1;
      if (s.coupledTo && i === start) leg.divides = true;
      if (s.joins && i + 2 === calls.length) leg.joins = true;
      legs.push(leg);
    }
  }
  return { legs, opts };
}
