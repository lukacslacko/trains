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
| R | Rules of Operation | terms, directions, staff and authority, speeds, station working, departure procedure, doors, lights, horn, block working, incident book |
| S | Signalling Manual | principles, main signals and subsidiaries, distant signals, ground signals, boards, switch indicators, hand signals and the baton, station layouts and signal numbering, routes, block working and Line Warrants, failures |
| D | Driving Manual | the driver's person and locations, cab controls, preparing and stabling, running, stopping, gradients, neutral sections, changing ends, coupling and uncoupling, brake continuity test, the Class 1 car, the Class 4 locomotive, the Type C4 coach |
| P | Permanent Way | what the permanent way is, the line and its profile (gradient diagram), gradient posts, hectometre posts, warning distances, the neutral section and the crossing; inspection and maintenance to follow with M4 |
| T | Timetabling | the working timetable, train numbers, block sections, the crossing at Wending, portions and the branch, duty sheets, the time–distance diagram |

Later: W (Workshop), B (Box Working).

### 2.1 Editions and amendment slips (standing requirement)

A reader who knows one edition of a Book must be able to bring themselves
up to date quickly. Therefore, whenever the text or figures of a Book
change (a change to the shared stylesheet alone does not count):

1. **Bump the edition** on the cover, in the desk-bar and in the colophon:
   "Second edition · October 2026", and the colophon says which edition it
   supersedes.
2. **Deposit an amendment slip** at
   `public/manuals/amendments/book-<letter>-ed<N>.html`, in the house style
   (it is itself a small Book page): title "Amendment Slip <Letter>-<N>:
   first edition to second edition", date, then one entry per change, in
   book order, each giving the section (with a link to its anchor), a
   one-line reason, and the wording before and after where wording changed,
   or the new text in full (or a faithful summary for long additions).
   It must read cleanly on its own, like a well-made diff, not like a patch
   file.
3. **Link it**: the Book's colophon lists its slips; the Library page lists
   the current edition of every Book and its slips; the slip links back to
   the Book.

The first editions of Books I, R, S and D (September 2026) are the
baseline; the hectometre-post amendment of 2026-09-08 predates this rule
and carries no slip.

## 3. Geography

The Wend valley. The line runs south to north from **Ashgrove** (a market
town at the foot of the valley) through **Wending** (a mill village by the
weir) to **Coldwater** (a quarry village at the head of the valley). At
Wending the **Fernhollow branch** leaves the main line at the junction
switch WD J and climbs a side valley to **Fernhollow** (a hamlet of fern
gatherers and a chapel).

- **Kilometrage** counts from the buffer stop at Ashgrove, km 0.000, to the
  buffer stop at Coldwater, km 6.400.
- **Down** = direction of increasing kilometrage (Ashgrove → Coldwater).
  **Up** = decreasing. A signal "faces" the trains it governs: a Down signal
  governs Down trains.
- **Branch kilometrage** counts from the junction switch WD J (main km
  3.360) to the Fernhollow buffer stop, branch km 2.320. Branch posts are
  lettered F: **F 0.1 … F 2.3**. Down on the branch = away from Wending.
- **Station codes:** Ashgrove **AG**, Wending **WD**, Coldwater **CW**,
  Fernhollow **FH**. Signal boxes are "Ashgrove Box", "Wending Box",
  "Coldwater Box", "Fernhollow Box".
- **Station masters:** Ashgrove — T. Marrow. Wending — J. Pell. Coldwater —
  A. Ashby. Fernhollow — M. Thorne. Messages are signed "Marrow, Ashgrove"
  and so on. Colleagues driving other trains: R. Farrow (1003), E. Hale
  (1004), W. Penrose (1001).
- **Electrification:** overhead line, 1.5 kV DC, wired throughout including
  headshunts. The Ashgrove and Coldwater feeds meet at a **neutral section**
  at km 4.19–4.21 (see §5).
- **Block sections:** A, Ashgrove–Wending (home signal to home signal:
  km 0.42–2.88, worked by Ashgrove and Wending boxes); B, Wending–Coldwater
  (km 3.44–5.98); C, Wending–Fernhollow (WD 10 at branch km 0.08 to FH 1 at
  F 2.03). Each has one Line Warrant (§6, Rule S 28).
- **Line speed:** 50 km/h on the main line, **40 km/h on the branch**.
  **Station limits:** 25 km/h. **Shunting:** 15 km/h. **Coupling approach:**
  5 km/h in the last 20 m, contact at 2 km/h or less.
- **Profile.** Gradients in per mille, positive = rising in the Down
  direction: km 0.0–0.5 level (Ashgrove station limits), 0.5–2.4 rising
  12‰, 2.4–2.8 rising 6‰ (easing towards the weir), 2.8–3.4 level (Wending
  station limits), 3.4–5.6 rising 8‰, 5.6–6.4 level (Coldwater). Wending
  stands 25.2 m and Coldwater 42.8 m above Ashgrove. Changes of grade, each
  marked by a gradient post: km 0.5, 2.4, 2.8, 3.4, 5.6. Down trains climb,
  Up trains descend. **Branch profile:** F 0.0–0.3 level, 0.3–1.9 rising
  10‰, 1.9–2.32 level; Fernhollow stands 41.2 m above Ashgrove; gradient
  posts at F 0.3 and F 1.9.
- **Millers' Crossing:** a farm crossing at km 4.70, with whistle boards at
  4.50 (Down) and 4.90 (Up).

## 4. Layouts

All positions in km from the Ashgrove buffer stop. "On track 1/2" means the
object stands on that loop track; otherwise it is on the single line.

### 4.1 Duty 101 layout ("the shuttle", Book D Class 1 car)

Plain single track from the Ashgrove buffer stop to a buffer stop at
km 3.300 (Wending as first built), no switches, no signals. Objects as in
the full line between those kilometres, without signals or switch
indicators: stop boards at 0.135 (Up) and 3.165 (Down), speed and advance
boards, gradient posts at 0.5 and 2.4 and 2.8, hectometre posts.

Working: **One Train Working** — one vehicle on the line, no signals, the
driver departs at the booked time on their own authority (Rule R 24).

### 4.2 The full line (Duties 201 and 301)

**Ashgrove** (terminus; headshunt at the Up/buffer end, main line to the
north):

| km | object | faces | on | note |
|----|--------|-------|----|------|
| 0.000 | buffer stop | – | headshunt | |
| every 0.100 | hectometre post | – | | kilometre posts at 1.0, 2.0 … |
| 0.070 | Ground signal **AG 5** | Down | headshunt | headshunt → station |
| 0.080 | Switch **AG B** | toe faces Up | – | normal = track 1, reverse = track 2; switch indicator |
| 0.110–0.310 | track 1 and track 2 | | | platform on track 1, km 0.130–0.290 |
| 0.115 | Ground signal **AG 4** | Up | track 1 | track 1 → headshunt |
| 0.135 | Stop board "ASHGROVE" | Up | track 1 | |
| 0.305 | Starting signal **AG 1** | Down | track 1 | main signal |
| 0.305 | Ground signal **AG 3** | Down | track 2 | track 2 → stub |
| 0.340 | Switch **AG A** | toe faces Down | – | switch indicator |
| 0.350 | Ground signal **AG 6** | Up | single line | stub → station |
| 0.400 | Limit of Shunt board | Down | single line | |
| 0.420 | Home signal **AG 2** | Up | single line | |
| 0.450 | Speed boards 25 (Up) / 50 (Down) | | | station limit |
| 0.500 | Gradient post | both | | level ↔ 12‰ |
| 0.670 | Distant signal **AG 2D** | Up | | 250 m before AG 2: falling 12‰ approach |
| 0.700 | Advance speed board 25 | Up | | 250 m before the 25 board |

**Section A**, km 0.45–2.85: gradient post at 2.4 (12‰ ↔ 6‰).

**Wending** (through station; platform 1 on track 1 for Down trains,
platform 2 on track 2 for Up trains):

| km | object | faces | on | note |
|----|--------|-------|----|------|
| 2.650 | Advance speed board 25 | Down | | 200 m before the 25 board (rising 6‰) |
| 2.680 | Distant signal **WD 1D** | Down | | 200 m before WD 1 |
| 2.800 | Gradient post | both | | 6‰ ↔ level |
| 2.850 | Speed boards 25 (Down) / 50 (Up) | | | south station limit |
| 2.880 | Home signal **WD 1** | Down | single line | from Ashgrove |
| 2.900 | Limit of Shunt board | Up | single line | south stub |
| 2.950 | Ground signal **WD 5** | Down | single line | south stub → station |
| 2.960 | Switch **WD A** | toe faces Up | – | normal = track 1, reverse = track 2; switch indicator |
| 2.990–3.190 | track 1 and track 2 | | | platform 1 on track 1, platform 2 on track 2, km 3.010–3.170 |
| 2.995 | Starting signal **WD 2** | Up | track 1 | to Ashgrove |
| 2.995 | Starting signal **WD 4** | Up | track 2 | to Ashgrove; with subsidiary (track 2 → south stub) |
| 3.015 | Stop board "WENDING" | Up | track 2 | Up trains, platform 2 |
| 3.165 | Stop board "WENDING" | Down | track 1 | Down trains, platform 1 |
| 3.185 | Starting signal **WD 7** | Down | track 1 | to Coldwater; with subsidiary (track 1 → north stub) |
| 3.185 | Starting signal **WD 9** | Down | track 2 | to Coldwater or Fernhollow |
| 3.220 | Switch **WD B** | toe faces Down | – | normal = track 1, reverse = track 2; switch indicator |
| 3.230 | Ground signal **WD 6** | Up | single line | north stub → station |
| 3.280 | Limit of Shunt board | Down | single line | north stub |
| 3.360 | Junction switch **WD J** | toe faces Up (station side) | – | normal = main line to Coldwater, reverse = the branch; switch indicator |
| 3.400 | Gradient post | both | | level ↔ 8‰ |
| 3.440 | Home signal **WD 8** | Up | main line | from Coldwater; with subsidiary for call-on |
| 3.500 | Speed boards 25 (Up) / 50 (Down) | | | north station limit |
| 3.640 | Distant signal **WD 8D** | Up | | 200 m before WD 8 (falling 8‰, under 10‰) |
| 3.700 | Advance speed board 25 | Up | | |
| F 0.080 | Home signal **WD 10** | Up | branch | from Fernhollow; with subsidiary for call-on |
| F 0.140 | Speed boards 25 (Up) / 40 (Down) | | branch | branch station limit |
| F 0.300 | Gradient post | both | branch | level ↔ 10‰ |
| F 0.330 | Distant signal **WD 10D** | Up | branch | 250 m before WD 10 (falling 10‰) |
| F 0.390 | Advance speed board 25 | Up | branch | |

A Down train leaving Wending's track 1 or 2 towards the north takes WD 7 or
WD 9 and is routed at WD J either straight to Coldwater or over the branch;
the driver reads WD J's switch indicator and the Box's message to know
which. Two arrivals from the north, from Coldwater under WD 8 and from
Fernhollow under WD 10, converge at WD J.

WD 3 of the first layout is withdrawn: its move (track 1 → north stub) is
now the subsidiary of WD 7. The run-round at Wending (Duty 201): track 1 →
north stub under WD 7's subsidiary, north stub → track 2 under WD 6, track
2 → south stub under WD 4's subsidiary, south stub → track 1 under WD 5.
The north stub (WD B to WD J) is shared by every northward and every
arriving northern movement; the Box's routes lock it and WD J for one
movement at a time.

**Section C and Fernhollow** (the branch; positions in branch km):

| km | object | faces | note |
|----|--------|-------|------|
| F 1.800 | Advance speed board 25 | Down | 200 m before the 25 board (rising approach) |
| F 1.830 | Distant signal **FH 1D** | Down | 200 m before FH 1 |
| F 1.900 | Gradient post | both | 10‰ ↔ level |
| F 2.000 | Speed boards 25 (Down) / 40 (Up) | | Fernhollow station limit |
| F 2.030 | Home signal **FH 1** | Down | into the platform track |
| F 2.085 | Starting signal **FH 2** | Up | to Wending |
| F 2.100–2.260 | Fernhollow platform | – | one platform track, no loop |
| F 2.255 | Stop board "FERNHOLLOW" | Down | |
| F 2.320 | buffer stop | – | |

Fernhollow has no switches: a car arrives, its driver changes ends, and it
leaves the way it came.

**Section B**, km 3.40–5.95: section boards (power off) at 4.10 (Down) and
4.30 (Up), resume boards (power on) at 4.30 (Down) and 4.10 (Up), the
neutral section at 4.19–4.21; whistle boards at 4.50 (Down) and 4.90 (Up)
for Millers' Crossing at 4.70; gradient post at 5.6 (8‰ ↔ level).

**Coldwater** (terminus; main line to the south, headshunt at the
Down/buffer end; the mirror of Ashgrove):

| km | object | faces | on | note |
|----|--------|-------|----|------|
| 5.750 | Advance speed board 25 | Down | | 200 m before the 25 board (level approach) |
| 5.780 | Distant signal **CW 1D** | Down | | 200 m before CW 1 |
| 5.950 | Speed boards 25 (Down) / 50 (Up) | | | station limit |
| 5.980 | Home signal **CW 1** | Down | single line | |
| 6.000 | Limit of Shunt board | Up | single line | |
| 6.050 | Ground signal **CW 5** | Down | single line | stub → station |
| 6.060 | Switch **CW A** | toe faces Up | – | switch indicator |
| 6.090–6.290 | track 1 and track 2 | | | platform on track 1, km 6.110–6.270 |
| 6.095 | Starting signal **CW 2** | Up | track 1 | |
| 6.095 | Ground signal **CW 4** | Up | track 2 | track 2 → stub |
| 6.265 | Stop board "COLDWATER" | Down | track 1 | |
| 6.285 | Ground signal **CW 3** | Down | track 1 | track 1 → headshunt |
| 6.320 | Switch **CW B** | toe faces Down | – | switch indicator |
| 6.330 | Ground signal **CW 6** | Up | headshunt | headshunt → station |
| 6.400 | buffer stop | – | headshunt | |

Signal numbering rule: station code, space, number. Odd numbers face Down,
even numbers face Up. Main signals take the lowest numbers, ground signals
the rest; a distant signal takes its home's number with the letter D
(WD 1D). Fernhollow's signals belong to Fernhollow Box (FH 1, FH 2); the
branch's home at Wending is Wending's (WD 10).

### 4.3 Routes

A route is set by the box: switches are set, then the governing signal is
cleared, only when every track section on the route is clear (except a
shunt route into an occupied track, which is cleared for coupling). A
starter towards a block section is cleared only with the section's Line
Warrant in hand.

**Route locking (Rule S 32).** From the moment a route's signal is cleared
its switches are held in position, and they stay held until the movement
has passed clear of them: the signal replaced to STOP, the approach and the
sections of the route empty, no vehicle within 12 m of the switch. Another
route may share a switch only in the same position. A route into a platform
releases once the train stands wholly in the platform; a departure route
once the train has left the station's last switch behind.

Ashgrove: `homeN→1` (AG 2 Caution), `1→N` (AG 1 Clear), run-round
`1→hs` (AG 4), `hs→2→stub` (AG 5 and AG 3), `stub→1` (AG 6).
Wending: `homeS→1` (WD 1), `homeS→2` (WD 1), `homeN→1` and `homeN→2`
(WD 8, WD J straight), `homeB→1` and `homeB→2` (WD 10, WD J for the
branch), call-on variants of the four northern home routes with WD 8 or
WD 10 showing their subsidiary into an occupied platform, `1→S` (WD 2),
`2→S` (WD 4), `1→N` (WD 7, WD J straight), `1→B` (WD 7, WD J for the
branch), `2→N` and `2→B` (WD 9), run-round `1→hs` (WD 7 subsidiary),
`hs→2→stub` (WD 6 and WD 4 subsidiary), `stub→1` (WD 5). Coldwater mirrors
Ashgrove with CW 1, CW 2, CW 3, CW 6, CW 4, CW 5. Fernhollow: `homeS→1`
(FH 1), `1→S` (FH 2).

## 5. Signals and boards (catalogue)

**Main signals.** Colour lights on a slate post; three lamps in a vertical
row: green top, amber middle, red bottom. A black plate with the signal's
name in white. A main signal governs every movement, trains and shunting
moves alike.

| aspect | shows | meaning |
|--------|-------|---------|
| STOP | red | Stop and stay. |
| CAUTION | amber | Proceed; be prepared to stop at the next signal, stop board or end of track. |
| CLEAR | green | Proceed at line speed; the next signal shows a proceed aspect. |
| (dark / doubtful) | – | Treat as STOP. |

A home signal into a platform track where the train stops shows CAUTION
when cleared, never CLEAR.

**Subsidiary.** Two small white lamps in a black box fixed on the post
directly under the head of some main signals (WD 4, WD 7, WD 8, WD 10), so
that head and subsidiary read as one signal on one structure. Lit diagonally
with the main at STOP they show
**SHUNT**: a shunting move may pass at shunting speed as far as the route
goes; for a train the signal is still at STOP, except at a home signal
marked for **call-on** (WD 8, WD 10): there the lit subsidiary tells a train
that the platform ahead is occupied and calls it on at shunting speed,
prepared to stop short of the vehicles standing there (Rule S 30).

**Distant signals.** Two lamps on a slate post, green top, amber bottom,
with an ivory chevron plate behind the head; named after the home they
repeat with the letter D. **CAUTION** (amber): the home ahead may be at
STOP, reduce speed so as to stop at it. **CLEAR** (green): the home and the
signals through the station are clear. A distant is never at STOP; it gives
no instruction to stop, only warning. It stands one warning distance before
its home: 200 m where the approach is level or rising, 250 m where it falls
at 10‰ or more.

**Ground signals.** A low black box with two white lamps. Horizontal pair =
**SHUNT STOP** (do not pass). Diagonal pair rising to the right = **SHUNT**:
proceed at shunting speed, prepared to stop short of any vehicle or
obstruction. Ground signals govern shunting moves only.

**Boards** (fixed signs).

| board | look | meaning |
|-------|------|---------|
| Stop board | ivory board, thick black horizontal bar, station name beneath | Stop with the front of the train level with the board. Within 3 m short is a correct stop. |
| Limit of Shunt | ivory board with a red diagonal band, "LIMIT OF SHUNT" | Shunting moves must not pass. |
| Speed board | black numeral on an ivory disc with a black rim | Speed limit in km/h from the board onward. A lower limit applies to the front of the train as it passes; a higher limit applies only once the rear of the train has passed. |
| Advance speed board | black numeral on an ivory triangle, point up, black rim | A lower limit lies ahead: the speed board with this numeral stands one warning distance beyond. Be at that speed when the front reaches the speed board. Higher limits are not announced. |
| Whistle board | black W on an ivory disc with a black rim | Sound one long blast: a crossing lies ahead. |
| Section board | black square with a white bar across | Shut off power: a neutral section lies ahead. |
| Resume board | black square with a white bar along the line | Power may be taken again. |
| Switch indicator | black box on a short post at the toe of every switch, a white bar on each face | Shows which way the switch lies: the bar along the track means set for the straight route, the bar leaning towards the diverging track means set for the diverging route. Read from every leg. It carries no authority (the signal does) but a switch showing against your move is never run through: stop and speak to the Box. |
| Gradient post | slate post with a small ivory disc and two black arms, one along the line each way, each tilted with the grade on its side and lettered with that grade in per mille, L for level | Stands at every change of grade. The arm on the side you are travelling towards shows the grade ahead: tilted up and away from you it rises, down and away it falls. Information only, no instruction. |
| Buffer stop | red lamp on the stop | End of track. |

**Warning distance.** 200 m where the approach to the speed board or home
signal is level or rising; 250 m where the approach falls at 10‰ or more.
On this line: the Up advance board and distant for Ashgrove at 0.70 and
0.67 (falling 12‰), the Down ones for Wending at 2.65 and 2.68 (rising 6‰),
the Up ones for Wending at 3.60 and 3.52 (falling 8‰, under 10‰), the Down
ones for Coldwater at 5.75 and 5.78 (level).

**Posts.** A **hectometre post** stands every 100 m from the Ashgrove buffer
stop (km 0.0) to the end of the line, on the left of the line in the Down
direction, clear of any loop track. An ivory plate on a slate post carries
the distance in black figures: the kilometre, a point, and the hectometre
digit, so the post at 1.4 km reads **1.4**. Every full kilometre has a
larger **kilometre post**: the same plate on a larger scale, reading the
kilometre with its zero (**2.0**) in the same black figures, distinguished
only by a green rim. Posts are a position reference, not a signal: they
carry no instruction. They are used to name where things stand, to report a
position to the Box ("stopped at 2.7"), and to judge distance when braking.

**Neutral section.** A gap in the overhead line between two feeds, km
4.19–4.21. No power can be taken through it; drawing current across it arcs
at the pantograph and trips the substation. Section boards stand 90 m before
it in each direction, resume boards 90 m beyond.

**Hand signals.** The **baton**: a hand-held disc, green on one face, red on
the other, with a lamp for night. Green face shown steadily to the driver =
*Ready to start*. Red face = *Stop*. The station master holds the baton;
on unstaffed halts there is no baton and the driver departs on their own
authority.

## 6. Rules summary (the sim enforces these; Books give them numbers)

- **R 10 Speeds.** 50 line, 25 within station limits (from the speed board
  or home signal to the buffer), 15 shunting, 5 coupling approach. A limit
  applies to the whole train: a train's limit is the lowest limit under any
  part of it, so a reduction applies from the moment the front reaches its
  board and a rise only once the rear has passed its board. Reductions are
  announced by an advance speed board one warning distance before the speed
  board: 200 m on a level or rising approach, 250 m where the approach falls
  at 10‰ or more; at a service deceleration of 0.5 m/s² a train loses the
  25 km/h between 50 and 25 in about 145 m on the level, about 190 m on a
  12‰ fall, the rest is the driver's allowance for reaction, fog and snow.
- **R 12 Stop boards.** Stop with the front within 3 m short of the board.
  Overrunning the board is an incident.
- **R 14 Doors.** Open only when stopped at a platform. Close before moving.
  Traction is inhibited while doors are open.
- **R 16 Lights.** On the main line the leading end shows HEAD (white), the
  rear of the train shows TAIL (red), coupled ends show nothing. Within
  station limits on shunting moves, lights are recommended but not enforced.
- **R 18 Horn.** One short blast before moving from rest. One long blast at
  a whistle board, for the crossing beyond it.
- **R 20 Departure of a passenger train.** All of: doors closed; booked time
  reached; where signals exist, the starting signal shows a proceed aspect;
  where a station master is on duty, the baton shown green. Then the horn,
  then move.
- **R 22 Securing.** Before leaving the cab: power off, train brake fully
  applied, reverser to neutral, and the parking brake applied where the
  vehicle stands on a gradient or is to be left unattended (stabling always).
  The pantograph may stay up. (The cab door will not let you out otherwise:
  the sim refuses with a message naming the missing condition.)
- **R 24 One Train Working.** On a line worked by one train with no signals,
  the driver departs on their own authority at the booked time.
- **S 10 Signals at STOP.** Never pass a main signal at STOP or a ground
  signal at SHUNT STOP. A main signal at STOP with its subsidiary lit is
  STOP for a train and SHUNT for a shunting move. Doing so is a *signal
  passed at danger*.
- **S 12 Limit of Shunt.** Shunting moves stop short of the board.
- **S 14 Routes.** Move only when the governing signal has been cleared for
  the move, and only as far as the route goes.
- **S 16 Dark or doubtful.** A signal that is dark or cannot be read is at
  STOP.
- **S 18 Signal and baton.** To go, both must say go; either alone says stop.
- **S 20 Posts.** Hectometre, kilometre and gradient posts are a position and
  profile reference and carry no instruction.
- **S 22 Switch indicators.** Before moving over a switch, read its indicator.
  Never run through a switch that shows set against your move: stop and
  speak to the Box. Running through switches is an incident.
- **S 24 Distant signals.** At a distant at CAUTION, reduce speed so as to be
  able to stop at the home signal it repeats. A distant at CLEAR promises a
  clear run through the station.
- **S 30 Call-on.** A home signal's subsidiary lit for a train is a call-on:
  the platform ahead is occupied. Pass at shunting speed prepared to stop
  short of the vehicles, and couple to them only as the Box has instructed.
- **S 32 Route locking.** A route holds its switches from the clearing of
  its signal until the movement has passed clear of them; no switch is
  moved under a route.
- **S 28 Block working.** A train enters a block section only with the
  section's **Line Warrant**. The box at the far end issues the warrant when
  the section is clear and no other warrant for it is out; the box at the
  near end clears its starter only with the warrant in hand; the far box
  cancels the warrant when the train has arrived complete. One warrant, one
  train, one section.
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
- **D 20 Starting on a rise.** Hold the train on the train brake, apply
  power, release the brake as the traction takes up. Rolling back more than
  half a metre is an incident.
- **D 22 Parking brake.** Release it before moving (first thing after
  entering the cab); apply it before leaving the cab on a gradient and
  whenever the vehicle is stabled. Moving with it applied, or a vehicle
  moving with no direction set (a runaway), is an incident.
- **D 24 Neutral sections.** Shut off power at the section board and coast;
  take power again only after the resume board. Entering the neutral
  section with power applied is an incident.
- **D 26 Multiple working.** Two Class 1 cars coupled with pipe and control
  line connected work as one train from one cab, both pantographs up, both
  cars' motors answering the controller; the other car's cabs show the
  lights the leading cab calls for (head at the leading end, tail at the
  trailing end, nothing at coupled ends). Prove the brake after every
  coupling.
- **D 28 Splitting and joining.** To split: stop at the board, secure the
  cab, uncouple at the coupling (pipe first, then the coupler), set TAIL on
  the new rear cab of your portion, and return to your cab; the other
  portion's driver takes their cab. To join: the standing portion waits with
  its train brake applied; the arriving car is called on at shunting speed
  and makes contact at 2 km/h or less; its driver connects the pipe and
  control line; the train is proved from the leading cab before it leaves.
  Portions leave a station in the order they stand: the one nearest the exit
  first.

## 7. Rolling stock

**Class 1 motor car ("Lark").** Fleet 1001–1004; Duty 101 uses **1002**,
Duty 301 uses 1002 and, driven by a colleague, **1003**; Duty 401 uses all
four: 1002 and 1003 as the player's pair, 1004 and 1001 as the colleagues'.
Class 1 cars couple to each other and work in multiple (Rule D 26).
Length 22 m, mass 38 t, two cabs (A and B), doors on both sides, one
pantograph, two 150 kW motors, max tractive effort 45 kN, max speed 60 km/h.
Automatic air brake, max service deceleration about 1.0 m/s². Parking
brake worked from either cab, holding about half the full service force
(good for any grade on the Railway).

Gravity on 12‰ is 4.5 kN for the car and 11 kN for the loco and coach:
both climb easily, both roll away if left unbraked.

**Class 4 locomotive ("Heron").** Fleet 4001–4006; Duty 201 uses **4003**.
Length 16 m, mass 64 t, two cabs, one pantograph, 1200 kW, max tractive
effort 140 kN, max speed 90 km/h. Parking brake as the Class 1.

**Type C4 coach.** Fleet 5101–5120; Duty 201 uses **5107**. Length 20 m,
mass 30 t, 64 seats, doors both sides, automatic end lights (show TAIL at a
free end when part of a lit train), no cab.

**Couplers.** The Meridian automatic coupler: couples mechanically on
contact; brake pipe and control line are connected by hand at the coupling.

## 8. The driver's person

The player's driver is a person who is *somewhere*: in Cab A, in Cab B, on
the ground beside the train, or at a coupling. Walking takes about 1.2 m/s.
Actions that need a place (change ends, connect/uncouple) need the driver
there. Colleagues driving other trains are not modelled as persons; they
work their cabs and change ends without walking.

## 9. Cab controls (both classes)

| control | positions | key |
|---------|-----------|-----|
| Reverser | Reverse · Neutral · Forward (relative to this cab) | `R` / `N` / `F` |
| Power controller | 0 – 4 notches | `W` up, `S` down |
| Train brake | Release · 1 · 2 · 3 · Full · Emergency | `A` release, `D` apply, `Space` emergency |
| Parking brake | Off · On | `B` |
| Pantograph | Down · Up | `P` |
| Lights (this end) | Off · Tail · Head | `L` cycles |
| Doors | Closed · Open | `O` |
| Horn | press: one short blast · hold 1.5 s or more: one long blast | `H` |
| Brake test | run continuity test | button |
| Leave / enter cab | — | `C` |

Indicators: speed (km/h), brake pipe pressure (bar; 5.0 released, 3.5 full
service, 0 emergency), gradient ahead (per mille, rising or falling), parking
brake, height above Ashgrove, line voltage present (dark through a neutral
section), doors, next signal or board ahead with distance (distants named
with their home, switches with how they lie), current speed limit, clock.

## 10. Duties

**Duty 101 — Ashgrove–Wending shuttle.** Car 1002 stabled at Ashgrove
platform, pantograph down, lights off, doors closed, parking brake on.
Sim starts 05:45. Booked: 06:00 AG dep → 06:06 WD arr; 06:12 WD dep → 06:18 AG
arr; 06:24 AG dep → 06:30 WD arr; 06:36 WD dep → 06:42 AG arr; then stable
(pantograph down, lights off, parking brake on).

**Duty 201 — Ashgrove–Wending with run-round.** Loco 4003 coupled to coach
5107 on Ashgrove track 1, loco at the Down (main line) end, stabled.
Sim starts 06:45. Booked: 07:00 AG dep → 07:07 WD arr; run round using the
north stub; 07:30 WD dep → 07:37 AG arr; run round; duty complete when
coupled, brake proved, and stabled (pantograph down, parking brake on) at
Ashgrove before 08:00.

**Duty 301 — The crossing.** Car 1002 stabled at Ashgrove track 1; car 1003
stabled at Coldwater track 1 with R. Farrow. Sim starts 07:45. Working
timetable (Book T; Down trains odd, Up trains even):

| train | car | route | times |
|-------|-----|-------|-------|
| 3 | 1002 | Ashgrove–Coldwater | AG 08:00 → WD 08:07/08:12 (platform 1) → CW 08:21 |
| 4 | 1003 | Coldwater–Ashgrove | CW 08:00 → WD 08:08/08:12 (platform 2) → AG 08:21 |
| 5 | 1003 | Ashgrove–Coldwater | AG 08:40 → WD 08:49/08:53 (platform 1) → CW 09:01 |
| 6 | 1002 | Coldwater–Ashgrove | CW 08:40 → WD 08:49/08:53 (platform 2) → AG 09:01 |

Trains 3 and 4 cross at Wending at 08:12, trains 5 and 6 at 08:53. Duty
complete when 1002 is stabled at Ashgrove.

**Duty 401 — The junction.** Cars 1002 and 1003 coupled on Ashgrove track 1
(1002 at the Down end, the player's; 1003 with R. Farrow riding); 1004 at
Coldwater with E. Hale; 1001 at Fernhollow with W. Penrose. Sim starts
09:45. Working timetable (branch trains 31–34):

| train | cars | route | times |
|-------|------|-------|-------|
| 7 | 1002+1003 | Ashgrove–Wending | AG 10:00 → WD 10:07 (platform 1); split |
| 7 | 1002 | Wending–Coldwater | WD 10:14 → CW 10:23 |
| 31 | 1003 | Wending–Fernhollow | WD 10:16 → FH 10:24 |
| 8 | 1004 | Coldwater–Wending | CW 10:00 → WD 10:08 (platform 2) |
| 32 | 1001 | Fernhollow–Wending | FH 10:02 → WD 10:11 (platform 2, called on, joins 1004) |
| 8 | 1004+1001 | Wending–Ashgrove | WD 10:18 → AG 10:27 |
| 9 | 1004+1001 | Ashgrove–Wending | AG 10:40 → WD 10:47 (platform 1); split |
| 33 | 1001 | Wending–Fernhollow | WD 10:54 → FH 11:02 (1001 stands at the Down end, leaves first) |
| 9 | 1004 | Wending–Coldwater | WD 10:56 → CW 11:05 |
| 10 | 1002 | Coldwater–Wending | CW 10:40 → WD 10:49 (platform 2) |
| 34 | 1003 | Fernhollow–Wending | FH 10:44 → WD 10:53 (platform 2, called on, joins 1002) |
| 10 | 1002+1003 | Wending–Ashgrove | WD 11:00 → AG 11:09 |

Duty complete when the pair is stabled at Ashgrove.

## 11. Incident Book entries (what the rules engine records)

Early departure · Moved with doors open · Doors opened away from platform ·
Overspeed (with limit and speed) · Stop board overrun · Stopped short of
board (> 3 m) · Incorrect lights on the main line · No horn before moving ·
Crossing passed without a blast · Signal passed at danger · Limit of Shunt
passed · Ran through a switch set against the move (Rule S 22) · Rough
coupling (speed) · Brake not proved before departure · Buffer stop struck ·
Uncoupled with the brake not fully applied · Rolled back on the gradient ·
Ran away (moved with no direction set) · Moved with the parking brake
applied · Power through the neutral section · Collision · Emergency brake
used (noted, not a fault).

A colleague's incidents are not written in the player's book.

Book I adds identity rules I 10–I 38 (name, mark, colour, type, livery,
signage, voice, document system); they are not enforced by the sim.
