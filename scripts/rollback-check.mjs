// Sanity check: a released car on the 12‰ grade rolls, and the Incident Book notices.
import { createServer } from "vite";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { DUTY_101 } = await server.ssrLoadModule("/src/scenarios/duties.ts");
  const { kmOf } = await server.ssrLoadModule("/src/track/graph.ts");
  const { world: w } = DUTY_101.create();
  const car = w.trainVehicle;
  car.pos = w.layout.graph.atKm("main", 1.5, 1); // mid-grade, A end facing Down
  w.driver = { kind: "ground", at: { kind: "cab", vehicle: car, end: "A" } };
  w.enterCab(); w.setParkingBrake(false); w.setBrake(0);
  for (let i = 0; i < 600; i++) w.step(0.05); // 30 s with reverser N, brake released
  const v = w.train.v, km = kmOf(car.pos);
  console.log(JSON.stringify({ speedKmh: (Math.abs(v) * 3.6).toFixed(1), direction: v < 0 ? "Up (downhill)" : v > 0 ? "Down" : "still", km: km.toFixed(3), gravityN: w.gravityOn(w.train).toFixed(0), incidents: w.incidents.map((i) => i.code) }));
} finally { await server.close(); }
