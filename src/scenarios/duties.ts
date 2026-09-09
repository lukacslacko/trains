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

export const DUTY_401: Scenario = {
  id: "duty401",
  number: "401",
  title: "The Junction",
  subtitle: "Two Class 1 cars in multiple · the Fernhollow branch · split at Wending, join at Wending",
  blurb: "You bring 1002 and 1003 up from Ashgrove as one train. At Wending you uncouple: you carry on to Coldwater while your colleague takes 1003 up the branch to Fernhollow. Coming back, you stand at platform 2 while 1003 is called on behind you, couples up, and you take the pair home. Meanwhile another pair does the same the other way round.",
  legs: [
    { from: "AG", to: "WD", dep: "10:00", arr: "10:07" },
    { from: "WD", to: "CW", dep: "10:14", arr: "10:23" },
    { from: "CW", to: "WD", dep: "10:40", arr: "10:49" },
    { from: "WD", to: "AG", dep: "11:00", arr: "11:09" },
  ],
  create() {
    const layout = valleyLayout();
    const g = layout.graph;
    // the player's pair on Ashgrove track 1: 1003 at the Up end, 1002 at the Down end, both A ends facing Down
    const car = new Vehicle("v1002", "1002", CLASS_1, g.atKm("1", 0.179, 1));
    const mate = new Vehicle("v1003", "1003", CLASS_1, g.atKm("1", 0.157, 1));
    car.parkingBrake = true;
    const pair = new Consist("c1", [car, mate], [false, false]);
    pair.control = { vehicle: car, cab: car.cabs.A!, index: 0 };
    // the colleagues' cars: 1004 at Coldwater, 1001 at Fernhollow, A ends facing Up
    const c1004 = new Vehicle("v1004", "1004", CLASS_1, g.atKm("1", 6.243, -1));
    const c1001 = new Vehicle("v1001", "1001", CLASS_1, g.atKm("b1", 2.233, -1));
    c1004.parkingBrake = true; c1001.parkingBrake = true;
    const world = new World(layout, parseTime("09:45"), car, { kind: "ground", at: { kind: "cab", vehicle: car, end: "A" } });
    world.vehicles.push(car, mate, c1004, c1001);
    world.consists.push(pair, new Consist("c2", [c1004], [false]), new Consist("c3", [c1001], [false]));
    const ag = new Box(world, layout, "AG"), wd = new Box(world, layout, "WD"), cw = new Box(world, layout, "CW"), fh = new Box(world, layout, "FH");
    Box.link(ag, wd); Box.link(wd, cw); Box.link(wd, fh, true);
    // trains 7 and 31: the player's pair, split at Wending
    ag.plan({ train: "1002", arrive: false, track: "1", depart: "10:00", to: "N" });
    wd.plan({ train: "1002", arrive: true, from: "S", track: "1", depart: "10:14", to: "N" });
    wd.plan({ train: "1003", arrive: false, splitFrom: "1002", track: "1", depart: "10:16", to: "B" });
    cw.plan({ train: "1002", arrive: true, from: "S", track: "1", depart: "10:40", to: "S" });
    fh.plan({ train: "1003", arrive: true, from: "S", track: "1", depart: "10:44", to: "S" });
    // trains 8 and 32: the colleagues' cars, joined at Wending
    cw.plan({ train: "1004", arrive: false, track: "1", depart: "10:00", to: "S" });
    fh.plan({ train: "1001", arrive: false, track: "1", depart: "10:02", to: "S" });
    wd.plan({ train: "1004", arrive: true, from: "N", track: "2", depart: "10:18", to: "S" });
    wd.plan({ train: "1001", arrive: true, from: "B", track: "2", joinTo: "1004", depart: null });
    ag.plan({ train: "1004", arrive: true, from: "N", track: "1", depart: "10:40", to: "N" });
    // trains 9 and 33: the colleagues' pair back up the valley, split at Wending; 1001 stands at the Down end now, so it leaves first
    wd.plan({ train: "1004", arrive: true, from: "S", track: "1", depart: "10:56", to: "N" });
    wd.plan({ train: "1001", arrive: false, splitFrom: "1004", track: "1", depart: "10:54", to: "B" });
    cw.plan({ train: "1004", arrive: true, from: "S", track: "1", depart: null });
    fh.plan({ train: "1001", arrive: true, from: "S", track: "1", depart: null });
    // trains 10 and 34: the player's pair joined at Wending and home
    wd.plan({ train: "1002", arrive: true, from: "N", track: "2", depart: "11:00", to: "S" });
    wd.plan({ train: "1003", arrive: true, from: "B", track: "2", joinTo: "1002", depart: null });
    ag.plan({ train: "1002", arrive: true, from: "N", track: "1", depart: null });
    new NpcDriver(world, mate, [{ from: "WD", to: "FH", dep: "10:16", arr: "10:24" }, { from: "FH", to: "WD", dep: "10:44", arr: "10:53" }], { joinAt: ["WD"], name: "Farrow" });
    new NpcDriver(world, c1004, [{ from: "CW", to: "WD", dep: "10:00", arr: "10:08" }, { from: "WD", to: "AG", dep: "10:18", arr: "10:27" }, { from: "AG", to: "WD", dep: "10:40", arr: "10:47" }, { from: "WD", to: "CW", dep: "10:56", arr: "11:05" }], { splitAfterLeg: [2], name: "Hale" });
    new NpcDriver(world, c1001, [{ from: "FH", to: "WD", dep: "10:02", arr: "10:11" }, { from: "WD", to: "FH", dep: "10:54", arr: "11:02" }], { joinAt: ["WD"], name: "Penrose" });
    world.say("General Manager's Office", "Duty 401. Cars 1002 and 1003 stand coupled on Ashgrove track 1 as train 7, you in 1002 at the Down end, Ms Farrow riding in 1003. Booked away at 10:00. At Wending uncouple 1003: you continue to Coldwater at 10:14 as train 7, Farrow follows to Fernhollow at 10:16 as train 31. Return from Coldwater at 10:40 to Wending platform 2; 1003 will be called on behind you at 10:53; prove the brake and take the pair home at 11:00. Ms Hale and Mr Penrose work the other pair: 1004 and 1001 join at Wending at 10:11 and split there again at 10:47, 1001 leaving first for Fernhollow at 10:54 and 1004 for Coldwater at 10:56.", "system");
    world.say("Ashgrove Box", "Good morning. AG 1 will be cleared at 09:58 once Wending gives line clear for section A. — Marrow, Ashgrove");
    const duty = new DutyTracker(world, DUTY_401.legs,
      ["Prepare 1002; away from Ashgrove at 10:00 as train 7", "At Wending: secure, uncouple 1003, back to the cab; WD 7 lies straight for Coldwater", "Up the valley to Coldwater; change ends; back to Wending platform 2", "Wait for 1003 to be called on and couple behind you; prove the brake", "Home to Ashgrove with the pair; stable with the parking brake on"],
      (w) => {
        const v = w.trainVehicle;
        const stabled = w.train.vehicles.length === 2 && v.panto === "down" && v.parkingBrake && Object.values(v.cabs).every((c) => c && c.lights === "off") && w.train.v === 0;
        return stabled ? "Duty 401 complete. Cars 1002 and 1003 stabled at Ashgrove as a pair. Thank you, and thank your colleagues." : null;
      });
    return { world, duty };
  },
};

export const SCENARIOS = [DUTY_101, DUTY_201, DUTY_301, DUTY_401];
