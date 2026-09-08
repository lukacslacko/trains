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

### M2 — Intermediate stations and the block
- A three-station line with a passing station in the middle.
- Block working between stations (line-clear exchange), single-line token
  or its Meridian equivalent (the *Line Warrant*).
- Distant signals, speed boards, whistle boards, neutral sections
  (pantograph down/up boards).
- Player can choose to be the **station master / signaller** at one box,
  with an NPC driving the train.

### M3 — Timetable and autonomous traffic
- Working timetable editor; trains run automatically to it.
- The player's train fits into the running traffic; conflicts are handled
  by the signallers (NPC or player).
- Freight: wagons with destinations, a marshalling puzzle ("which cars go
  where"), consist rules (brake force, length, load).

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
- Track-laying tools, gradients affect the physics, drainage affects wear.
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
