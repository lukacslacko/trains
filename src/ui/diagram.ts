import { World } from "../sim/world";
import { kmOf } from "../track/graph";

const C = { green: "#1F4B3F", deep: "#15362E", ivory: "#F4EFE3", red: "#C6321E", brass: "#B5913F", slate: "#8A96A0", chalk: "#D9D2C0", amber: "#D9A21B", lamp: "#2E9E5B", white: "#fff" };
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const MONO = "'IBM Plex Mono', Menlo, monospace";

/** The signal-box style line diagram: whole line, stations expanded, signals and the train. */
export class LineDiagram {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; this.ctx = canvas.getContext("2d")!; }

  private x(km: number, w: number, zones: [number, number, number][]): number {
    const pad = 24;
    let x0 = pad, acc = 0;
    const W = w - pad * 2;
    for (const [a, b, share] of zones) {
      if (km <= b || acc + share >= 1 - 1e-9) {
        const t = Math.max(0, Math.min(1, (km - a) / (b - a)));
        return x0 + t * share * W;
      }
      x0 += share * W; acc += share;
    }
    return x0;
  }

  draw(world: World) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.deep; ctx.fillRect(0, 0, w, h);
    const zones = world.layout.zones;
    const X = (km: number) => this.x(km, w, zones);
    const y0 = 46;                 // track 1 / single line
    const yT2 = y0 - 16;           // track 2
    const yLab = 15;               // station names along the top
    // the branch: its own ribbon below the main line, from the junction, at the same scale
    const branch = world.layout.lines.branch;
    const yB = y0 + 104;
    const pxPerKm = X(1) - X(0);
    const XB = (km: number) => (branch ? X(branch.junctionKm ?? 0) + km * pxPerKm : 0);
    // sheds: each road a short stub below its station's headshunt, laid out leftwards from the shed switch
    const sheds = world.layout.sheds;
    const shedOf = (line: string) => sheds.find((sh) => sh.line === line);
    const yShed = (line: string, track: string) => { const sh = shedOf(line); const i = sh ? Math.max(0, sh.roads.findIndex((r) => r.track === track)) : 0; return y0 + 24 + i * 7; };
    const XS = (line: string, km: number) => { const sh = shedOf(line); return sh ? X(sh.mainKm) - km * pxPerKm * 1.6 : 0; };
    const Xof = (line: string, km: number) => (line === "branch" ? XB(km) : shedOf(line) ? XS(line, km) : X(km));
    const yOfLine = (line: string, track: string) => (line === "branch" ? yB : shedOf(line) ? yShed(line, track) : track === "2" ? yT2 : y0);
    for (const sh of sheds) {
      ctx.lineWidth = 2; ctx.lineCap = "round";
      for (const r of sh.roads) {
        const kmA = r.edge.kmA, kmB = r.edge.kmA + r.edge.length / 1000;
        const y = yShed(sh.line, r.track);
        ctx.strokeStyle = "rgba(244,239,227,.6)";
        ctx.beginPath(); ctx.moveTo(XS(sh.line, kmA), y); ctx.lineTo(XS(sh.line, kmB), y); ctx.stroke();
      }
      ctx.fillStyle = C.chalk; ctx.font = `600 10px ${DISPLAY}`; ctx.textAlign = "left";
      ctx.fillText("SHED", X(sh.mainKm) + 6, y0 + 28 + (sh.roads.length - 1) * 3.5);
    }

    // edges: draw by track with schematic y
    const yOf = (track: string) => (track === "2" ? yT2 : y0);
    ctx.lineWidth = 2; ctx.strokeStyle = C.ivory; ctx.lineCap = "round";
    if (branch) {
      // the junction connector and the branch ribbon
      ctx.beginPath(); ctx.moveTo(X(branch.junctionKm ?? 0), y0); ctx.lineTo(XB(0.1), yB); ctx.lineTo(XB(branch.kmMax), yB); ctx.stroke();
    }
    for (const e of world.layout.graph.edges) {
      if (e.line === "branch" || shedOf(e.line)) continue;
      const kmA = e.kmA, kmB = e.kmA + (e.kmDir * e.length) / 1000;
      if (e.track === "sw") {
        // a switch branch: drawn faint when the switch is set the other way
        const nodeA = e.a, nodeB = e.b;
        const sw = nodeA.switch ?? nodeB.switch;
        const set = sw ? (sw.state === "normal" ? sw.normal : sw.reverse) === e : true;
        const ya = nodeA.switch ? y0 : (Math.abs(nodeA.y) > 1 ? yT2 : y0);
        const yb = nodeB.switch ? y0 : (Math.abs(nodeB.y) > 1 ? yT2 : y0);
        ctx.strokeStyle = set ? C.ivory : "rgba(244,239,227,.3)";
        ctx.beginPath(); ctx.moveTo(X(kmA), ya); ctx.lineTo(X(kmB), yb); ctx.stroke();
        ctx.strokeStyle = C.ivory;
        continue;
      }
      ctx.beginPath(); ctx.moveTo(X(kmA), yOf(e.track)); ctx.lineTo(X(kmB), yOf(e.track)); ctx.stroke();
    }
    // occupancy in brass
    ctx.lineWidth = 4; ctx.strokeStyle = C.brass;
    for (const v of world.vehicles) {
      const a = kmOf(v.pos), b = kmOf(v.posB);
      const track = v.pos.edge.track, line = v.pos.edge.line;
      const y = line === "branch" ? yB : shedOf(line) ? yShed(line, track === "shl" ? v.posB.edge.track : track) : track === "2" ? yT2 : (track === "sw" ? (Math.abs(v.pos.edge.a.y) > 1 || Math.abs(v.pos.edge.b.y) > 1 ? (y0 + yT2) / 2 : y0) : y0);
      ctx.beginPath(); ctx.moveTo(Xof(line, Math.min(a, b)), y); ctx.lineTo(Xof(line, Math.max(a, b)), y); ctx.stroke();
    }
    // platforms
    ctx.fillStyle = "rgba(244,239,227,.25)";
    for (const p of world.layout.platforms) {
      const line = p.track.startsWith("b") ? "branch" : "main";
      const yy = line === "branch" ? yB : y0;
      ctx.fillRect(Xof(line, p.kmFrom), yy + 3, Xof(line, p.kmTo) - Xof(line, p.kmFrom), 3);
    }
    // stations
    ctx.fillStyle = C.ivory; ctx.font = `600 13px ${DISPLAY}`; ctx.textAlign = "center";
    for (const st of world.stations) {
      const s0 = st.stops[0], p = s0.platform;
      const yy = s0.line === "branch" ? yB - 31 : yLab;
      const xm = (Xof(s0.line, p.kmFrom) + Xof(s0.line, p.kmTo)) / 2;
      ctx.fillText(st.name.toUpperCase(), xm, yy);
      if (st.baton.size > 0) { ctx.fillStyle = C.lamp; ctx.beginPath(); ctx.arc(xm + 50, yy - 4, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = C.ivory; }
    }
    // crossings and neutral sections
    for (const x of world.layout.crossings) { ctx.strokeStyle = C.chalk; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(x.km), y0 - 5); ctx.lineTo(X(x.km), y0 + 5); ctx.stroke(); }
    for (const n of world.layout.neutral) { ctx.strokeStyle = C.brass; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(n.kmFrom), y0 - 6); ctx.lineTo(X(n.kmTo), y0 - 6); ctx.stroke(); }
    // signals and boards
    for (const o of world.layout.objects) {
      const km = kmOf(o.pos);
      const track = o.pos.edge.track, line = o.pos.edge.line;
      const y = yOfLine(line, track);
      const facingDown = o.pos.edge.kmDir * o.pos.dir === 1;
      const side = facingDown ? -1 : 1; // Down-facing above the line, Up-facing below
      const x = Xof(line, km);
      if (o.kind === "board" && o.board === "switchIndicator") continue;
      if (o.kind === "signal") {
        const col = o.aspect === "clear" ? C.lamp : o.aspect === "caution" ? C.amber : o.aspect === "shunt" ? C.white : C.red;
        const yy = y + side * (track === "2" ? 8 : 12);
        ctx.strokeStyle = C.slate; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, yy); ctx.stroke();
        if (o.type === "distant") {
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, yy - 4); ctx.lineTo(x + 3.5, yy); ctx.lineTo(x, yy + 4); ctx.lineTo(x - 3.5, yy); ctx.closePath(); ctx.fill();
          continue; // no label: it repeats its home
        } else if (o.type === "main") {
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, yy, 3.5, 0, Math.PI * 2); ctx.fill();
          if (o.subsidiary && o.aspect === "shunt") { ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(x, yy + side * 6, 1.5, 0, Math.PI * 2); ctx.fill(); }
        } else {
          ctx.fillStyle = "#000"; ctx.fillRect(x - 4, yy - 2.5, 8, 5);
          ctx.fillStyle = C.white;
          const dy = o.aspect === "shunt" ? 1.2 : 0;
          ctx.beginPath(); ctx.arc(x - 2, yy + dy, 1, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 2, yy - dy, 1, 0, Math.PI * 2); ctx.fill();
        }
        // main signals are named beside the head, on the side away from the direction they face; ground signals stay unnamed here
        if (o.type === "main") {
          ctx.fillStyle = C.chalk; ctx.font = `600 9px ${DISPLAY}`; ctx.textAlign = facingDown ? "right" : "left";
          ctx.fillText(o.id.replace(" ", ""), facingDown ? x - 7 : x + 7, yy + 3);
        }
        // direction tick
        ctx.fillStyle = C.slate;
        ctx.beginPath(); const dx = facingDown ? 6 : -6; ctx.moveTo(x + dx, yy); ctx.lineTo(x + dx * 0.4, yy - 2.5); ctx.lineTo(x + dx * 0.4, yy + 2.5); ctx.fill();
      } else if (o.board === "stop") {
        ctx.fillStyle = C.white; ctx.fillRect(x - 1.5, y - 8, 3, 6);
        ctx.fillStyle = "#000"; ctx.fillRect(x - 1.5, y - 5.6, 3, 1.4);
      } else if (o.board === "limitOfShunt") {
        ctx.fillStyle = C.red; ctx.fillRect(x - 1.5, y + side * 4 - 3, 3, 6);
      } else if (o.board === "speed") {
        // speed boards are read off the speed ribbon below the line; mark the board's place with a tick on the line
        ctx.strokeStyle = C.chalk; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
      } else if (o.board === "speedAdvance") {
        const yy = y + side * 12;
        ctx.strokeStyle = C.chalk; ctx.lineWidth = 1; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(x, yy - 5); ctx.lineTo(x + 4.5, yy + 3); ctx.lineTo(x - 4.5, yy + 3); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = C.chalk; ctx.font = `600 9px ${DISPLAY}`; ctx.textAlign = facingDown ? "right" : "left";
        ctx.fillText(String(o.value), facingDown ? x - 7 : x + 7, yy + 3);
      } else if (o.board === "buffer") {
        ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      }
    }
    // speed ribbon: the limit in force along each stretch, boundaries at the speed boards
    ctx.strokeStyle = C.slate; ctx.lineWidth = 1; ctx.fillStyle = C.chalk; ctx.font = `8px ${MONO}`; ctx.textAlign = "center";
    for (const [a, b, lim] of world.layout.speedZones) {
      const xa = X(a), xb = X(b);
      ctx.beginPath(); ctx.moveTo(xa, y0 + 18); ctx.lineTo(xa, y0 + 25); ctx.moveTo(xb, y0 + 18); ctx.lineTo(xb, y0 + 25); ctx.stroke();
      ctx.fillText(`${lim}`, (xa + xb) / 2, y0 + 25);
    }
    // gradient profile: height above Ashgrove, exaggerated, with the grade of each section
    {
      const top = y0 + 34, bottom = y0 + 52;
      const hmax = Math.max(1, world.layout.elevationAt(world.layout.kmMax));
      const yOfH = (h: number) => bottom - (h / hmax) * (bottom - top);
      ctx.strokeStyle = C.brass; ctx.lineWidth = 1.2; ctx.lineJoin = "round";
      ctx.beginPath();
      const pr = world.layout.profile;
      ctx.moveTo(X(pr[0][0]), yOfH(world.layout.elevationAt(pr[0][0])));
      for (const [, b] of pr) ctx.lineTo(X(b), yOfH(world.layout.elevationAt(b)));
      ctx.stroke();
      ctx.fillStyle = C.chalk; ctx.font = `8px ${MONO}`; ctx.textAlign = "center";
      for (const [a, b, g] of pr) {
        const xm = (X(a) + X(b)) / 2, ym = yOfH((world.layout.elevationAt(a) + world.layout.elevationAt(b)) / 2);
        ctx.fillText(g === 0 ? "L" : `${g}‰`, xm, ym - 3);
      }
      ctx.strokeStyle = C.slate; ctx.lineWidth = 1;
      for (let i = 1; i < pr.length; i++) { const x = X(pr[i][0]); ctx.beginPath(); ctx.moveTo(x, top - 2); ctx.lineTo(x, bottom + 2); ctx.stroke(); }
    }
    // hectometre ticks and kilometre numerals along the bottom
    ctx.strokeStyle = C.slate; ctx.lineWidth = 1; ctx.fillStyle = C.chalk; ctx.font = `9px ${MONO}`; ctx.textAlign = "center";
    for (const p of world.layout.posts) {
      const x = Xof(p.line, p.km);
      const tall = p.major ? 8 : Math.round(p.km * 10) % 5 === 0 ? 5 : 3;
      const base = p.line === "branch" ? yB + 8 : y0 + 56;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base + tall); ctx.stroke();
      if (p.major) ctx.fillText(p.line === "branch" ? `F ${p.label}` : `km ${p.label}`, x, base + 16);
    }
    // the player: a brass ring on the line at their train, or at their box
    if (world.driver.kind === "box") {
      const stop = world.station(world.driver.code).stops[0];
      ctx.fillStyle = C.ivory; ctx.strokeStyle = C.brass; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Xof(stop.line, stop.km), stop.line === "branch" ? yB : y0, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {
      const dv = world.driver.kind === "cab" ? world.driver.vehicle : world.trainVehicle;
      const dLine = dv.pos.edge.line, dkm = kmOf(dv.pos);
      ctx.fillStyle = C.ivory; ctx.strokeStyle = C.brass; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Xof(dLine, dkm), dLine === "branch" ? yB : y0, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // direction, in the gap between the last two stations' names
    const stns = world.stations;
    const gapKm = stns.length >= 2 ? (stns[stns.length - 2].stops[0].km + stns[stns.length - 1].stops[0].km) / 2 : world.layout.kmMax / 2;
    ctx.fillStyle = C.chalk; ctx.font = `600 11px ${DISPLAY}`; ctx.textAlign = "center";
    ctx.fillText("DOWN →", X(gapKm), yLab);
  }
}
