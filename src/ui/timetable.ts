/**
 * The timetable view: the whole day as a train graph (time against distance), the working
 * timetable as a table, the crew diagrams and the stock working as timelines. Shown on its
 * own from the home page, or over a running duty, where it also draws what has actually
 * happened: the trains' recorded paths, the clock, and the actual times in the register.
 */
import { type Timetable, type Service, serviceOf } from "../traffic/timetable";
import { type Layout } from "../track/layouts";
import { World } from "../sim/world";
import { Box } from "../sim/duty";
import { parseTime, fmtTime } from "../core/util";

const C = { green: "#1F4B3F", deep: "#15362E", ivory: "#F4EFE3", paper: "#FBF8F0", red: "#C6321E", brass: "#B5913F", slate: "#8A96A0", chalk: "#D9D2C0", amber: "#D9A21B", lamp: "#2E9E5B", ink: "#1A1A1A" };
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const MONO = "'IBM Plex Mono', Menlo, monospace";
/** each car its own colour, the same everywhere in the view */
const VEHICLE_COLOURS: Record<string, string> = { "1001": C.amber, "1002": C.lamp, "1003": C.red, "1004": C.slate, "4003": C.green, "5107": C.brass };
const colourOf = (v: string) => VEHICLE_COLOURS[v] ?? C.ink;

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
const hm = (t: number) => fmtTime(t);

export type Tab = "graph" | "working" | "crew" | "stock";

/** where a call sits on the graph: which panel, and the kilometre on it (sheds a little before their station) */
interface GraphPlace { panel: "main" | "branch"; km: number }

export class TimetableView {
  root: HTMLElement;
  tt: Timetable;
  layout: Layout;
  world: World | null;
  tab: Tab = "graph";
  private canvas: HTMLCanvasElement | null = null;
  private t0: number;
  private t1: number;

  constructor(root: HTMLElement, tt: Timetable, layout: Layout, world: World | null) {
    this.root = root; this.tt = tt; this.layout = layout; this.world = world;
    this.t0 = parseTime(tt.start);
    let last = this.t0;
    for (const s of tt.services) for (const c of s.calls) for (const x of [c.arr, c.dep]) if (x) last = Math.max(last, parseTime(x));
    for (const d of tt.diagrams) last = Math.max(last, parseTime(d.signOff));
    this.t1 = Math.ceil((last + 15 * 60) / 3600) * 3600;
    root.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-tab]") as HTMLElement | null;
      if (b) { this.tab = b.dataset.tab as Tab; this.render(); }
    });
    this.render();
  }

  /* ---------- geography ---------- */

  private place(at: string, track: string): GraphPlace {
    const st = this.layout.stations.find((s) => s.code === at);
    const shed = this.layout.sheds.find((s) => s.station === at && s.roads.some((r) => r.track === track));
    if (shed) return { panel: "main", km: shed.mainKm - 0.25 };
    if (!st) return { panel: "main", km: 0 };
    const stop = st.stops.find((s) => s.track === track) ?? st.stops[0];
    const km = st.stops.length > 1 ? st.stops.reduce((a, s) => a + s.km, 0) / st.stops.length : stop.km;
    return { panel: stop.line === "branch" ? "branch" : "main", km };
  }
  /** a station's row on a panel, for the horizontal lines */
  private stationRows(panel: "main" | "branch"): { code: string; name: string; km: number }[] {
    const out: { code: string; name: string; km: number }[] = [];
    for (const st of this.layout.stations) {
      const s0 = st.stops[0];
      const onBranch = s0.line === "branch";
      if (panel === "branch") {
        if (onBranch) out.push({ code: st.code, name: st.name, km: st.stops.reduce((a, s) => a + s.km, 0) / st.stops.length });
        else if (this.layout.lines.branch && st.code === "WD") out.push({ code: "WD", name: st.name, km: 0 });
      } else if (!onBranch) out.push({ code: st.code, name: st.name, km: st.stops.reduce((a, s) => a + s.km, 0) / st.stops.length });
    }
    if (panel === "main") for (const sh of this.layout.sheds) out.push({ code: sh.id, name: sh.name, km: sh.mainKm - 0.25 });
    return out.sort((a, b) => a.km - b.km);
  }

  /* ---------- rendering ---------- */

  render() {
    const tabs = (["graph", "working", "crew", "stock"] as Tab[]).map((t) => `<button data-tab="${t}" class="${this.tab === t ? "on" : ""}">${t === "graph" ? "Train graph" : t === "working" ? "Working timetable" : t === "crew" ? "Crew diagrams" : "Stock working"}</button>`).join("");
    const body = this.tab === "graph" ? `<canvas class="ttgraph"></canvas>` : this.tab === "working" ? this.renderWorking() : this.tab === "crew" ? this.renderCrew() : this.renderStock();
    this.root.innerHTML = `<div class="tttabs">${tabs}<span class="ttname">${esc(this.tt.name)}</span></div><div class="ttbody">${body}</div>`;
    this.canvas = this.root.querySelector("canvas");
    if (this.canvas) this.draw();
  }

  /** the graph, redrawn each frame while a duty runs under it */
  draw() {
    const cv = this.canvas; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w === 0) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.deep; ctx.fillRect(0, 0, w, h);
    const L = 92, R = 16, T = 26, B = 22;
    const X = (t: number) => L + ((t - this.t0) / (this.t1 - this.t0)) * (w - L - R);
    // panels: the main line, then the branch below, heights by their lengths
    const main = this.layout.lines.main, branch = this.layout.lines.branch;
    const shedPad = this.layout.sheds.length ? 0.3 : 0;
    const mainSpan = main.kmMax + shedPad, branchSpan = branch ? branch.kmMax : 0;
    const gap = branch ? 26 : 0;
    const usable = h - T - B - gap;
    const mainH = branch ? usable * (mainSpan / (mainSpan + branchSpan * 0.9)) : usable;
    const branchH = usable - mainH;
    const yMain = (km: number) => T + ((km + shedPad) / mainSpan) * mainH;
    const yBranch = (km: number) => T + mainH + gap + (km / branchSpan) * branchH;
    const Y = (p: GraphPlace) => (p.panel === "branch" ? yBranch(p.km) : yMain(p.km));
    // the hours
    ctx.font = `600 11px ${DISPLAY}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let t = Math.ceil(this.t0 / 900) * 900; t <= this.t1; t += 900) {
      const hour = t % 3600 === 0;
      ctx.strokeStyle = hour ? "rgba(244,239,227,.35)" : "rgba(244,239,227,.12)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(t), T - 4); ctx.lineTo(X(t), h - B); ctx.stroke();
      if (hour) { ctx.fillStyle = C.ivory; ctx.fillText(fmtTime(t), X(t), 6); }
    }
    // the stations
    ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = `600 11px ${DISPLAY}`;
    for (const panel of ["main", "branch"] as const) {
      if (panel === "branch" && !branch) continue;
      for (const st of this.stationRows(panel)) {
        const y = Y({ panel, km: st.km });
        ctx.strokeStyle = "rgba(244,239,227,.5)"; ctx.lineWidth = st.code.length > 2 ? 0.6 : 1.2;
        ctx.setLineDash(st.code.length > 2 ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = st.code.length > 2 ? C.chalk : C.ivory;
        ctx.fillText(st.name.toUpperCase(), L - 8, y);
      }
    }
    if (branch) { ctx.fillStyle = C.chalk; ctx.font = `500 10px ${DISPLAY}`; ctx.textAlign = "left"; ctx.fillText("THE BRANCH", L, T + mainH + gap / 2); }
    // the booked paths: one polyline per service, in its car's colour; a coupled portion dashed beside its train
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const s of this.tt.services) {
      // a call at the junction belongs to the panel of the leg it is part of: arriving off the branch it sits on the
      // branch row, leaving for the main line on the main row, and the line breaks between the two
      const panels = s.calls.map((c) => this.place(c.at, c.track).panel);
      const isJunction = (i: number) => this.layout.lines.branch && s.calls[i].at === "WD";
      const pts: { x: number; y: number; brk?: boolean }[] = [];
      for (let i = 0; i < s.calls.length; i++) {
        const c = s.calls[i];
        const p = this.place(c.at, c.track);
        const arrPanel = isJunction(i) && i > 0 ? panels[i - 1] : p.panel;
        const depPanel = isJunction(i) && i + 1 < s.calls.length ? panels[i + 1] : p.panel;
        const kmOn = (panel: "main" | "branch") => (panel === p.panel ? p.km : 0);
        if (c.arr) pts.push({ x: X(parseTime(c.arr)), y: Y({ panel: arrPanel, km: kmOn(arrPanel) }) });
        if (c.dep) pts.push({ x: X(parseTime(c.dep)), y: Y({ panel: depPanel, km: kmOn(depPanel) }), brk: !!c.arr && arrPanel !== depPanel });
      }
      if (pts.length < 2) continue;
      const coupled = !!s.coupledTo;
      ctx.strokeStyle = colourOf(s.vehicle); ctx.lineWidth = s.kind === "passenger" ? 2 : 1.4;
      ctx.setLineDash(s.kind === "shunt" ? [2, 3] : s.kind === "empty" ? [6, 4] : []);
      if (coupled) { ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4; }
      ctx.beginPath();
      pts.forEach((p, i) => (i && !p.brk ? ctx.lineTo(p.x, p.y + (coupled ? 2.5 : 0)) : ctx.moveTo(p.x, p.y + (coupled ? 2.5 : 0))));
      ctx.stroke(); ctx.setLineDash([]);
      // the number at the start of the first run
      const a = pts[0], b = pts.find((p) => p.y !== pts[0].y) ?? pts[1];
      ctx.fillStyle = colourOf(s.vehicle); ctx.font = `600 10px ${MONO}`; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      const up = b.y < a.y;
      ctx.fillText(s.number, a.x + 2, up ? a.y - 1 : a.y + 11);
    }
    // what has actually happened: the recorded paths, and the clock
    const wld = this.world;
    if (wld) {
      for (const [num, trace] of wld.trace) {
        ctx.strokeStyle = colourOf(num); ctx.lineWidth = 4; ctx.globalAlpha = 0.35;
        ctx.beginPath();
        let pen = false;
        for (const p of trace) {
          const gp = this.tracePlace(p.line, p.km, p.track);
          if (!gp) { pen = false; continue; }
          const x = X(p.t), y = Y(gp);
          if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      const xNow = X(wld.time);
      ctx.strokeStyle = C.brass; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xNow, T - 4); ctx.lineTo(xNow, h - B); ctx.stroke();
      ctx.fillStyle = C.brass; ctx.font = `600 11px ${MONO}`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(fmtTime(wld.time), xNow, h - B + 4);
      for (const v of wld.vehicles) {
        const gp = this.tracePlace(v.pos.edge.line, (v.pos.edge.kmA + v.pos.edge.kmDir * v.pos.s / 1000), v.pos.edge.track);
        if (!gp) continue;
        ctx.fillStyle = colourOf(v.number); ctx.strokeStyle = C.ivory; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(xNow, Y(gp), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // the key
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = `600 10px ${DISPLAY}`;
    let kx = L;
    const vehicles = [...new Set(this.tt.services.map((s) => s.vehicle))].sort();
    for (const v of vehicles) {
      ctx.fillStyle = colourOf(v); ctx.fillRect(kx, h - B + 6, 14, 3);
      ctx.fillStyle = C.ivory; ctx.fillText(v, kx + 18, h - B + 8);
      kx += 52;
    }
    ctx.fillStyle = C.chalk; ctx.fillText("solid: passenger · long dash: empty · dots: shunt · fine dash: coupled portion · wide band: as run", kx + 10, h - B + 8);
  }

  /** a recorded position on the graph: a shed sits on the main panel just before its station */
  private tracePlace(line: string, km: number, track: string): GraphPlace | null {
    const shed = this.layout.sheds.find((s) => s.line === line);
    if (shed) return { panel: "main", km: shed.mainKm - 0.1 - km * 0.5 };
    if (line === "branch") return { panel: "branch", km };
    if (line === "main") return { panel: "main", km };
    void track;
    return null;
  }

  /* ---------- the tables ---------- */

  /** the actual times a running day has written for a call, from the boxes' registers */
  private actual(s: Service, callIdx: number): { arr?: number; dep?: number } {
    const w = this.world; if (!w) return {};
    const c = s.calls[callIdx];
    const box = w.boxes.find((b) => b.code === c.at); if (!box) return {};
    const train = s.coupledTo && callIdx < s.calls.findIndex((x) => x.at === s.coupledTo!.until) ? serviceOf(this.tt, s.coupledTo.service).vehicle : s.vehicle;
    const booked = c.arr ? parseTime(c.arr) : c.dep ? parseTime(c.dep) : -1;
    const m = box.register.find((x) => x.visit.train === train && Math.abs(Box.timeOf(x.visit) - booked) < 1);
    if (!m) return {};
    return { arr: m.arrivedAt, dep: m.departedAt };
  }

  private renderWorking(): string {
    const live = !!this.world;
    const rows = this.tt.services.map((s) => {
      const calls = s.calls.map((c, i) => {
        const a = live ? this.actual(s, i) : {};
        const place = `${c.at} ${/^sh\d/.test(c.track) ? "shed " + c.track.slice(2) : c.track}`;
        const arr = c.arr ? `${c.arr}${a.arr !== undefined ? `<i>${hm(a.arr)}</i>` : ""}` : "";
        const dep = c.dep ? `${c.dep}${a.dep !== undefined ? `<i>${hm(a.dep)}</i>` : ""}` : "";
        return `<span class="call"><b>${esc(place)}</b> ${arr}${arr && dep ? " · " : ""}${dep}</span>`;
      }).join("<span class='sep'>→</span>");
      const notes = [s.coupledTo ? `coupled in ${s.coupledTo.service} to ${s.coupledTo.until}` : "", s.joins ? `joins ${s.joins} on arrival` : ""].filter(Boolean).join("; ");
      return `<tr><td class="num" style="color:${colourOf(s.vehicle)}">${esc(s.number)}</td><td>${s.kind}</td><td>${s.vehicle}</td><td class="calls">${calls}</td><td class="notes">${esc(notes)}</td></tr>`;
    }).join("");
    return `<div class="ttwork"><table><thead><tr><th>Train</th><th>Kind</th><th>Car</th><th>Calls${live ? " <small>(booked, <i>actual</i>)</small>" : ""}</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /** a timeline row: blocks positioned by time */
  private timeline(label: string, sub: string, blocks: { t0: number; t1: number; text: string; colour: string; hatched?: boolean; title?: string }[], marks: { t: number; text: string }[] = []): string {
    const span = this.t1 - this.t0;
    const pct = (t: number) => `${(((t - this.t0) / span) * 100).toFixed(2)}%`;
    const bs = blocks.map((b) => `<div class="blk ${b.hatched ? "hatched" : ""}" style="left:${pct(b.t0)};width:${(((b.t1 - b.t0) / span) * 100).toFixed(2)}%;--c:${b.colour}" title="${esc(b.title ?? b.text)}">${esc(b.text)}</div>`).join("");
    const ms = marks.map((m) => `<div class="mark" style="left:${pct(m.t)}" title="${esc(m.text)}"></div>`).join("");
    const now = this.world ? `<div class="now" style="left:${pct(this.world.time)}"></div>` : "";
    return `<div class="ttrow"><div class="ttlabel"><b>${esc(label)}</b><small>${esc(sub)}</small></div><div class="ttlane">${bs}${ms}${now}</div></div>`;
  }
  private hoursHeader(): string {
    const span = this.t1 - this.t0;
    let out = "";
    for (let t = Math.ceil(this.t0 / 3600) * 3600; t <= this.t1; t += 3600) out += `<div class="hr" style="left:${(((t - this.t0) / span) * 100).toFixed(2)}%">${fmtTime(t)}</div>`;
    return `<div class="ttrow head"><div class="ttlabel"></div><div class="ttlane">${out}</div></div>`;
  }

  private renderCrew(): string {
    const rows = this.tt.diagrams.map((d) => {
      const blocks: { t0: number; t1: number; text: string; colour: string; hatched?: boolean; title?: string }[] = [];
      for (const num of d.turns) {
        const s = serviceOf(this.tt, num);
        const first = s.calls[0], last = s.calls[s.calls.length - 1];
        const t0 = parseTime(first.dep ?? first.arr!), t1 = parseTime(last.arr ?? last.dep!);
        if (s.coupledTo) {
          const untilIdx = s.calls.findIndex((c) => c.at === s.coupledTo!.until);
          const tu = parseTime(s.calls[untilIdx].arr ?? s.calls[untilIdx].dep!);
          blocks.push({ t0, t1: tu, text: `rides in ${s.coupledTo.service}`, colour: colourOf(serviceOf(this.tt, s.coupledTo.service).vehicle), hatched: true, title: `rides in train ${s.coupledTo.service} to ${s.coupledTo.until}` });
          const td = parseTime(s.calls[untilIdx].dep ?? s.calls[untilIdx].arr!);
          blocks.push({ t0: td, t1, text: s.number, colour: colourOf(s.vehicle), title: `${s.number}: ${s.coupledTo.until} → ${last.at}` });
        } else blocks.push({ t0, t1, text: s.number, colour: colourOf(s.vehicle), title: `${s.number}: ${first.at} ${first.dep} → ${last.at} ${last.arr}` });
        if (s.joins) {
          // then rides in the joined train to wherever it ends
          const lead = serviceOf(this.tt, s.joins);
          const end = lead.calls[lead.calls.length - 1];
          blocks.push({ t0: t1, t1: parseTime(end.arr ?? end.dep!), text: `rides in ${lead.number}`, colour: colourOf(lead.vehicle), hatched: true, title: `rides in train ${lead.number} to ${end.at}` });
        }
      }
      const marks = [{ t: parseTime(d.signOn), text: `signs on ${d.signOn}` }, { t: parseTime(d.signOff), text: `signs off ${d.signOff}` }];
      return this.timeline(d.driver, `${d.vehicle} · on ${d.signOn} · off ${d.signOff}${d.turns.length ? "" : " · spare"}`, blocks, marks);
    }).join("");
    return `<div class="tttimeline">${this.hoursHeader()}${rows}<p class="ttnote">Solid blocks are turns driven, hatched ones ridden; the ticks are booking on and off.${this.world ? " The brass line is the clock." : ""}</p></div>`;
  }

  private renderStock(): string {
    const vehicles = [...new Set([...this.tt.stabling.flatMap((s) => s.vehicles), ...this.tt.services.map((s) => s.vehicle)])].sort();
    const rows = vehicles.map((v) => {
      const blocks: { t0: number; t1: number; text: string; colour: string; hatched?: boolean; title?: string }[] = [];
      for (const s of this.tt.services) {
        if (s.vehicle !== v) continue;
        const first = s.calls[0], last = s.calls[s.calls.length - 1];
        blocks.push({ t0: parseTime(first.dep ?? first.arr!), t1: parseTime(last.arr ?? last.dep!), text: s.number, colour: colourOf(v), hatched: s.kind !== "passenger", title: `${s.number} (${s.kind}): ${first.at} ${first.dep ?? ""} → ${last.at} ${last.arr ?? ""}` });
      }
      const stab = this.tt.stabling.find((s) => s.vehicles.includes(v));
      const sub = stab ? `dawn: ${stab.station} shed road ${stab.track.slice(2)}${stab.coupled ? " (coupled)" : ""}` : "";
      return this.timeline(v, sub, blocks);
    }).join("");
    return `<div class="tttimeline">${this.hoursHeader()}${rows}<p class="ttnote">Solid blocks are passenger trains, hatched ones empties and shunts.</p></div>`;
  }
}
