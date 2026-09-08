# The Meridian Railway

*A modular train simulator, built one booklet at a time.*

The Meridian Railway is a fantasy railway designed from first principles,
and a simulator that grows around it: driving first, then signalling,
timetabling, track maintenance, the workshop, and earthworks. Each step
comes with a printed-style manual. See `docs/PLAN.md` for the whole road
and `docs/WORLD.md` for the fiction bible that code and manuals follow.

## Run it

```
npm install
npm run dev        # http://127.0.0.1:5173/
npm run typecheck
npm run dev:test   # a second server on port 5174, for testing while playing on 5173
```

Headless playthroughs (a scripted driver runs a whole duty and prints the
Incident Book and the station masters' messages):

```
node scripts/play.mjs 101
node scripts/play.mjs 201
```

## What is here (milestones M0 and M1)

- **Duty 101 — the shuttle.** Class 1 motor car 1002 on the single line
  Ashgrove–Wending, stop boards only, One Train Working. Prepare the car,
  keep the booked times, change ends, stable it.
- **Duty 201 — the run-round.** Class 4 locomotive 4003 and Type C4 coach
  5107. Loops, switches, main and ground signals, station masters who set
  routes and show the baton. Uncouple, run round, couple at walking pace,
  prove the brake, leave on signal and baton.
- **The Library.** Book I (Identity), Book R (Rules of Operation), Book S
  (Signalling), Book D (Driving). HTML booklets with a print stylesheet
  (A5) in `public/manuals/`.
- **Incident notices.** A new Incident Book entry pauses the duty and shows a
  notice with the rule, a short lesson and a link into the Book; dismiss it
  with a click or Enter.

## Layout of the code

```
src/core        units, time formatting
src/track       track graph (nodes, edges, switches, positions), the two layouts
src/stock       vehicles, consists, traction, the automatic air brake, lights
src/sim         world step, driver's person, coupling, rules → Incident Book,
                duty tracker and the loop-station station masters
src/scenarios   the duties (data + station-master visits)
src/ui          canvas view, signal-box line diagram, cab panel, screens
src/dev         scripted autopilot used by the headless runner
public/manuals  the Books and their shared stylesheet
public/brand    the mark
docs            PLAN.md (roadmap and backlog), WORLD.md (fiction bible)
```

## Keys

`W`/`S` power notch · `A`/`D` train brake · `Space` emergency ·
`F`/`N`/`R` reverser · `P` pantograph · `L` lights (this end) · `O` doors ·
`H` horn · `C` leave/enter cab · `Home` re-centre the view.
Everything else is on the panel: walking, coupling, proving the brake.

## Licence

MIT. See `LICENSE`.
