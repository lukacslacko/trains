/**
 * A whole day on the valley from the working timetable: the stock in the shed, every box
 * working, every colleague driving, and the player in any one of the chairs.
 */
import { World } from "../sim/world";
import { DutyTracker, Box, BoxDuty } from "../sim/duty";
import { NpcDriver } from "../sim/npc";
import { valleyLayout } from "../track/layouts";
import { Vehicle, Consist, CLASS_1 } from "../stock/vehicles";
import { parseTime } from "../core/util";
import { type Timetable } from "./timetable";
import { planBoxes, driverProgram } from "./planner";

export type DayRole = { kind: "driver"; driver: string } | { kind: "box"; code: string };

export function buildDay(tt: Timetable, role: DayRole, blurb: string): { world: World; duty: DutyTracker | BoxDuty } {
  const layout = valleyLayout();
  const g = layout.graph;
  // the stock in the sheds: from the buffer stop outwards, A ends facing out
  const vehicles: Vehicle[] = [];
  const consists: Consist[] = [];
  for (const s of tt.stabling) {
    const shed = layout.sheds.find((x) => x.station === s.station)!;
    const road = shed.roads.find((r) => r.track === s.track)!;
    const endKm = road.edge.kmA + road.edge.length / 1000;
    let bEnd = endKm - 0.003;
    const cars: Vehicle[] = [];
    for (const num of s.vehicles) {
      const aKm = bEnd - CLASS_1.length / 1000;
      const v = new Vehicle(`v${num}`, num, CLASS_1, g.atKm(road.track, aKm, -1));
      v.parkingBrake = true;
      vehicles.push(v); cars.unshift(v);
      bEnd = aKm - 0.002;
    }
    if (s.coupled) { const c = new Consist(`c-${s.track}`, cars, cars.map(() => false)); c.shunting = true; consists.push(c); }
    else for (const v of cars) { const c = new Consist(`c-${v.number}`, [v], [false]); c.shunting = true; consists.push(c); }
  }
  const byNumber = (n: string) => vehicles.find((v) => v.number === n)!;
  const playerDiagram = role.kind === "driver" ? tt.diagrams.find((d) => d.driver === role.driver) : undefined;
  if (role.kind === "driver" && !playerDiagram) throw new Error(`no diagram for ${role.driver}`);
  const playerVehicle = playerDiagram ? byNumber(playerDiagram.vehicle) : byNumber(tt.diagrams[0].vehicle);
  const start: World["driver"] = role.kind === "box" ? { kind: "box", code: role.code } : { kind: "ground", at: { kind: "cab", vehicle: playerVehicle, end: "A" } };
  const world = new World(layout, parseTime(tt.start), playerVehicle, start);
  world.vehicles.push(...vehicles);
  world.consists.push(...consists);
  const boxes: Record<string, Box> = {};
  for (const code of ["AG", "WD", "CW", "FH"]) boxes[code] = new Box(world, layout, code);
  Box.link(boxes.AG, boxes.WD); Box.link(boxes.WD, boxes.CW); Box.link(boxes.WD, boxes.FH, true);
  if (role.kind === "box") boxes[role.code].mode = "player";
  planBoxes(world, tt, boxes);
  // the colleagues
  for (const d of tt.diagrams) {
    if (d === playerDiagram || d.turns.length === 0) continue;
    const { legs, opts } = driverProgram(tt, d);
    new NpcDriver(world, byNumber(d.vehicle), legs, opts);
  }
  world.say("General Manager's Office", blurb, "system");
  const stabled = (v: Vehicle) => v.parkingBrake && v.panto === "down" && Object.values(v.cabs).every((c) => !c || c.lights === "off");
  const allDone = (w: World) => {
    if (!w.boxes.every((b) => b.register.every((m) => m.state === "done"))) return false;
    if (!w.consists.every((c) => c.v === 0)) return false;
    return (w.npcDrivers as NpcDriver[]).every((x) => x.state === "done" || x.state === "riding");
  };
  if (role.kind === "box") {
    const box = boxes[role.code];
    const duty = new BoxDuty(world, box, [
      "Answer the boxes that ask for line clear; ask them for the sections ahead",
      "Set the homes before the trains reach them; shunts under the ground signals",
      "Cancel each warrant on arrival complete; show the baton at the booked time",
      "The day ends when every train is home and the register is done",
    ], (w) => (allDone(w) ? `The day is done. ${box.name} Box handed back. Thank you.` : null));
    return { world, duty };
  }
  const { legs } = driverProgram(tt, playerDiagram!);
  const duty = new DutyTracker(world, legs, [
    `Book on at ${playerDiagram!.signOn} at Ashgrove Shed, cab A of ${playerDiagram!.vehicle}`,
    playerDiagram!.note ?? "",
    "Prepare the car: pantograph up, lights, brake, parking brake off",
    "Shunts move on the ground signals; trains on the starter and the baton",
    "Stable in the shed at the end: parking brake, pantograph down, lights out",
  ].filter(Boolean), (w) => {
    const v = w.trainVehicle;
    const onRoad = w.layout.sheds.some((sh) => sh.roads.some((r) => w.edgesOf(v).every((e) => e === r.edge)));
    return onRoad && stabled(v) && w.train.v === 0 && w.time > parseTime(playerDiagram!.signOff) - 1800
      ? `Duty done: ${playerDiagram!.vehicle} stabled and ${playerDiagram!.driver}'s turn signed off. Thank you.` : null;
  });
  return { world, duty };
}
