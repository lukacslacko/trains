/**
 * What each Incident Book entry means, in the voice of the Books, with the
 * rule to read. Shown to the player as a notice when the entry is written.
 */
export interface Lesson { title: string; rule: string; book: string; anchor: string; lesson: string }

const B = (book: string, anchor: string) => ({ book, anchor });

export const LESSONS: Record<string, Lesson> = {
  EARLY: { title: "Early departure", rule: "Rule R 20", ...B("R", "R20"), lesson: "A passenger train leaves at its booked time, not before. Passengers arriving on time must find the train still there. Watch the clock on the duty sheet; the dwell is generous by design." },
  "NO-BATON": { title: "Departed without the baton", rule: "Rule R 20", ...B("R", "R20"), lesson: "Where a station master is on duty, the green face of the baton is the last of the departure conditions: doors closed, booked time, starting signal, then the baton. The signal alone is not permission to go." },
  "DOORS-AWAY": { title: "Doors opened away from a platform", rule: "Rule R 14", ...B("R", "R14"), lesson: "Doors open only when the whole train stands at a platform. Away from one there is nothing but ballast on the other side of the step." },
  "DOORS-MOVING": { title: "Doors and movement", rule: "Rule R 14", ...B("R", "R14"), lesson: "Close the doors before moving, and open them only once stopped. Traction is inhibited while any door is open, but the brake is not: a rolling train with open doors is the driver's to prevent." },
  OVERSPEED: { title: "Overspeed", rule: "Rule R 10", ...B("R", "R10"), lesson: "50 km/h on the line, 25 within station limits (from the speed board or home signal to the buffer stop), 15 on shunting moves, 5 over the last 20 m of a coupling approach. Begin slowing before the board, not at it." },
  OVERRUN: { title: "Stop board overrun", rule: "Rule R 12", ...B("R", "R12"), lesson: "The front of the train stops level with the board, or within 3 m short of it. From 50 km/h a step-2 application at about 150 m brings you there; ease to Full for the last metres." },
  "STOP-SHORT": { title: "Stopped short of the board", rule: "Rule R 12", ...B("R", "R12"), lesson: "More than 3 m short leaves doors off the platform end. Release a step and draw forward at walking pace before opening the doors." },
  LIGHTS: { title: "Incorrect lights", rule: "Rule R 16", ...B("R", "R16"), lesson: "On the main line the leading end shows HEAD, the rear of the train shows TAIL, and coupled ends show nothing. Set the rear cab to Tail before you walk to the leading cab." },
  HORN: { title: "No blast before moving", rule: "Rule R 18", ...B("R", "R18"), lesson: "One short blast before moving from rest, every time. It warns anyone near the train and acknowledges the baton." },
  SPAD: { title: "Signal passed at danger", rule: "Rule S 10", ...B("S", "S10"), lesson: "A main signal at STOP or a ground signal at SHUNT STOP is never passed, whatever an instruction seems to say. Stop, and speak to the Box." },
  LOS: { title: "Limit of Shunt passed", rule: "Rule S 12", ...B("S", "S12"), lesson: "Shunting moves stop short of the Limit of Shunt board. Beyond it is the single line, which belongs to the block, not to the station." },
  "COUPLE-ROUGH": { title: "Rough coupling", rule: "Rule D 10", ...B("D", "D10"), lesson: "Make contact at 2 km/h or less: a walking pace over the last metres, then a nudge. Passengers in the coach feel every knock." },
  "COUPLE-DAMAGE": { title: "Coupling too hard", rule: "Rule D 10", ...B("D", "D10"), lesson: "Above 5 km/h the couplers and the coach body take damage. Approach at 5 km/h or less over the last 20 m and touch at 2 km/h or less." },
  "BRAKE-NOT-PROVED": { title: "Brake not proved", rule: "Rule D 14", ...B("D", "D14"), lesson: "After coupling, before departure, prove the brake from the cab: train brake to Full, then the test. It confirms the pipe reaches the far end of the train." },
  "UNCOUPLE-UNBRAKED": { title: "Uncoupled without the brake", rule: "Rule D 12", ...B("D", "D12"), lesson: "Before parting a coupling the train brake is fully applied. When the pipe parts, both halves brake automatically, but only if they were charged and held first." },
  BUFFER: { title: "Buffer stop struck", rule: "Rule D 16", ...B("D", "D16"), lesson: "The buffer stop is the end of the railway. Approach a headshunt at walking pace and stop with metres to spare." },
  ROLLBACK: { title: "Rolled back", rule: "Rule D 20", ...B("D", "D20"), lesson: "On a rise, hold the train with the train brake, apply power, and release the brake only as the traction takes up. Released first, a train on 12‰ starts to roll before the motors have anything to say." },
  RUNAWAY: { title: "Ran away", rule: "Rule D 22", ...B("D", "D22"), lesson: "A vehicle moved with no direction set. On a gradient the automatic brake alone is not a way of leaving a vehicle: apply the parking brake before you leave the cab, and never release the train brake with the reverser in Neutral." },
  "PARKING-DRAG": { title: "Parking brake dragging", rule: "Rule D 22", ...B("D", "D22"), lesson: "The parking brake was still applied when the train moved. Release it before moving, as the first item after entering the cab; a dragged brake heats blocks and wheels and costs you tractive effort you will want on the climb." },
  WHISTLE: { title: "Crossing passed without a blast", rule: "Rule R 18", ...B("R", "R18"), lesson: "A whistle board stands before every crossing: sound one long blast there, holding the horn for a second and a half or more, so that anyone at the crossing hears you before they see you. A short blast is not enough. The board is the reminder; the crossing is the reason." },
  "POWER-IN-SECTION": { title: "Power through the neutral section", rule: "Rule D 24", ...B("D", "D24"), lesson: "Shut off power at the section board and coast; take power again only after the resume board. Drawing current across the gap in the overhead line arcs at the pantograph and trips the substation." },
  COLLISION: { title: "Collision", rule: "Rule S 10", ...B("S", "S10"), lesson: "Two movements met. Every safeguard before this one exists so that it never happens: the block, the signals, the speeds, the switch indicators. Stop, protect the line, report to the Box." },
  TRAILED: { title: "Ran through switch", rule: "Rule S 22", ...B("S", "S22"), lesson: "The switch was set against your move. Its indicator at the toe shows which way it lies, from every side: read it before you set back through any switch, and if it shows against you, stop and speak to the Box. Running through points damages them and can derail the tail of the move." },
};

export function lessonFor(code: string): Lesson | null {
  return LESSONS[code] ?? null;
}
