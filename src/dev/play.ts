import { DUTY_101, DUTY_201 } from "../scenarios/duties";
import { Autopilot } from "./autopilot";
import { parseTime } from "../core/util";

export function play101() {
  const { world: w } = DUTY_101.create();
  const a = new Autopilot(w);
  const car = w.trainVehicle;
  w.enterCab(); w.setLights("tail"); w.leaveCab();
  a.toCab(car, "A");
  w.togglePanto(); a.until(() => car.panto === "up"); w.setLights("head"); w.setReverser("F");
  const legs: [string, number, 1 | -1, "A" | "B" | null][] = [["06:00", 3.165, 1, "B"], ["06:12", 0.135, -1, "A"], ["06:24", 3.165, 1, "B"], ["06:36", 0.135, -1, null]];
  for (const [dep, target, dir, next] of legs) {
    a.waitUntilTime(parseTime(dep)); a.depart(car);
    const r = a.drive(w.train, target, dir);
    a.say(`leg ${dep}: run ${r.t}s, stopped ${r.short} m short`);
    w.toggleDoors(); a.step(300); w.toggleDoors(); a.step(60);
    if (next) a.changeEnds(car, next);
  }
  a.secure(); w.setLights("off"); w.togglePanto(); a.until(() => car.panto === "down");
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
    const hs = isWD ? 3.29 : 0.012, stub = isWD ? 2.905 : 0.395, coupleAt = isWD ? 3.129 : 0.171;
    const dirHs: 1 | -1 = isWD ? 1 : -1;
    a.secure(); w.leaveCab(); a.walkTo("Coupling"); w.uncouple(); a.step(20);
    a.say(`${code}: uncoupled, consists ${w.consists.length}, driver beside ${w.driver.kind === "ground" && w.driver.at.kind === "cab" ? `${w.driver.at.vehicle.number} ${w.driver.at.end}` : "?"}`);
    a.toCab(loco, isWD ? "A" : "B");
    const t1hs = w.signal(isWD ? "WD 3" : "AG 4");
    if (!a.until(() => t1hs.aspect === "shunt", 60)) a.say(`${code}: ${t1hs.id} NOT cleared`);
    a.depart(loco);
    let r = a.drive(lc(), hs, dirHs); a.say(`${code}: to headshunt ${JSON.stringify(r)}`);
    const hsIn = w.signal(isWD ? "WD 6" : "AG 5");
    if (!a.until(() => hsIn.aspect === "shunt", 60)) a.say(`${code}: ${hsIn.id} NOT cleared`);
    a.changeEnds(loco, isWD ? "B" : "A"); a.depart(loco);
    r = a.drive(lc(), stub, (-dirHs) as 1 | -1); a.say(`${code}: to stub ${JSON.stringify(r)}`);
    const stubIn = w.signal(isWD ? "WD 5" : "AG 6");
    if (!a.until(() => stubIn.aspect === "shunt", 60)) a.say(`${code}: ${stubIn.id} NOT cleared`);
    a.changeEnds(loco, isWD ? "A" : "B"); a.depart(loco);
    r = a.drive(lc(), coupleAt, dirHs, { couple: true }); a.say(`${code}: couple ${JSON.stringify(r)}, train length ${w.train.vehicles.length}`);
    a.secure(); w.leaveCab(); a.walkTo("Coupling"); w.connectPipe(); a.toCab(loco, isWD ? "B" : "A"); a.prove(loco);
    a.say(`${code}: proved ${w.train.brakeProved}, pipes ${w.train.allPipesConnected()}, driver in cab ${w.driver.kind === "cab" ? w.driver.end : "?"}`);
  };
  w.enterCab(); w.togglePanto(); a.until(() => loco.panto === "up"); w.setLights("head"); w.setReverser("F"); a.prove(loco);
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
  a.secure(); w.setLights("off"); w.togglePanto(); a.until(() => loco.panto === "down"); a.step(40);
  return a.report();
}
