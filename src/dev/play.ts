import { DUTY_101, DUTY_201, DUTY_301 } from "../scenarios/duties";
import { Autopilot } from "./autopilot";
import { parseTime } from "../core/util";

export function play101() {
  const { world: w } = DUTY_101.create();
  const a = new Autopilot(w);
  const car = w.trainVehicle;
  w.enterCab(); w.setLights("tail"); w.leaveCab();
  a.toCab(car, "A");
  w.togglePanto(); a.until(() => car.panto === "up"); w.setLights("head"); w.setReverser("F"); w.setParkingBrake(false);
  const legs: [string, number, 1 | -1, "A" | "B" | null][] = [["06:00", 3.165, 1, "B"], ["06:12", 0.135, -1, "A"], ["06:24", 3.165, 1, "B"], ["06:36", 0.135, -1, null]];
  for (const [dep, target, dir, next] of legs) {
    a.waitUntilTime(parseTime(dep)); a.depart(car);
    const r = a.drive(w.train, target, dir);
    a.say(`leg ${dep}: run ${r.t}s, stopped ${r.short} m short`);
    w.toggleDoors(); a.step(300); w.toggleDoors(); a.step(60);
    if (next) a.changeEnds(car, next);
  }
  a.secure(); w.setLights("off"); w.togglePanto(); a.until(() => car.panto === "down"); w.setParkingBrake(true);
  w.leaveCab(); a.walkTo("Cab"); w.enterCab(); w.setLights("off"); a.step(40);
  return a.report();
}

export function play201() {
  const { world: w } = DUTY_201.create();
  const a = new Autopilot(w);
  const loco = w.vehicles.find((v) => v.number === "4003")!;
  const lc = () => w.consistOf(loco);
  const runRound = (code: "AG" | "WD") => {
    const isWD = code === "WD";
    const hs = isWD ? 3.27 : 0.012, stub = isWD ? 2.905 : 0.395, coupleAt = isWD ? 3.129 : 0.171;
    const dirHs: 1 | -1 = isWD ? 1 : -1;
    a.secure(); w.leaveCab(); a.walkTo("Coupling"); w.uncouple(); a.step(20);
    a.say(`${code}: uncoupled, consists ${w.consists.length}, driver beside ${w.driver.kind === "ground" && w.driver.at.kind === "cab" ? `${w.driver.at.vehicle.number} ${w.driver.at.end}` : "?"}`);
    a.toCab(loco, isWD ? "A" : "B");
    const t1hs = w.signal(isWD ? "WD 7" : "AG 4");
    if (!a.until(() => t1hs.aspect === "shunt", 60)) a.say(`${code}: ${t1hs.id} NOT cleared`);
    a.depart(loco);
    let r = a.drive(lc(), hs, dirHs); a.say(`${code}: to headshunt ${JSON.stringify(r)}`);
    const hsIn = w.signal(isWD ? "WD 6" : "AG 5");
    if (!a.until(() => hsIn.aspect === "shunt", 60)) a.say(`${code}: ${hsIn.id} NOT cleared`);
    a.changeEnds(loco, isWD ? "B" : "A"); a.depart(loco);
    r = a.drive(lc(), stub, (-dirHs) as 1 | -1); a.say(`${code}: to stub ${JSON.stringify(r)}`);
    const stubIn = w.signal(isWD ? "WD 5" : "AG 6");
    void stubIn;
    if (!a.until(() => stubIn.aspect === "shunt", 60)) a.say(`${code}: ${stubIn.id} NOT cleared`);
    a.changeEnds(loco, isWD ? "A" : "B"); a.depart(loco);
    r = a.drive(lc(), coupleAt, dirHs, { couple: true }); a.say(`${code}: couple ${JSON.stringify(r)}, train length ${w.train.vehicles.length}`);
    a.secure(); w.leaveCab(); a.walkTo("Coupling"); w.connectPipe(); a.toCab(loco, isWD ? "B" : "A"); a.prove(loco);
    a.say(`${code}: proved ${w.train.brakeProved}, pipes ${w.train.allPipesConnected()}, driver in cab ${w.driver.kind === "cab" ? w.driver.end : "?"}`);
  };
  w.enterCab(); w.togglePanto(); a.until(() => loco.panto === "up"); w.setLights("head"); w.setReverser("F"); w.setParkingBrake(false); a.prove(loco);
  a.say(`prep: proved ${w.train.brakeProved}`);
  a.say(`baton AG: ${a.waitBaton("AG", parseTime("07:00"))} AG1=${w.signal("AG 1").aspect} WD1=${w.signal("WD 1").aspect}`);
  a.depart(loco);
  let r = a.drive(w.train, 3.165, 1); a.say(`run to WD ${JSON.stringify(r)}`);
  w.toggleDoors(); a.step(300); w.toggleDoors(); a.step(40);
  runRound("WD");
  a.say(`baton WD: ${a.waitBaton("WD", parseTime("07:30"))} WD2=${w.signal("WD 2").aspect}`);
  a.depart(loco);
  r = a.drive(w.train, 0.135, -1); a.say(`run to AG ${JSON.stringify(r)}`);
  w.toggleDoors(); a.step(300); w.toggleDoors(); a.step(40);
  runRound("AG");
  a.secure(); w.setLights("off"); w.togglePanto(); a.until(() => loco.panto === "down"); w.setParkingBrake(true); a.step(40);
  return a.report();
}

export function play301() {
  const { world: w } = DUTY_301.create();
  const a = new Autopilot(w);
  const car = w.trainVehicle;
  w.enterCab(); w.setLights("tail"); w.leaveCab();
  a.toCab(car, "A");
  w.togglePanto(); a.until(() => car.panto === "up"); w.setLights("head"); w.setReverser("F"); w.setParkingBrake(false);
  a.say("prep done");
  const legs: [string, string, number, 1 | -1, "A" | "B" | null][] = [["AG", "08:00", 3.165, 1, null], ["WD", "08:12", 6.265, 1, "B"], ["CW", "08:40", 3.015, -1, null], ["WD", "08:53", 0.135, -1, null]];
  for (const [code, dep, target, dir, next] of legs) {
    a.say(`baton ${code}: ${a.waitBaton(code, parseTime(dep))} at ${w.time.toFixed(0)}`);
    a.depart(car);
    const r = a.drive(w.train, target, dir, { max: 1200 });
    a.say(`leg from ${code} ${dep}: run ${r.t}s, stopped ${r.short} m short`);
    w.toggleDoors(); a.step(200); w.toggleDoors(); a.step(60);
    if (next) a.changeEnds(car, next);
    const n = w.npcDrivers[0] as { state: string; index: number; powerOff: boolean; cabEnd: string };
    const nv = w.vehicles.find((x) => x.number === "1003")!; const nc = w.consistOf(nv); const ncab = nc.control?.cab;
    a.say(`npc: state=${n.state} leg=${n.index} powerOff=${n.powerOff} cab=${n.cabEnd} rev=${ncab?.reverser} notch=${ncab?.notch} brake=${ncab?.brake} pipe=${nv.pipe.toFixed(1)} park=${nv.parkingBrake} volts=${nv.lineVolts} panto=${nv.panto} doors=${nc.anyDoorsOpen()} v=${nc.v.toFixed(2)} km=${(nv.pos.edge.kmA + nv.pos.edge.kmDir * nv.pos.s / 1000).toFixed(3)}`);
  }
  a.secure(); w.setLights("off"); w.togglePanto(); a.until(() => car.panto === "down"); w.setParkingBrake(true);
  w.leaveCab(); a.walkTo("Cab"); w.enterCab(); w.setLights("off"); a.step(40);
  const npcCar = w.vehicles.find((v) => v.number === "1003")!;
  a.say(`npc 1003 at km ${(npcCar.pos.edge.kmA + npcCar.pos.edge.kmDir * npcCar.pos.s / 1000).toFixed(3)}`);
  return a.report();
}
