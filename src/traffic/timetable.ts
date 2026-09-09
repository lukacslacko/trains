/**
 * The working timetable as data: services with their calls, how they couple and divide,
 * and the crew diagrams. Everything the boxes plan, the colleagues drive and the player's
 * duty sheet shows is derived from this (see planner.ts).
 */

/** A call at a place: a platform track or a shed road of a station. */
export interface Call { at: string; track: string; arr?: string; dep?: string }

export type ServiceKind = "passenger" | "empty" | "shunt";

export interface Service {
  /** the train number: main-line Down trains odd, Up even; branch trains from 31; empties E-numbers */
  number: string;
  kind: ServiceKind;
  /** the vehicle that works it (the leading car of its portion) */
  vehicle: string;
  calls: Call[];
  /** this service runs coupled in another service's train, that driver driving, from its first call until the train divides at `until` */
  coupledTo?: { service: string; until: string };
  /** on arrival at its last call this service is called on and couples onto the train of `joins` standing there, and travels on with it */
  joins?: string;
}

/** A driver's day: the vehicle they book on to, and their turns in order. Between turns they ride or wait. */
export interface Diagram {
  driver: string;
  vehicle: string;
  signOn: string;
  signOff: string;
  turns: string[];
  note?: string;
}

/** Where the stock stands at the start of the day: a road, its vehicles from the buffer stop outwards, coupled or not. */
export interface Stabling { station: string; track: string; vehicles: string[]; coupled: boolean }

export interface Timetable {
  name: string;
  /** the clock at the start of the simulated day */
  start: string;
  stabling: Stabling[];
  services: Service[];
  diagrams: Diagram[];
}

export function serviceOf(tt: Timetable, number: string): Service {
  const s = tt.services.find((x) => x.number === number);
  if (!s) throw new Error(`no service ${number}`);
  return s;
}
