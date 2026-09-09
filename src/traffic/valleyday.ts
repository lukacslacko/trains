/**
 * A weekday on the valley: the working timetable, the stock, and the crew diagrams.
 * Two cars work the main line, crossing at Wending at twelve minutes past every hour;
 * one car works the branch; the fourth is spare. Everything starts in Ashgrove Shed and ends there.
 */
import { type Timetable, type Service, type Diagram } from "./timetable";
import { parseTime } from "../core/util";

const hm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export function valleyDay(): Timetable {
  const services: Service[] = [];
  // the sheds and the positioning
  services.push({ number: "E1", kind: "shunt", vehicle: "1003", calls: [{ at: "AG", track: "sh2", dep: "05:15" }, { at: "AG", track: "1", arr: "05:19" }] });
  services.push({ number: "E3", kind: "empty", vehicle: "1003", calls: [{ at: "AG", track: "1", dep: "05:25" }, { at: "WD", track: "1", arr: "05:32", dep: "05:34" }, { at: "CW", track: "1", arr: "05:43" }] });
  services.push({ number: "E5", kind: "shunt", vehicle: "1002", calls: [{ at: "AG", track: "sh1", dep: "05:35" }, { at: "AG", track: "1", arr: "05:39" }] });
  // the main line: Down trains at the hour from Ashgrove, Up trains at the hour from Coldwater, crossing at Wending at :12
  for (let h = 6; h <= 16; h++) {
    const down = h % 2 === 0 ? "1002" : "1003";
    services.push({ number: String(1 + 2 * (h - 6)), kind: "passenger", vehicle: down, calls: [{ at: "AG", track: "1", dep: hm(h, 0) }, { at: "WD", track: "1", arr: hm(h, 7), dep: hm(h, 12) }, { at: "CW", track: "1", arr: hm(h, 21) }] });
  }
  for (let h = 6; h <= 17; h++) {
    const up = h % 2 === 0 ? "1003" : "1002";
    const last = h === 17;
    services.push({ number: String(2 + 2 * (h - 6)), kind: "passenger", vehicle: up, calls: [{ at: "CW", track: "1", dep: hm(h, 0) }, { at: "WD", track: "2", arr: hm(h, 8), dep: last ? hm(h, 20) : hm(h, 12) }, { at: "AG", track: "1", arr: last ? hm(h, 29) : hm(h, 21) }] });
  }
  // the branch: 1001 leaves Ashgrove coupled to train 1 and divides at Wending; then a half-hourly shuttle that keeps clear of the crossing
  services.push({ number: "31", kind: "passenger", vehicle: "1001", coupledTo: { service: "1", until: "WD" }, calls: [{ at: "AG", track: "1", dep: "06:00" }, { at: "WD", track: "1", arr: "06:07", dep: "06:16" }, { at: "FH", track: "b1", arr: "06:24" }] });
  let n = 32;
  for (let h = 6; h <= 16; h++) {
    services.push({ number: String(n++), kind: "passenger", vehicle: "1001", calls: [{ at: "FH", track: "b1", dep: hm(h, 34) }, { at: "WD", track: "1", arr: hm(h, 43) }] });
    services.push({ number: String(n++), kind: "passenger", vehicle: "1001", calls: [{ at: "WD", track: "1", dep: hm(h, 46) }, { at: "FH", track: "b1", arr: hm(h, 54) }] });
    if (h < 16) {
      services.push({ number: String(n++), kind: "passenger", vehicle: "1001", calls: [{ at: "FH", track: "b1", dep: hm(h + 1, 4) }, { at: "WD", track: "1", arr: hm(h + 1, 13) }] });
      services.push({ number: String(n++), kind: "passenger", vehicle: "1001", calls: [{ at: "WD", track: "1", dep: hm(h + 1, 16) }, { at: "FH", track: "b1", arr: hm(h + 1, 24) }] });
    }
  }
  // the last branch train is called on behind 1002 at Wending and goes home with it
  services.push({ number: String(n++), kind: "passenger", vehicle: "1001", joins: "24", calls: [{ at: "FH", track: "b1", dep: "17:04" }, { at: "WD", track: "2", arr: "17:13" }] });
  // to the shed at night
  services.push({ number: "E8", kind: "shunt", vehicle: "1003", calls: [{ at: "AG", track: "1", dep: "16:35" }, { at: "AG", track: "sh2", arr: "16:39" }] });
  services.push({ number: "E10", kind: "shunt", vehicle: "1002", calls: [{ at: "AG", track: "1", dep: "17:40" }, { at: "AG", track: "sh1", arr: "17:44" }] });

  // a driver's turns in the order of the day
  const t0 = (s: Service) => parseTime(s.calls[0].dep ?? s.calls[0].arr ?? "00:00");
  const by = (vehicle: string) => services.filter((s) => s.vehicle === vehicle).sort((a, b) => t0(a) - t0(b)).map((s) => s.number);
  const diagrams: Diagram[] = [
    { driver: "Hale", vehicle: "1003", signOn: "05:05", signOff: "16:50", turns: by("1003"), note: "Book on at the shed. Empty to Coldwater for the first Up train; home on the last; into road 2." },
    { driver: "Farrow", vehicle: "1002", signOn: "05:25", signOff: "17:55", turns: by("1002"), note: "The pair out of road 1 at 05:35; train 1 divides at Wending. Home with 1001 behind you on train 24; the pair into road 1." },
    { driver: "Penrose", vehicle: "1001", signOn: "05:25", signOff: "17:55", turns: by("1001"), note: "Ride in the pair to Wending, uncouple 1001 there and take the branch. Called on behind 1002 at Wending in the evening; ride home." },
    { driver: "Corry", vehicle: "1004", signOn: "05:25", signOff: "17:55", turns: [], note: "Spare at Ashgrove Shed with 1004." },
  ];
  return {
    name: "The valley weekday working",
    start: "05:00",
    stabling: [
      { station: "AG", track: "sh1", vehicles: ["1001", "1002"], coupled: true },
      { station: "AG", track: "sh2", vehicles: ["1004", "1003"], coupled: false },
    ],
    services,
    diagrams,
  };
}
