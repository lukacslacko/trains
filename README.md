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
npm run play       # play a frozen snapshot of the latest commit on port 4700 (or next free)
```

`npm run play` checks the latest commit out into a separate worktree
(`.play/`, ignored by git) and serves that, so edits to the working tree
never reload a duty in progress. Re-run it to move the snapshot to the
newest commit. It starts looking for a free port at 4700 (set `PORT=...` to
start elsewhere) and prints the exact URL; open that, not `localhost`, so a
port shared with another app on IPv6 cannot mislead you. Port 5173 is the
live working tree (`npm run dev`) and 5174 is reserved for testing.

Headless playthroughs (a scripted driver runs a whole duty and prints the
Incident Book and the station masters' messages):

```
node scripts/play.mjs 101
node scripts/play.mjs 201
node scripts/play.mjs 301
```

## What is here (milestones M0 and M1)

- **Duty 101 — the shuttle.** Class 1 motor car 1002 on the single line
  Ashgrove–Wending, stop boards only, One Train Working. Prepare the car,
  keep the booked times, change ends, stable it.
- **Duty 201 — the run-round.** Class 4 locomotive 4003 and Type C4 coach
  5107. Loops, switches, main and ground signals, station masters who set
  routes and show the baton. Uncouple, run round, couple at walking pace,
  prove the brake, leave on signal and baton.
- **Duty 301 — the crossing.** The line extended to Coldwater, Wending a
  through station with two platforms, two block sections worked by Line
  Warrants, distant signals, a neutral section, a whistle board for Millers'
  Crossing, and a colleague driving car 1003 the other way. You cross at
  Wending twice.
- **The Library.** Book I (Identity), Book R (Rules of Operation), Book S
  (Signalling), Book D (Driving), Book P (Permanent Way), Book T
  (Timetabling). HTML booklets with a print stylesheet (A5) in
  `public/manuals/`, each with amendment slips between editions.
- **Waiting for a departure.** On the duty sheet, click the booked departure
  time to bring the clock to 15 s before it. The world keeps running through
  the skip, and it stops early if anything moves or an incident is written.
- **Gradients.** The valley climbs 12‰ from Ashgrove towards Wending, easing
  to 6‰ near the weir, level through both stations. Gradient posts mark each
  change of grade; a parking brake (`B`) is part of securing and stabling;
  rolling back, running away and dragging the parking brake are incidents.
  Advance speed boards stand further out where the approach falls.
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

`W`/`S` power notch · `A`/`D` train brake · `Space` emergency · `B` parking brake ·
`F`/`N`/`R` reverser · `P` pantograph · `L` lights (this end) · `O` doors ·
`H` horn · `C` leave/enter cab · `Home` re-centre the view.
Everything else is on the panel: walking, coupling, proving the brake.

## Licence

MIT. See `LICENSE`.
