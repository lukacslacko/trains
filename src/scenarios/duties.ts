import { World } from "../sim/world";
import { DutyTracker, LoopStationMaster, type Leg } from "../sim/duty";
import { shuttleLayout, loopLayout } from "../track/layouts";
import { Vehicle, Consist, CLASS_1, CLASS_4, TYPE_C4 } from "../stock/vehicles";
import { parseTime } from "../core/util";

export interface Scenario {
  id: string;
  number: string;      // "101"
  title: string;
  subtitle: string;
  blurb: string;
  legs: Leg[];
  create(): { world: World; duty: DutyTracker };
}

export const DUTY_101: Scenario = {
  id: "duty101",
  number: "101",
  title: "The Ashgrove–Wending Shuttle",
  subtitle: "Class 1 motor car 1002 · single line · stop boards only",
  blurb: "One car, one line, no signals. Prepare the car, keep the booked times, stop at the boards, change ends, and stable it at the end. Book D tells you how; Book R tells you why.",
  legs: [
    { from: "AG", to: "WD", dep: "06:00", arr: "06:06" },
    { from: "WD", to: "AG", dep: "06:12", arr: "06:18" },
    { from: "AG", to: "WD", dep: "06:24", arr: "06:30" },
    { from: "WD", to: "AG", dep: "06:36", arr: "06:42" },
  ],
  create() {
    const layout = shuttleLayout();
    const g = layout.graph;
    // car 1002 at Ashgrove platform: end B at the stop board (km 0.135), A end towards Wending
    const car = new Vehicle("v1002", "1002", CLASS_1, g.atKm("1", 0.135 + 0.022, 1));
    const consist = new Consist("c1", [car], [false]);
    const world = new World(layout, parseTime("05:45"), car, { kind: "ground", at: { kind: "cab", vehicle: car, end: "B" } });
    world.vehicles.push(car);
    world.consists.push(consist);
    world.say("General Manager's Office", "Duty 101. Car 1002 is stabled at Ashgrove platform, pantograph down, brakes applied. Booked away at 06:00. One Train Working applies (Rule R 24): you depart on your own authority at the booked time.", "system");
    const duty = new DutyTracker(world, DUTY_101.legs,
      ["Set the rear cab's lights to Tail", "Pantograph up in the leading cab", "Lights Head, reverser Forward", "Doors, horn, and away at 06:00"],
      (w) => {
        const v = w.trainVehicle;
        const stabled = v.panto === "down" && Object.values(v.cabs).every((c) => c && c.lights === "off") && w.train.v === 0;
        return stabled ? "Duty 101 complete. Car 1002 stabled at Ashgrove. Thank you." : null;
      });
    return { world, duty };
  },
};

export const DUTY_201: Scenario = {
  id: "duty201",
  number: "201",
  title: "The Run-Round",
  subtitle: "Class 4 locomotive 4003 + Type C4 coach 5107 · loops · signals · station masters",
  blurb: "A locomotive and one coach. At each end of the line you uncouple, run round through the loop under the station master's signals, couple at walking pace, prove the brake, and leave on the signal and the baton.",
  legs: [
    { from: "AG", to: "WD", dep: "07:00", arr: "07:07" },
    { from: "WD", to: "AG", dep: "07:30", arr: "07:37" },
  ],
  create() {
    const layout = loopLayout();
    const g = layout.graph;
    // coach 5107: A end at km 0.155 facing Down; loco 4003: A end at 0.171 facing Down (cab A leads towards Wending)
    const coach = new Vehicle("v5107", "5107", TYPE_C4, g.atKm("1", 0.155, 1));
    const loco = new Vehicle("v4003", "4003", CLASS_4, g.atKm("1", 0.171, 1));
    const consist = new Consist("c1", [loco, coach], [false, false]);
    consist.control = { vehicle: loco, cab: loco.cabs.A!, index: 0 };
    const world = new World(layout, parseTime("06:45"), coach, { kind: "ground", at: { kind: "cab", vehicle: loco, end: "A" } });
    world.vehicles.push(loco, coach);
    world.consists.push(consist);
    const L = layout.loops;
    const ag = new LoopStationMaster(world, L.AG, [{ arrive: false, depart: "07:00" }, { arrive: true, depart: null }]);
    const wd = new LoopStationMaster(world, L.WD, [{ arrive: true, depart: "07:30" }]);
    ag.peer = wd; wd.peer = ag;
    world.say("General Manager's Office", "Duty 201. Loco 4003 and coach 5107 stand coupled on Ashgrove track 1, stabled. Booked away at 07:00 under Ashgrove Box's starter AG 1 and Mr Marrow's baton. Run round at Wending and again at Ashgrove.", "system");
    world.say("Ashgrove Box", "Good morning. Prove the brake when you are ready; AG 1 will be cleared at 06:58. — Marrow, Ashgrove");
    const duty = new DutyTracker(world, DUTY_201.legs,
      ["Pantograph up, lights, prove the brake", "Depart on AG 1 and the baton", "Run round at Wending under Pell's signals", "Return and run round at Ashgrove"],
      (w) => {
        const t = w.train;
        const ok = t.vehicles.length === 2 && t.brakeProved && t.v === 0 && w.vehicles.every((v) => !v.type.pantograph || v.panto === "down");
        return ok ? "Duty 201 complete. Train coupled, brake proved and stabled at Ashgrove. Thank you." : null;
      });
    return { world, duty };
  },
};

export const SCENARIOS = [DUTY_101, DUTY_201];
