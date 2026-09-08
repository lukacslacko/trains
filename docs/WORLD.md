# The Meridian Railway — Fiction Bible

This file is authoritative. Code, scenarios and manuals cite it. If a manual
and this file disagree, fix the manual; if the code and this file disagree,
fix the code (or amend this file deliberately and then the manuals).

---

## 1. The company

- **Name:** The Meridian Railway. In running text "the Railway" or "the
  Company". Abbreviation on plates and stock: **MR**.
- **Origin story:** the first line was surveyed along a north–south meridian
  line laid out by the Valley Survey; the company took its name from the
  survey line, and its habit of precision from the surveyors.
- **Motto:** *On the line, on time.*
- **Mark:** a circle bisected by a vertical line (the meridian), with a short
  horizontal tick at the centre (the rail). Drawn in Meridian Green on ivory
  or ivory on green. Never rotated, never outlined.
- **Colours** (name, hex, use):
  - Meridian Green `#1F4B3F` — primary; vehicle bodies, covers, signage.
  - Ivory `#F4EFE3` — paper, waist band on stock, station name boards.
  - Signal Red `#C6321E` — danger, buffer beams, stop aspects, warnings.
  - Brass `#B5913F` — lining, numerals on stock, accents.
  - Ink `#1A1A1A` — text.
  - Slate `#4A5560` — secondary text, signal posts, diagrams.
  - Chalk `#D9D2C0` — rules, table lines, faint fills.
  - Amber `#D9A21B` — caution aspect only.
  - Lamp Green `#2E9E5B` — clear aspect only.
- **Typography:** display *Barlow Condensed* (fallback: Arial Narrow,
  sans-serif, uppercase with tracking); text *Source Serif 4* (fallback
  Georgia, serif); data and numbers *IBM Plex Mono* (fallback Menlo,
  monospace).
- **Voice:** calm, exact, courteous. Rules are imperative ("Sound one short
  blast before moving."). Explanations are in the second person plural of a
  colleague ("We do this because…"). No exclamation marks except in the
  word DANGER.

## 2. The books

Company manuals are lettered. Each has an edition date on its cover, a
contents page, numbered sections (§ 3.2) and numbered rules (**Rule S 12**).
Rules are cited as "Rule R 20" across books.

| Book | Title | Covers |
|------|-------|--------|
| I | Identity Manual | name, mark, colours, type, livery, signage, voice, document system |
| R | Rules of Operation | terms, directions, staff and authority, speeds, station working, departure procedure, doors, lights, horn, incident book |
| S | Signalling Manual | principles, main signals, ground signals, boards, hand signals and the baton, station layouts and signal numbering, routes and block working, failures |
| D | Driving Manual | the driver's person and locations, cab controls, preparing and stabling, running, stopping, changing ends, coupling and uncoupling, brake continuity test, the Class 1 car, the Class 4 locomotive, the Type C4 coach |

Later: P (Permanent Way), W (Workshop), T (Timetabling).

## 3. Geography

The Wend valley. The line runs south to north from **Ashgrove** (a market
town at the foot of the valley) to **Wending** (a mill village by the weir).

- **Kilometrage** counts from the buffer stop at Ashgrove, km 0.000, to the
  buffer stop at Wending, km 3.300.
- **Down** = direction of increasing kilometrage (Ashgrove → Wending).
  **Up** = decreasing (Wending → Ashgrove). A signal "faces" the trains it
  governs: a Down signal governs Down trains.
- **Station codes:** Ashgrove **AG**, Wending **WD**. Signal boxes are
  called "Ashgrove Box" and "Wending Box".
- **Station masters:** Ashgrove — T. Marrow. Wending — J. Pell. Messages are
  signed "Marrow, Ashgrove" / "Pell, Wending".
- **Electrification:** overhead line, 1.5 kV DC, wired throughout including
  headshunts.
- **Line speed:** 50 km/h. **Station limits:** 25 km/h. **Shunting:** 15
  km/h. **Coupling approach:** 5 km/h in the last 20 m, contact at 2 km/h
  or less.

## 4. Layouts

All positions in km from the Ashgrove buffer stop. "On track 1/2" means the
object stands on that loop track; otherwise it is on the single line.

### 4.1 Duty 101 layout ("the shuttle", Book D Class 1 car)

Plain single track from buffer to buffer, no switches, no signals.

| km | object | faces | note |
|----|--------|-------|------|
| 0.000 | buffer stop | – | fixed red light |
| every 0.100 | hectometre post | – | kilometre posts at 1.0, 2.0, 3.0 |
| 0.130–0.290 | Ashgrove platform | – | |
| 0.135 | Stop board "ASHGROVE" | Up | Up trains stop here |
| 0.450 | Speed board 25 | Up | station limit begins for Up trains |
| 0.450 | Speed board 50 | Down | line speed resumes for Down trains |
| 2.850 | Speed board 25 | Down | |
| 2.850 | Speed board 50 | Up | |
| 3.010–3.170 | Wending platform | – | |
| 3.165 | Stop board "WENDING" | Down | Down trains stop here |
| 3.300 | buffer stop | – | fixed red light |

Working: **One Train Working** — one vehicle on the line, no signals, the
driver departs at the booked time on their own authority (Rule R 24).

### 4.2 Duty 201 layout ("the run-round", Class 4 + Type C4)

Each station has a loop (track 1 at the platform, track 2 alongside), a
switch at each end, a headshunt beyond the inner switch, and a short stub
of the single line between the outer switch and the home signal. Hectometre
posts stand every 100 m throughout, moved outward past track 2 within the
loops.

Ashgrove (headshunt at the Up/buffer end, main line at the Down end):

| km | object | faces | on | note |
|----|--------|-------|----|------|
| 0.000 | buffer stop | – | headshunt | |
| 0.070 | Ground signal **AG 5** | Down | headshunt | headshunt → station |
| 0.080 | Switch **AG B** | toe faces Up (headshunt side) | – | normal = track 1, reverse = track 2 |
| 0.110–0.310 | track 1 and track 2 | – | | platform on track 1, km 0.130–0.290 |
| 0.115 | Ground signal **AG 4** | Up | track 1 | track 1 → headshunt |
| 0.135 | Stop board "ASHGROVE" | Up | track 1 | |
| 0.305 | Starting signal **AG 1** | Down | track 1 | main signal |
| 0.305 | Ground signal **AG 3** | Down | track 2 | track 2 → stub |
| 0.340 | Switch **AG A** | toe faces Down (main line side) | – | normal = track 1, reverse = track 2 |
| 0.350 | Ground signal **AG 6** | Up | single line | stub → station |
| 0.400 | Limit of Shunt board | Down | single line | shunting moves stop short of it |
| 0.420 | Home signal **AG 2** | Up | single line | main signal, governs entry |
| 0.450 | Speed boards 25 (Up) / 50 (Down) | | | |

Wending (mirror; headshunt at the Down/buffer end):

| km | object | faces | on | note |
|----|--------|-------|----|------|
| 2.850 | Speed boards 25 (Down) / 50 (Up) | | | |
| 2.880 | Home signal **WD 1** | Down | single line | |
| 2.900 | Limit of Shunt board | Up | single line | |
| 2.950 | Ground signal **WD 5** | Down | single line | stub → station |
| 2.960 | Switch **WD A** | toe faces Up (main line side) | – | normal = track 1, reverse = track 2 |
| 2.990–3.190 | track 1 and track 2 | | | platform on track 1, km 3.010–3.170 |
| 2.995 | Starting signal **WD 2** | Up | track 1 | |
| 2.995 | Ground signal **WD 4** | Up | track 2 | track 2 → stub |
| 3.165 | Stop board "WENDING" | Down | track 1 | |
| 3.185 | Ground signal **WD 3** | Down | track 1 | track 1 → headshunt |
| 3.220 | Switch **WD B** | toe faces Down (headshunt side) | – | normal = track 1, reverse = track 2 |
| 3.230 | Ground signal **WD 6** | Up | headshunt | headshunt → station |
| 3.300 | buffer stop | – | headshunt | |

Signal numbering rule: station code, space, number. Odd numbers face Down,
even numbers face Up. Main signals take the lowest numbers (1, 2), ground
signals the rest.

### 4.3 Routes (Duty 201)

A route is set by the station master: switches are set, then the governing
signal is cleared, only when every track section on the route is clear
(except a shunt route into an occupied track, which is cleared for coupling).

Ashgrove routes: `Main→1` (AG 2 Caution), `1→Main` (AG 1 Clear),
`1→Headshunt` (AG 4 Shunt), `Headshunt→2→Stub` (AG 5 and AG 3 Shunt),
`Stub→1` (AG 6 Shunt, into the occupied platform track for coupling).
Wending routes mirror: `Main→1` (WD 1 Caution), `1→Main` (WD 2 Clear),
`1→Headshunt` (WD 3 Shunt), `Headshunt→2→Stub` (WD 6 and WD 4 Shunt),
`Stub→1` (WD 5 Shunt).

## 5. Signals and boards (catalogue)

**Main signals.** Colour lights on a slate post; three lamps in a vertical
row: green top, amber middle, red bottom. A black plate with the signal's
name in white.

| aspect | shows | meaning |
|--------|-------|---------|
| STOP | red | Stop and stay. |
| CAUTION | amber | Proceed; be prepared to stop at the next signal, stop board or end of track. |
| CLEAR | green | Proceed at line speed; the next signal shows a proceed aspect. |
| (dark / doubtful) | – | Treat as STOP. |

A home signal into a terminal platform shows CAUTION when cleared, never
CLEAR, because the track ends.

**Ground signals.** A low black box with two white lamps. Horizontal pair =
**SHUNT STOP** (do not pass). Diagonal pair rising to the right = **SHUNT**:
proceed at shunting speed, prepared to stop short of any vehicle or
obstruction. Ground signals govern shunting moves only.

**Boards** (fixed signs).

| board | look | meaning |
|-------|------|---------|
| Stop board | ivory board, thick black horizontal bar, station name beneath | Stop with the front of the train level with the board. Within 3 m short is a correct stop. |
| Limit of Shunt | ivory board with a red diagonal band, "LIMIT OF SHUNT" | Shunting moves must not pass. |
| Speed board | black numeral on an ivory disc with a black rim | Speed limit in km/h from the board onward. |
| Buffer stop | red lamp on the stop | End of track. |

Future: whistle board, pantograph down/up boards, end of wire, distant
signals.

**Posts.** A **hectometre post** stands every 100 m from the Ashgrove buffer
stop (km 0.0) to the end of the line, on the left of the line in the Down
direction, clear of any loop track. An ivory plate on a slate post carries
the distance in black figures: the kilometre, a point, and the hectometre
digit, so the post at 1.4 km reads **1.4**. Every full kilometre has a
larger **kilometre post**: an ivory plate with a green border and a green
numeral under the small word KM, reading **2**. Posts are a position
reference, not a signal: they carry no instruction. They are used to name
where things stand (the Wending stop board is between posts 3.1 and 3.2),
to report a position to the Box ("stopped at 2.7"), and to judge distance
when braking (Book D: from 50 km/h begin the step-2 application about a post
and a half before the stop board).

**Hand signals.** The **baton**: a hand-held disc, green on one face, red on
the other, with a lamp for night. Green face shown steadily to the driver =
*Ready to start*. Red face = *Stop*. The station master holds the baton;
on unstaffed halts there is no baton and the driver departs on their own
authority.

## 6. Rules summary (the sim enforces these; Books give them numbers)

- **R 10 Speeds.** 50 line, 25 within station limits (from the speed board
  or home signal to the buffer), 15 shunting, 5 coupling approach.
- **R 12 Stop boards.** Stop with the front within 3 m short of the board.
  Overrunning the board is an incident.
- **R 14 Doors.** Open only when stopped at a platform. Close before moving.
  Traction is inhibited while doors are open.
- **R 16 Lights.** On the main line the leading end shows HEAD (white), the
  rear of the train shows TAIL (red), coupled ends show nothing. Within
  station limits on shunting moves, lights are recommended but not enforced.
- **R 18 Horn.** One short blast before moving from rest.
- **R 20 Departure of a passenger train.** All of: doors closed; booked time
  reached; where signals exist, the starting signal shows a proceed aspect;
  where a station master is on duty, the baton shown green. Then the horn,
  then move.
- **R 22 Securing.** Before leaving the cab: power off, train brake fully
  applied, reverser to neutral. The pantograph may stay up. (The cab door
  will not let you out otherwise: the sim refuses with a message naming the
  missing condition.)
- **R 24 One Train Working.** On a line worked by one train with no signals,
  the driver departs on their own authority at the booked time.
- **S 10 Signals at STOP.** Never pass a main signal at STOP or a ground
  signal at SHUNT STOP. Doing so is a *signal passed at danger*.
- **S 12 Limit of Shunt.** Shunting moves stop short of the board.
- **S 14 Routes.** Move only when the governing signal has been cleared for
  the move, and only as far as the route goes.
- **S 16 Dark or doubtful.** A signal that is dark or cannot be read is at
  STOP.
- **S 18 Signal and baton.** To go, both must say go; either alone says stop.
- **S 20 Posts.** Hectometre and kilometre posts are a position reference and
  carry no instruction.
- **D 10 Coupling.** Approach at 5 km/h or less over the last 20 m; make
  contact at 2 km/h or less. After mechanical coupling, connect the brake
  pipe at the coupling (walk to it).
- **D 12 Uncoupling.** Stationary, train brake applied. At the coupling:
  disconnect the pipe (both parts' brakes apply automatically), then part
  the coupler.
- **D 14 Brake continuity.** After coupling, before departure, prove the
  brake through the train from the cab (train brake at Full, then the test,
  about 15 s). Coach doors are worked through the control line, so they
  answer the cab only once the pipe and control line are connected.
- **D 16 Buffer stops.** Do not strike them.
- **D 18 Emergency brake.** Use it when in doubt; its use is recorded.

## 7. Rolling stock

**Class 1 motor car ("Lark").** Fleet 1001–1004; Duty 101 uses **1002**.
Length 22 m, mass 38 t, two cabs (A and B), doors on both sides, one
pantograph, two 150 kW motors, max tractive effort 45 kN, max speed 60 km/h.
Automatic air brake, max service deceleration about 1.0 m/s².

**Class 4 locomotive ("Heron").** Fleet 4001–4006; Duty 201 uses **4003**.
Length 16 m, mass 64 t, two cabs, one pantograph, 1200 kW, max tractive
effort 140 kN, max speed 90 km/h.

**Type C4 coach.** Fleet 5101–5120; Duty 201 uses **5107**. Length 20 m,
mass 30 t, 64 seats, doors both sides, automatic end lights (show TAIL at a
free end when part of a lit train), no cab.

**Couplers.** The Meridian automatic coupler: couples mechanically on
contact; brake pipe and control line are connected by hand at the coupling.

## 8. The driver's person

The player's driver is a person who is *somewhere*: in Cab A, in Cab B, on
the ground beside the train, or at a coupling. Walking takes about 1.2 m/s.
Actions that need a place (change ends, connect/uncouple) need the driver
there.

## 9. Cab controls (both classes)

| control | positions | key |
|---------|-----------|-----|
| Reverser | Reverse · Neutral · Forward (relative to this cab) | `R` / `N` / `F` |
| Power controller | 0 – 4 notches | `W` up, `S` down |
| Train brake | Release · 1 · 2 · 3 · Full · Emergency | `A` release, `D` apply, `Space` emergency |
| Pantograph | Down · Up | `P` |
| Lights (this end) | Off · Tail · Head | `L` cycles |
| Doors | Closed · Open | `O` |
| Horn | one short blast | `H` |
| Brake test | run continuity test | button |
| Leave / enter cab | — | `C` |

Indicators: speed (km/h), brake pipe pressure (bar; 5.0 released, 3.5 full
service, 0 emergency), line voltage present, doors, next signal or board
ahead with distance, current speed limit, clock.

## 10. Duties

**Duty 101 — Ashgrove–Wending shuttle.** Car 1002 stabled at Ashgrove
platform, pantograph down, lights off, doors closed, brake applied. Sim
starts 05:45. Booked: 06:00 AG dep → 06:06 WD arr; 06:12 WD dep → 06:18 AG
arr; 06:24 AG dep → 06:30 WD arr; 06:36 WD dep → 06:42 AG arr; then stable
(pantograph down, lights off).

**Duty 201 — Ashgrove–Wending with run-round.** Loco 4003 coupled to coach
5107 on Ashgrove track 1, loco at the Down (main line) end, stabled.
Sim starts 06:45. Booked: 07:00 AG dep → 07:07 WD arr; run round; 07:30 WD
dep → 07:37 AG arr; run round; duty complete when coupled, brake proved,
and stabled at Ashgrove before 08:00.

## 11. Incident Book entries (what the rules engine records)

Early departure · Moved with doors open · Doors opened away from platform ·
Overspeed (with limit and speed) · Stop board overrun · Stopped short of
board (> 3 m) · Incorrect lights on the main line · No horn before moving ·
Signal passed at danger · Limit of Shunt passed · Rough coupling (speed) ·
Brake not proved before departure · Buffer stop struck · Uncoupled with the
brake not fully applied · Emergency brake used (noted, not a fault).

Book I adds identity rules I 10–I 38 (name, mark, colour, type, livery,
signage, voice, document system); they are not enforced by the sim.
