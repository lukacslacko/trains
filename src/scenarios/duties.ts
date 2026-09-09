import { World } from "../sim/world";
import { DutyTracker, Box, type Leg } from "../sim/duty";
import { NpcDriver } from "../sim/npc";
import { shuttleLayout, valleyLayout } from "../track/layouts";
import { Vehicle, Consist, CLASS_1, CLASS_4, TYPE_C4 } from "../stock/vehicles";
import { parseTime } from "../core/util";

export interface Scenario {
  id: string;
  number: string;
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
    const car = new Vehicle("v1002", "1002", CLASS_1, g.atKm("1", 0.135 + 0.022, 1));
    car.parkingBrake = true;
    const consist = new Consist("c1", [car], [false]);
    const world = new World(layout, parseTime("05:45"), car, { kind: "ground", at: { kind: "cab", vehicle: car, end: "B" } });
    world.vehicles.push(car);
    world.consists.push(consist);
    world.say("General Manager's Office", "Duty 101. Car 1002 is stabled at Ashgrove platform, pantograph down, parking brake on. Booked away at 06:00. One Train Working applies (Rule R 24): you depart on your own authority at the booked time. The valley climbs 12‰ from post 0.5.", "system");
    const duty = new DutyTracker(world, DUTY_101.legs,
      ["Set the rear cab's lights to Tail", "Pantograph up in the leading cab, parking brake off", "Lights Head, reverser Forward", "Doors, horn, and away at 06:00", "Stable with the parking brake on"],
      (w) => {
        const v = w.trainVehicle;
        const stabled = v.panto === "down" && v.parkingBrake && Object.values(v.cabs).every((c) => c && c.lights === "off") && w.train.v === 0;
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
  blurb: "A locomotive and one coach. At each end of the journey you uncouple, run round through the loop under the station master's signals, couple at walking pace, prove the brake, and leave on the signal and the baton.",
  legs: [
    { from: "AG", to: "WD", dep: "07:00", arr: "07:07" },
    { from: "WD", to: "AG", dep: "07:30", arr: "07:37" },
  ],
  create() {
    const layout = valleyLayout();
    const g = layout.graph;
    const coach = new Vehicle("v5107", "5107", TYPE_C4, g.atKm("1", 0.155, 1));
    const loco = new Vehicle("v4003", "4003", CLASS_4, g.atKm("1", 0.171, 1));
    loco.parkingBrake = true;
    const consist = new Consist("c1", [loco, coach], [false, false]);
    consist.control = { vehicle: loco, cab: loco.cabs.A!, index: 0 };
    const world = new World(layout, parseTime("06:45"), coach, { kind: "ground", at: { kind: "cab", vehicle: loco, end: "A" } });
    world.vehicles.push(loco, coach);
    world.consists.push(consist);
    const ag = new Box(world, layout, "AG"), wd = new Box(world, layout, "WD"), cw = new Box(world, layout, "CW");
    Box.link(ag, wd); Box.link(wd, cw);
    ag.plan({ train: "5107", loco: "4003", arrive: false, track: "1", depart: "07:00", to: "N" });
    wd.plan({ train: "5107", loco: "4003", arrive: true, from: "S", track: "1", depart: "07:30", to: "S", runRound: true });
    ag.plan({ train: "5107", loco: "4003", arrive: true, from: "N", track: "1", depart: null, runRound: true });
    world.say("General Manager's Office", "Duty 201. Loco 4003 and coach 5107 stand coupled on Ashgrove track 1, stabled. Booked away at 07:00 under Ashgrove Box's starter AG 1 and Mr Marrow's baton. Run round at Wending, using the stub towards Coldwater, and again at Ashgrove.", "system");
    world.say("Ashgrove Box", "Good morning. Prove the brake when you are ready; AG 1 will be cleared at 06:58 once Wending gives line clear. — Marrow, Ashgrove");
    const duty = new DutyTracker(world, DUTY_201.legs,
      ["Pantograph up, lights, parking brake off, prove the brake", "Depart on AG 1 and the baton", "Run round at Wending under Pell's signals", "Return and run round at Ashgrove", "Stable with the parking brake on"],
      (w) => {
        const t = w.train;
        const ok = t.vehicles.length === 2 && t.brakeProved && t.v === 0 && w.vehicles.every((v) => !v.type.pantograph || (v.panto === "down" && v.parkingBrake));
        return ok ? "Duty 201 complete. Train coupled, brake proved and stabled at Ashgrove. Thank you." : null;
      });
    return { world, duty };
  },
};

export const DUTY_301: Scenario = {
  id: "duty301",
  number: "301",
  title: "The Crossing",
  subtitle: "Class 1 motor car 1002 · Ashgrove–Wending–Coldwater · block working · a colleague coming the other way",
  blurb: "Two trains on one line. You take 1002 up the valley to Coldwater while a colleague brings 1003 down; you cross at Wending under the Line Warrants and the distant signals, coast through the neutral section, whistle for Millers' Crossing, and do it all again coming home.",
  legs: [
    { from: "AG", to: "WD", dep: "08:00", arr: "08:07" },
    { from: "WD", to: "CW", dep: "08:12", arr: "08:21" },
    { from: "CW", to: "WD", dep: "08:40", arr: "08:49" },
    { from: "WD", to: "AG", dep: "08:53", arr: "09:01" },
  ],
  create() {
    const layout = valleyLayout();
    const g = layout.graph;
    const car = new Vehicle("v1002", "1002", CLASS_1, g.atKm("1", 0.157, 1));
    car.parkingBrake = true;
    const c1 = new Consist("c1", [car], [false]);
    const other = new Vehicle("v1003", "1003", CLASS_1, g.atKm("1", 6.243, -1));
    other.parkingBrake = true;
    const c2 = new Consist("c2", [other], [false]);
    const world = new World(layout, parseTime("07:45"), car, { kind: "ground", at: { kind: "cab", vehicle: car, end: "B" } });
    world.vehicles.push(car, other);
    world.consists.push(c1, c2);
    const ag = new Box(world, layout, "AG"), wd = new Box(world, layout, "WD"), cw = new Box(world, layout, "CW");
    Box.link(ag, wd); Box.link(wd, cw);
    // the player's 1002: Down to Coldwater and back
    ag.plan({ train: "1002", arrive: false, track: "1", depart: "08:00", to: "N" });
    wd.plan({ train: "1002", arrive: true, from: "S", track: "1", depart: "08:12", to: "N" });
    cw.plan({ train: "1002", arrive: true, from: "S", track: "1", depart: "08:40", to: "S" });
    wd.plan({ train: "1002", arrive: true, from: "N", track: "2", depart: "08:53", to: "S" });
    ag.plan({ train: "1002", arrive: true, from: "N", track: "1", depart: null });
    // the colleague's 1003: Up to Ashgrove and back
    const otherLegs: Leg[] = [
      { from: "CW", to: "WD", dep: "08:00", arr: "08:08" },
      { from: "WD", to: "AG", dep: "08:12", arr: "08:21" },
      { from: "AG", to: "WD", dep: "08:40", arr: "08:49" },
      { from: "WD", to: "CW", dep: "08:53", arr: "09:01" },
    ];
    cw.plan({ train: "1003", arrive: false, track: "1", depart: "08:00", to: "S" });
    wd.plan({ train: "1003", arrive: true, from: "N", track: "2", depart: "08:12", to: "S" });
    ag.plan({ train: "1003", arrive: true, from: "N", track: "1", depart: "08:40", to: "N" });
    wd.plan({ train: "1003", arrive: true, from: "S", track: "1", depart: "08:53", to: "N" });
    cw.plan({ train: "1003", arrive: true, from: "S", track: "1", depart: null });
    new NpcDriver(world, other, otherLegs);
    world.say("General Manager's Office", "Duty 301. Car 1002 is stabled at Ashgrove; car 1003 stands at Coldwater with your colleague Ms Farrow. Both are booked away at 08:00 and cross at Wending at 08:12; you return from Coldwater at 08:40 and cross again at Wending at 08:53. The block is worked by Line Warrants: no starter clears without one. Whistle for Millers' Crossing at post 4.7 and shut off power through the neutral section at post 4.2.", "system");
    world.say("Ashgrove Box", "Good morning. AG 1 will be cleared at 07:58 once Wending gives line clear for section A. — Marrow, Ashgrove");
    const duty = new DutyTracker(world, DUTY_301.legs,
      ["Prepare 1002; away from Ashgrove at 08:00 on AG 1 and the baton", "Read WD 1D and WD 1; stop at Wending platform 1; cross 1003", "Power off at the section board, whistle at the W board, up to Coldwater", "Change ends; back down the valley, platform 2 at Wending", "Stable at Ashgrove with the parking brake on"],
      (w) => {
        const v = w.trainVehicle;
        const stabled = v.panto === "down" && v.parkingBrake && Object.values(v.cabs).every((c) => c && c.lights === "off") && w.train.v === 0;
        return stabled ? "Duty 301 complete. Car 1002 stabled at Ashgrove. Thank you, and thank your colleague." : null;
      });
    return { world, duty };
  },
};

export const SCENARIOS = [DUTY_101, DUTY_201, DUTY_301];
