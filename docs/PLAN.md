# The Meridian Railway — Development Plan

*A modular train simulator, built one booklet at a time.*

> "Everything about a railway is written down somewhere. The trick is to
> write it down so well that people want to read it."
> — inscription over the door of the Meridian Railway drawing office

---

## 1. The vision

We are building a train simulator that eventually simulates *everything*
about a railway: laying track and moving earth, wiring the signals,
maintaining the permanent way, driving the trains, marshalling the cars,
running the timetable, and finally fixing the worn-out machinery in the
workshop — if all goes well, down to the last screw.

The game is **modular**. Each of those domains is a module with a clean
boundary, so that a module can be shallow today (a stop board and a stopwatch)
and deep tomorrow (an interlocking with track circuits and route locking)
without the others noticing. The player may take up any *role* the railway
offers — driver first, later signaller, station master, track worker,
fitter — and the rest of the railway carries on around them autonomously.

The railway is a **fantasy railway**: the Meridian Railway. It is not
modelled on any real network. Its rules, signals and manuals are designed
from first principles to be the railway we would build if we could start
again with everything we know. The manuals are first-class deliverables:
they should be a pleasure to read, and worth printing as booklets.

### Design pillars

1. **Procedure is the game.** The joy is in doing things properly: raising
   the pantograph, setting the lights, waiting for the baton, easing onto a
   coach at walking pace. The rules are the level design.
2. **Everything is documented in-world.** No tutorial pop-ups. If the player
   wonders how something works, the answer is in a manual on the shelf, and
   the manual is nice enough that they enjoy finding it.
3. **One world, many roles.** Driver, signaller, station master, ganger,
   fitter: all are views of the same simulation. Anything the player does not
   do is done by an NPC colleague who follows the same rulebook.
4. **Depth on demand.** A module may start as a stub with the right
   *interface* (a coach has "brakes: applied/released") and gain depth later
   (brake cylinders, block wear, a rigging adjustment in the workshop).
5. **Plain, readable code.** TypeScript, small files, data-driven scenarios,
   no engine lock-in. Rendering is a schematic top-down 2D view; a 3D view is
   a possible later module, never a prerequisite.

---

## 2. The Meridian Railway (fiction bible summary)

See `docs/WORLD.md` for the authoritative bible. In brief:

- **Company:** The Meridian Railway. Motto: *On the line, on time.*
  Mark: a circle bisected by a vertical meridian line.
- **Colours:** Meridian Green, Ivory, Signal Red, Brass, Ink.
- **First line:** Ashgrove (AG) to Wending (WD), 3.2 km, single track,
  electrified overhead at 1.5 kV DC.
- **Direction words:** *Down* = increasing kilometrage (Ashgrove → Wending),
  *Up* = decreasing. Signals facing Down trains carry odd numbers,
  Up-facing signals carry even numbers.
- **Books:** the company's manuals are lettered.
  *Book I* Identity, *Book R* Rules of Operation, *Book S* Signalling,
  *Book D* Driving (rolling stock handbooks), later *Book P* Permanent Way,
  *Book W* Workshop, *Book T* Timetabling.

---

## 3. Module map

```
core/         clock, events, units                  ── always present
track/        graph of nodes/edges, switches,       ── M0
              positions, trackside objects
stock/        vehicles, consists, couplings,        ── M0
              traction, brakes, lights, pantographs
signalling/   signals, aspects, routes, boards,     ── M1
              interlocking, block working
people/       the player's person and NPC staff     ── M0 (driver), M1 (station master)
              (walking, locations, hand signals)
sim/          world step, rules engine, infractions  ── M0
scenarios/    data-driven duties with objectives    ── M0
ui/           canvas view, line diagram, cab panel, ── M0
              messages, duty sheet, library
manuals/      the printed books (HTML, print CSS)   ── M0
traffic/      timetable, autonomous trains          ── M3
pway/         wear, inspection, maintenance, earthworks ── M4/M6
workshop/     repair of rolling stock               ── M5
```

Every module exposes plain data plus a `step(dt)` where relevant; the world
object owns them and the UI reads from them. Scenarios are data plus a small
script (the station master's plan).

---

## 4. Roadmap

Milestones are small on purpose. Each ends with something playable and a
manual that describes exactly what is playable.

### M0 — "The Shuttle" (this iteration)
- Two-station single-track line, stop boards only.
- Class 1 bidirectional electric railcar. Controls: reverser, power
  controller, train brake, pantograph, lights, doors, horn; change ends by
  walking through the car.
- Timetable card, dwell, doors, stopping accuracy at boards.
- Rules engine with infractions (early departure, doors open while moving,
  wrong lights, overspeed, rough stop).
- **Books:** Identity (I), Rules (R), Signalling (S), Driving (D).
- Manuals rendered in an in-game Library with a print stylesheet.

### M1 — "The Run-Round" (this iteration)
- Passing loop at each station (two switches, headshunt, limit-of-shunt).
- Main signals (Home, Starter), ground signals, station master NPC who sets
  routes and gives the baton.
- Class 4 electric locomotive + one coach. Uncouple, run round via the loop,
  couple at walking pace, brake continuity check, depart on signal + baton.
- Rules: signal passed at danger, shunting speed, coupling speed, brake test.

### M1.5 — Gradients (done 2026-09-09)
- Gradient profile on the line (level, 12‰, 6‰, level), gravity in the
  physics, gradient posts at every change of grade, parking brake, rules
  D 20 (starting on a rise) and D 22 (parking brake), warning distances by
  approach grade, profile ribbon in the line diagram, Book P first edition.

### M2a + M2b — Coldwater and the block (done 2026-09-09)
- The line extended to Coldwater; Wending a through station with two
  platform tracks; two block sections worked by Line Warrants; distant
  signals; subsidiary shunt aspects; a neutral section with section and
  resume boards; a whistle board and Millers' Crossing; a colleague driving
  the other train; Duty 301, the crossing. Book T first edition.

### M2c — The junction and the split trains (done 2026-09-09)
- The Fernhollow branch leaves Wending at junction switch WD J with its own
  kilometrage (F posts), a 40 km/h line speed, a 10‰ climb and a simple
  terminus. Section C and Fernhollow Box.
- Multiple working of Class 1 cars; splitting and joining at Wending under
  the boxes: call-on subsidiaries on the northern homes, route locking at
  the junction, portions leaving in the order they stand. Colleagues
  split, join, ride and drive. Duty 401, the junction, with two split
  pairs passing at Wending twice.
- Books S, R, D, I, P, T reissued.

### M2d — The signaller's chair (done 2026-09-09)
- A box has two modes: the station master (NPC) or the player. In player
  mode the decisions become actions on a panel (give line clear, ask for
  it, pull a lever, replace a signal, show the baton, cancel a warrant)
  while the observations (arrived complete, gone) keep running; peer boxes
  and NPC drivers carry on unchanged.
- The panel: the block (one card per section: requests, warrants out,
  trains to ask for), the lever frame (routes grouped under their signals,
  levers lit when set, blocked levers say why), the baton; the working
  (what to do next for each movement) and the register (the box's duty
  sheet, with a clock skip to the next event).
- Incidents for the signaller: warrant cancelled early (S 36), train held
  at the home (S 38), baton shown late (S 40). Rule S 34 words the
  line-clear exchange.
- Duty 501 (the crossing from Wending Box) and Duty 502 (the junction from
  Wending Box); a headless auto-signaller plays both through the player's
  own actions. Books S and R reissued.

### M3 — Timetable and autonomous traffic (first cut done 2026-09-09)
- The working timetable as data (`src/traffic/timetable.ts`): services
  with calls, kinds (passenger, empty, shunt), coupling and dividing,
  joins; crew diagrams; where the stock stands at dawn. A planner derives
  the boxes' working, the colleagues' programmes and the player's duty
  sheet from it (`src/traffic/planner.ts`), so a whole day runs by itself
  and the player takes any chair (Duty 601, `src/traffic/valleyday.ts`).
- Ashgrove Shed: three roads off the headshunt, shed routes and exit
  signals, empties out at dawn and in at dusk; sheds are layout data.
- A movement is a train or a shunting move by the signal it last passed;
  Class 1 cars can shunt. Colleagues shunt, ride, divide their own car,
  join by call-on, brake for speed boards, whistle at every crossing, and
  stable in the shed. Rule R 26 empty trains and shunts. Book T reissued
  with the working.
- The timetable view (2026-09-10): the Traffic Office page from the home
  screen and a Timetable overlay in Duty 601: a train graph of the whole
  day (main line and branch panels, the shed row), the working timetable
  as a table, crew diagrams and stock working as timelines; over a running
  day it draws where every car has actually been, the clock, and the
  actual times against the booked ones.
- Still to come in M3: a timetable editor in the game (the data and the
  view are ready for it); freight: wagons with destinations, a marshalling
  puzzle, consist rules (brake force, length, load); the player relieving
  a colleague mid-diagram.

### M3b — Engine-hauled trains on the main line (requested, next)
- Locomotive-hauled trains in the weekday working alongside the cars: the
  Class 4 and coaches on booked services, running round at the termini.
- For that, the main line becomes double track between Ashgrove and
  Coldwater (or at least a second running loop where the working needs
  it), with the block worked per line, and the termini gain a run-round
  loop long enough for a locomotive to escape round its train while the
  platform holds the next arrival; the shed gains a road for the loco and
  coaches. Books P, S, T and D follow.

### M4 — Wear and tear (permanent way)
- Track condition model: geometry, rail wear, ballast, fastenings. Traffic
  degrades it; speed restrictions appear; inspection trolleys and gangs fix
  it. Player role: **track maintenance worker** (walk the line, measure,
  report, temporary speed restrictions, possession planning).
- Maintenance vehicles (inspection trolley, tamper, ballast wagons).

### M5 — The Workshop
- Rolling-stock condition model: brake blocks, wheel profiles, pantograph
  carbon strips, traction motors, couplers.
- Depot and workshop: inspect, lift, replace, adjust. Start at "component"
  granularity and refine toward sub-assemblies and, one day, screws.
- Player role: **fitter**.

### M6 — Earthworks and construction
- Terrain with elevation; cuttings, embankments, culverts, bridges.
- Track-laying tools, drainage affects wear (gradients themselves arrived
  with M1.5).
- Player role: **engineer / works supervisor**.

### Later and someday
- 3D view module, sound design, weather and seasons, steam traction
  (Book D-Steam), passenger flow, economics, multiplayer roles at once.

---

## 5. Ideas backlog (recorded so nothing is lost)

- Fantasy signalling manual from first principles (done in M0/M1, grows
  every milestone).
- Manuals printed as booklets: A5 page size, covers, contents, rule
  numbering, cross-references, diagrams, colophon.
- Brand guideline and identity manual for the company; livery, lettering,
  station signage, baton, uniform badges.
- Role switching: driver, signaller/station master, track worker, fitter,
  works engineer; "proper vehicles for all those".
- Autonomous traffic with the player's manual driving fitting in.
- Rolling-stock wear down to the last screw; workshop simulation.
- Track wear, inspection, maintenance, possessions.
- Earthworks: cuttings, embankments, gradients, bridges.
- Timetabling with a working timetable and public timetable.
- Car routing / consist management for freight.
- Manuals on every one of the above.
- Scoring philosophy: the railway keeps an *Incident Book*; a duty is
  "clean" if nothing is written in it. No points, just the book.

---

## 6. Technical decisions

- **Stack:** Vite + TypeScript, no framework, HTML/CSS for panels, Canvas 2D
  for the world view. Manuals are static HTML in `public/manuals/` with a
  shared stylesheet and print rules; the game shows them in an iframe.
- **Track model:** a graph; positions are (edge, offset, direction). Switches
  are nodes with a toe and two branches. Vehicles are rigid bodies with two
  ends resolved along the graph; consists are chains of vehicles.
- **Physics:** longitudinal 1D. Tractive effort from a power/adhesion curve,
  automatic air brake with a pipe pressure, Davis-style resistance, gradients
  ready but flat for now.
- **Signalling:** signals are trackside objects with a facing direction and
  an aspect; an interlocking owns routes (switch positions + signal aspects +
  section occupancy checks). NPC station masters drive it by scripts.
- **Rules engine:** observers that watch the world and append to the
  Incident Book.
- **Time:** simulation clock with 1×/2×/5×/10× warp; walking takes real time.

---

## 7. Working method

- Keep the fiction bible (`docs/WORLD.md`) authoritative; code and manuals
  cite it.
- Every rule the sim enforces has a numbered rule in a Book. Every control in
  the cab has a paragraph in Book D.
- Add depth only through an existing interface; add a new interface only
  with a milestone.
- Every change to a Book bumps its edition and ships an amendment slip: a
  clean, readable account of what changed, deposited next to the Book and
  linked from it and from the Library (see `docs/WORLD.md` §2.1).
- Every piece of finished work is committed and pushed to
  `github.com/lukacslacko/trains`.
