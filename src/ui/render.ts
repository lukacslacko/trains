import { World } from "../sim/world";
import { type Edge, type Pt, type Switch, worldPoint, pointAt, tangentAt } from "../track/graph";
import { type Signal, type Board } from "../track/layouts";
import { type Vehicle, type End } from "../stock/vehicles";

const C = { green: "#1F4B3F", ivory: "#F4EFE3", paper: "#FBF8F0", red: "#C6321E", brass: "#B5913F", ink: "#1A1A1A", slate: "#4A5560", chalk: "#D9D2C0", amber: "#D9A21B", lamp: "#2E9E5B", white: "#FFFFFF" };
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";

/** A label on a translucent ivory plate, so it reads over rails, sleepers and platforms. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: CanvasTextAlign = "center", color = C.ink, weight = 600) {
  ctx.font = `${weight} ${size}px ${DISPLAY}`;
  ctx.textAlign = align;
  const w = ctx.measureText(text).width + size * 0.6, h = size * 1.15;
  const x0 = align === "center" ? x - w / 2 : align === "left" ? x - size * 0.3 : x - w + size * 0.3;
  ctx.fillStyle = "rgba(251,248,240,.86)";
  ctx.beginPath(); ctx.roundRect(x0, y - h * 0.78, w, h, size * 0.2); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export class Camera {
  scale = 6;          // px per metre
  cx = 0; cy = 0;     // world centre
  follow = true;
}

export class WorldRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cam = new Camera();
  private dragging: { x: number; y: number; cx: number; cy: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      this.cam.scale = Math.max(0.6, Math.min(16, this.cam.scale * f));
    }, { passive: false });
    canvas.addEventListener("mousedown", (e) => { this.dragging = { x: e.clientX, y: e.clientY, cx: this.cam.cx, cy: this.cam.cy }; });
    window.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      this.cam.follow = false;
      this.cam.cx = this.dragging.cx - (e.clientX - this.dragging.x) / this.cam.scale;
      this.cam.cy = this.dragging.cy - (e.clientY - this.dragging.y) / this.cam.scale;
    });
    window.addEventListener("mouseup", () => { this.dragging = null; });
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    return { w, h, dpr };
  }

  draw(world: World) {
    const { w, h, dpr } = this.resize();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.ivory;
    ctx.fillRect(0, 0, w, h);

    if (this.cam.follow) {
      const p = world.driverPoint();
      const far = Math.hypot(p.x - this.cam.cx, p.y - this.cam.cy) > 150;
      const k = far ? 1 : 0.2;
      this.cam.cx += (p.x - this.cam.cx) * k;
      this.cam.cy += (p.y + 2 - this.cam.cy) * k;
    }
    const s = this.cam.scale;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-this.cam.cx, -this.cam.cy);

    const left = this.cam.cx - w / 2 / s - 50, right = this.cam.cx + w / 2 / s + 50;

    this.drawPosts(ctx, world, left, right, s);
    this.drawPlatforms(ctx, world);
    this.drawLineFeatures(ctx, world);
    if (s >= 3.5) for (const e of world.layout.graph.edges) this.drawSleepers(ctx, e, left, right);
    for (const e of world.layout.graph.edges) this.drawEdge(ctx, e, s);
    this.drawSwitches(ctx, world, s);
    for (const o of world.layout.objects) {
      if (o.kind === "signal") this.drawSignal(ctx, o, s);
      else this.drawBoard(ctx, o, s);
    }
    this.drawBaton(ctx, world);
    for (const v of world.vehicles) this.drawVehicle(ctx, world, v, s);
    this.drawDriver(ctx, world, s);
    ctx.restore();
  }

  /** Hectometre posts: ivory plates with black figures; kilometre posts larger, green-bordered. */
  private drawPosts(ctx: CanvasRenderingContext2D, world: World, left: number, right: number, s: number) {
    for (const p of world.layout.posts) {
      if (p.x < left || p.x > right) continue;
      // the post itself, a slate dot, stands 1.2 m nearer the track than the plate
      ctx.fillStyle = C.slate;
      ctx.beginPath(); ctx.arc(p.x, p.y + 1.2, 0.28, 0, Math.PI * 2); ctx.fill();
      // every plate reads the distance the same way (1.0, 1.1, …); a full kilometre gets a larger plate with a green rim
      const w = p.major ? 3.8 : 3.2, h = p.major ? 2.2 : 1.8;
      ctx.fillStyle = C.ivory;
      ctx.strokeStyle = p.major ? C.green : C.ink;
      ctx.lineWidth = p.major ? 0.28 : 0.15;
      ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 0.25); ctx.fill(); ctx.stroke();
      if (s >= 1.2) {
        ctx.fillStyle = C.ink; ctx.textAlign = "center";
        ctx.font = `${p.major ? 700 : 600} ${p.major ? 1.7 : 1.5}px ${DISPLAY}`;
        ctx.fillText(p.label, p.x, p.y + (p.major ? 0.62 : 0.55));
      }
    }
  }

  private drawPlatforms(ctx: CanvasRenderingContext2D, world: World) {
    for (const p of world.layout.platforms) {
      const x0 = p.kmFrom * 1000, x1 = p.kmTo * 1000;
      const off = p.track === "2" ? -5 : 0;
      const y = p.side * 2.2 + off, hgt = p.side * 5;
      ctx.fillStyle = C.chalk;
      ctx.fillRect(x0, Math.min(y, y + hgt), x1 - x0, Math.abs(hgt));
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.15;
      ctx.strokeRect(x0, Math.min(y, y + hgt), x1 - x0, Math.abs(hgt));
      ctx.fillStyle = C.green;
      ctx.font = `600 4px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText(p.name.toUpperCase().split("").join(" "), (x0 + x1) / 2, y + hgt / 2 + 1.4 + (p.track === "2" ? -5 : 0));
    }
  }

  /** The switch an edge is a branch of (not its toe), if any. */
  private branchOf(e: Edge): Switch | null {
    for (const n of [e.a, e.b]) if (n.switch && e !== n.switch.toe && (e === n.switch.normal || e === n.switch.reverse)) return n.switch;
    return null;
  }

  /** The part of an edge's polyline between arc lengths s0 and s1. */
  private clipped(e: Edge, s0: number, s1: number): Pt[] {
    const out: Pt[] = [pointAt(e, s0)];
    for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.pts[i]);
    out.push(pointAt(e, s1));
    return out;
  }

  /** Sleepers under the rails: short slate ties every 0.65 m. */
  private drawSleepers(ctx: CanvasRenderingContext2D, e: Edge, left: number, right: number) {
    ctx.strokeStyle = "rgba(74,85,96,.35)"; ctx.lineWidth = 0.24; ctx.lineCap = "butt";
    ctx.beginPath();
    for (let s = 0.3; s < e.length; s += 0.65) {
      const p = pointAt(e, s);
      if (p.x < left || p.x > right) continue;
      const t = tangentAt(e, s);
      ctx.moveTo(p.x - t.y * 1.25, p.y + t.x * 1.25);
      ctx.lineTo(p.x + t.y * 1.25, p.y - t.x * 1.25);
    }
    ctx.stroke();
  }

  /** Track drawn as two rails. At a switch the set route runs through; the other route's rails end short of the points. */
  private drawEdge(ctx: CanvasRenderingContext2D, e: Edge, s: number) {
    ctx.lineCap = "butt"; ctx.lineJoin = "round";
    const GAP = 5;
    let pts = e.pts;
    const sw = this.branchOf(e);
    if (sw) {
      const set = sw.state === "normal" ? sw.normal : sw.reverse;
      if (e !== set) pts = e.a === sw.node ? this.clipped(e, GAP, e.length) : this.clipped(e, 0, e.length - GAP);
    }
    if (s < 2.2) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      return;
    }
    // per-vertex normals, then the two rails at ±0.72 m
    const n = pts.length;
    const normals: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
      const dx = p1.x - p0.x, dy = p1.y - p0.y, l = Math.hypot(dx, dy) || 1;
      normals.push({ x: -dy / l, y: dx / l });
    }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 0.22;
    for (const side of [-0.72, 0.72]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = pts[i].x + normals[i].x * side, y = pts[i].y + normals[i].y * side;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Switch indicators: a black box on a short post at the toe, showing a white bar that lies the way the switch lies. */
  private drawSwitches(ctx: CanvasRenderingContext2D, world: World, s: number) {
    for (const sw of world.layout.graph.switches) {
      const n = sw.node;
      // direction "through the switch" from the toe, and which side the diverging track leaves to
      const toeIn = sw.toe.b === n ? tangentAt(sw.toe, sw.toe.length) : (() => { const t = tangentAt(sw.toe, 0); return { x: -t.x, y: -t.y }; })();
      const farRev = sw.reverse.a === n ? sw.reverse.b : sw.reverse.a;
      const divSide = Math.sign((farRev.x - n.x) * -toeIn.y + (farRev.y - n.y) * toeIn.x) || 1; // +1 = to the left-hand normal
      const nrm = { x: -toeIn.y, y: toeIn.x };
      // the box stands on the side away from the diverging track, 3.4 m from the toe
      const bx = n.x - nrm.x * divSide * 3.4, by = n.y - nrm.y * divSide * 3.4;
      ctx.fillStyle = C.ink; ctx.strokeStyle = C.ivory; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.rect(bx - 0.9, by - 0.9, 1.8, 1.8); ctx.fill(); ctx.stroke();
      // the bar: along the track when set straight, leaning towards the diverging track when set diverging
      let d = toeIn;
      if (sw.state === "reverse") {
        const a = 0.6 * divSide; // about 35 degrees
        d = { x: toeIn.x * Math.cos(a) - toeIn.y * Math.sin(a), y: toeIn.x * Math.sin(a) + toeIn.y * Math.cos(a) };
      }
      ctx.strokeStyle = C.white; ctx.lineWidth = 0.28; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(bx - d.x * 0.6, by - d.y * 0.6); ctx.lineTo(bx + d.x * 0.6, by + d.y * 0.6); ctx.stroke();
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + nrm.x * divSide * 1.6, by + nrm.y * divSide * 1.6); ctx.stroke();
      if (s >= 2) label(ctx, sw.id, bx, by - nrm.y * divSide * 2.6 + 0.8, 2.2, "center", C.slate);
    }
  }

  /**
   * Where a lineside object stands: t points the way it faces, n points to its side of the track.
   * Objects on a loop track stand on its outer side (track 1: the platform side, track 2: the far side);
   * on plain line they stand on the right of the direction they face.
   */
  private sideOf(o: Signal | Board): { p: Pt; t: Pt; n: Pt } {
    const p = worldPoint(o.pos);
    const t0 = tangentAt(o.pos.edge, o.pos.s);
    const t = o.pos.dir === 1 ? t0 : { x: -t0.x, y: -t0.y };
    const right = { x: -t.y, y: t.x }; // right-hand normal (screen y down)
    const track = o.pos.edge.track;
    const wantY = track === "2" ? -1 : track === "1" ? 1 : Math.sign(right.y) || 1;
    const n = Math.sign(right.y) === wantY ? right : { x: -right.x, y: -right.y };
    return { p, t, n };
  }

  private drawSignal(ctx: CanvasRenderingContext2D, sig: Signal, s: number) {
    const { p, t, n } = this.sideOf(sig);
    const off = 3.2;
    const cx = p.x + n.x * off, cy = p.y + n.y * off;
    if (sig.type === "main" || sig.type === "distant") {
      // post from the track towards the head
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(p.x + n.x * 1.2, p.y + n.y * 1.2); ctx.lineTo(cx, cy); ctx.stroke();
      const col = sig.aspect === "clear" ? C.lamp : sig.aspect === "caution" ? C.amber : C.red;
      if (sig.type === "distant") {
        // a distant wears a chevron plate behind its head
        ctx.fillStyle = C.ivory; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.15;
        ctx.beginPath(); ctx.moveTo(cx - t.x * 1.2 - n.x * 2.0, cy - t.y * 1.2 - n.y * 2.0); ctx.lineTo(cx - t.x * 2.4, cy - t.y * 2.4); ctx.lineTo(cx - t.x * 1.2 + n.x * 2.0, cy - t.y * 1.2 + n.y * 2.0); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 1.0, 0, Math.PI * 2); ctx.fill();
      if (sig.subsidiary) {
        // the subsidiary: two small lamps beside the head, lit diagonally when the shunt aspect shows
        const sx = cx + n.x * 2.4, sy = cy + n.y * 2.4;
        ctx.fillStyle = C.ink; ctx.fillRect(sx - 1.0, sy - 0.7, 2.0, 1.4);
        ctx.fillStyle = sig.aspect === "shunt" ? C.white : "rgba(255,255,255,.25)";
        const dy = sig.aspect === "shunt" ? 0.3 : 0;
        ctx.beginPath(); ctx.arc(sx - 0.5, sy + dy, 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx + 0.5, sy - dy, 0.25, 0, Math.PI * 2); ctx.fill();
      }
      // a small pointer showing which way it faces
      ctx.fillStyle = C.ink; ctx.beginPath();
      ctx.moveTo(cx + t.x * 2.7, cy + t.y * 2.7); ctx.lineTo(cx + t.x * 1.6 + n.x * 0.7, cy + t.y * 1.6 + n.y * 0.7); ctx.lineTo(cx + t.x * 1.6 - n.x * 0.7, cy + t.y * 1.6 - n.y * 0.7); ctx.fill();
    } else {
      // ground signal: black box with two white lamps
      ctx.fillStyle = C.ink;
      ctx.fillRect(cx - 1.4, cy - 1.0, 2.8, 2.0);
      ctx.fillStyle = C.white;
      if (sig.aspect === "shunt") {
        ctx.beginPath(); ctx.arc(cx - 0.7, cy + 0.45, 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 0.7, cy - 0.45, 0.35, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(cx - 0.7, cy, 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 0.7, cy, 0.35, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = C.ink; ctx.beginPath();
      ctx.moveTo(cx + t.x * 2.6, cy + t.y * 2.6); ctx.lineTo(cx + t.x * 1.7 + n.x * 0.5, cy + t.y * 1.7 + n.y * 0.5); ctx.lineTo(cx + t.x * 1.7 - n.x * 0.5, cy + t.y * 1.7 - n.y * 0.5); ctx.fill();
    }
    if (s >= 1.6) {
      // labelled behind the head along the track, on a plate, so it never lies over rails or another signal
      const back = sig.type === "distant" ? 4.0 : sig.type === "main" ? 2.6 : 2.4; // a distant's chevron plate sits behind its head
      label(ctx, sig.id, cx - t.x * back, cy - t.y * back + 0.85, 2.3, t.x > 0 ? "right" : "left");
    }
  }

  private drawBoard(ctx: CanvasRenderingContext2D, b: Board, s: number) {
    if (b.board === "switchIndicator") return;
    const { p, t, n } = this.sideOf(b);
    if (b.board === "gradient") {
      // one physical post per change of grade, drawn from the Down-facing object, on the post side of the line (-y)
      if (b.pos.dir * b.pos.edge.kmDir !== 1) return;
      const after = b.value ?? 0, before = Number(b.label ?? 0);
      // it stands beyond the hectometre plate lane, so the two never overlap
      const cx = p.x, cy = p.y - 12.4;
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.moveTo(cx, p.y - 8.3); ctx.lineTo(cx, cy); ctx.stroke();
      // two arms: the left arm follows the grade behind, the right arm the grade ahead (rising Down = up to the right)
      const arm = 2.6, k = 0.12;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.45; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - arm, cy + before * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + arm, cy - after * k); ctx.stroke();
      ctx.fillStyle = C.ivory; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.15;
      ctx.beginPath(); ctx.arc(cx, cy, 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (s >= 2) {
        const txt = (g: number) => (g === 0 ? "L" : `${Math.abs(g)}‰`);
        label(ctx, txt(before), cx - arm + 0.4, cy + before * k - 1.0, 1.4, "center", C.ink, 700);
        label(ctx, txt(after), cx + arm - 0.4, cy - after * k - 1.0, 1.4, "center", C.ink, 700);
      }
      return;
    }
    if (b.board === "buffer") {
      ctx.strokeStyle = C.red; ctx.lineWidth = 1.2; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.moveTo(p.x - n.x * 1.8, p.y - n.y * 1.8); ctx.lineTo(p.x + n.x * 1.8, p.y + n.y * 1.8); ctx.stroke();
      ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(p.x, p.y, 0.5, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const off = 3.2;
    const cx = p.x + n.x * off, cy = p.y + n.y * off;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(t.y, t.x));
    if (b.board === "stop") {
      ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.2;
      ctx.fillRect(-0.5, -1.6, 1.0, 3.2); ctx.strokeRect(-0.5, -1.6, 1.0, 3.2);
      ctx.fillStyle = C.ink; ctx.fillRect(-0.5, -0.35, 1.0, 0.7);
    } else if (b.board === "limitOfShunt") {
      ctx.fillStyle = C.ivory; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.2;
      ctx.fillRect(-0.5, -1.6, 1.0, 3.2);
      // the red band is painted on the board, so it is clipped to it
      ctx.save(); ctx.beginPath(); ctx.rect(-0.5, -1.6, 1.0, 3.2); ctx.clip();
      ctx.fillStyle = C.red;
      ctx.beginPath(); ctx.moveTo(-0.5, 1.6); ctx.lineTo(-0.5, 0.9); ctx.lineTo(0.5, -1.6); ctx.lineTo(0.5, -0.9); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeRect(-0.5, -1.6, 1.0, 3.2);
    } else if (b.board === "speed") {
      ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.rotate(-Math.atan2(t.y, t.x));
      ctx.fillStyle = C.ink; ctx.font = `700 2px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText(String(b.value), 0, 0.7);
    } else if (b.board === "whistle") {
      ctx.rotate(-Math.atan2(t.y, t.x));
      ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = `700 2px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText("W", 0, 0.7);
    } else if (b.board === "section" || b.board === "resume") {
      // black board; a white bar across the track means power off, a white bar along it means power may be taken
      ctx.fillStyle = C.ink; ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
      ctx.strokeStyle = C.white; ctx.lineWidth = 0.4; ctx.lineCap = "butt";
      ctx.beginPath();
      if (b.board === "section") { ctx.moveTo(0, -0.9); ctx.lineTo(0, 0.9); } else { ctx.moveTo(-0.9, 0); ctx.lineTo(0.9, 0); }
      ctx.stroke();
    } else if (b.board === "speedAdvance") {
      // an ivory triangle, point up: a lower limit lies one warning distance ahead
      ctx.rotate(-Math.atan2(t.y, t.x));
      ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.3; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(0, -1.9); ctx.lineTo(1.75, 1.2); ctx.lineTo(-1.75, 1.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = `700 1.7px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText(String(b.value), 0, 1.0);
    }
    ctx.restore();
    if (s >= 2.5 && (b.board === "stop" || b.board === "limitOfShunt")) {
      // behind the board, along the way trains approach it: beside the standing train, on a plate so it reads on a platform
      const text = b.board === "stop" ? `STOP · ${b.label}` : "LIMIT OF SHUNT";
      label(ctx, text, cx - t.x * 1.4, cy - t.y * 1.4 + 0.7, 2, t.x > 0 ? "right" : "left", C.slate);
    }
  }

  private drawBaton(ctx: CanvasRenderingContext2D, world: World) {
    for (const st of world.stations) {
      for (const number of st.baton) {
        const v = world.vehicles.find((x) => x.number === number);
        if (!v) continue;
        // beside the platform, level with the train's leading end
        const c = world.consistOf(v);
        const stop = st.stops.find((s) => world.atPlatform(c) && s.platform.track === v.pos.edge.track) ?? st.stops[0];
        const x = stop.km * 1000 - stop.dir * 6, y = stop.platform.side * 4.5 + (stop.platform.track === "2" ? -5 : 0);
        ctx.fillStyle = C.lamp; ctx.strokeStyle = C.ivory; ctx.lineWidth = 0.3;
        ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        label(ctx, "READY TO START", x, y + 3.6, 2.2, "center", C.green, 700);
      }
    }
  }

  /** Level crossings and neutral sections along the line. */
  private drawLineFeatures(ctx: CanvasRenderingContext2D, world: World) {
    for (const x of world.layout.crossings) {
      const px = x.km * 1000;
      ctx.fillStyle = "rgba(217,210,192,.9)";
      ctx.fillRect(px - 2.5, -6, 5, 12);
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.15; ctx.strokeRect(px - 2.5, -6, 5, 12);
      label(ctx, x.name.toUpperCase(), px, 9.2, 1.8, "center", C.slate);
    }
    for (const n of world.layout.neutral) {
      const a = n.kmFrom * 1000, b = n.kmTo * 1000;
      ctx.strokeStyle = C.brass; ctx.lineWidth = 0.35; ctx.setLineDash([0.8, 0.5]);
      ctx.beginPath(); ctx.moveTo(a, -2.4); ctx.lineTo(b, -2.4); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "NEUTRAL SECTION", (a + b) / 2, -3.4, 1.6, "center", C.brass);
    }
  }

  private drawVehicle(ctx: CanvasRenderingContext2D, world: World, v: Vehicle, s: number) {
    const a = worldPoint(v.pos), b = worldPoint(v.posB);
    const ang = Math.atan2(a.y - b.y, a.x - b.x);
    const L = v.length, W = 2.8;
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(ang);
    // body
    ctx.fillStyle = C.green;
    ctx.fillRect(-L / 2, -W / 2, L, W);
    // ivory waist band along the upper edge
    ctx.fillStyle = "rgba(244,239,227,.6)";
    ctx.fillRect(-L / 2 + 1.0, -1.15, L - 2.0, 0.42);
    // red ends
    ctx.fillStyle = C.red;
    ctx.fillRect(L / 2 - 0.5, -W / 2, 0.5, W);
    ctx.fillRect(-L / 2, -W / 2, 0.5, W);
    // outline
    ctx.strokeStyle = C.ink; ctx.lineWidth = 0.15; ctx.strokeRect(-L / 2, -W / 2, L, W);
    // pantograph
    if (v.type.pantograph) {
      ctx.fillStyle = v.panto === "up" ? C.brass : v.panto === "down" ? C.slate : C.amber;
      ctx.fillRect(-1.6, -0.55, 3.2, 0.9);
    }
    // cab doors (a small ivory notch on the platform side, 2.6 m from each cab end)
    ctx.fillStyle = "rgba(244,239,227,.8)";
    for (const end of v.type.cabs) {
      const x = end === "A" ? L / 2 - 2.6 : -L / 2 + 2.6;
      const sideY = Math.cos(ang) < 0 ? -W / 2 : W / 2; // platform side is +y in the world
      ctx.fillRect(x - 0.45, sideY - 0.2, 0.9, 0.4);
    }
    // passenger doors
    if (v.type.doors && v.doorsOpen) {
      ctx.fillStyle = C.ivory;
      const side = W / 2;
      for (const dx of [-L / 2 + 2.5, L / 2 - 2.5]) { ctx.fillRect(dx - 0.8, side - 0.5, 1.6, 0.8); }
    }
    // lights at ends (A at +L/2)
    // lamps stand on the body just inside the red end plate, so a red tail lamp reads against green;
    // an unlit lamp shows as a dark housing, a lit one glows beyond the vehicle
    const light = (end: End, x: number) => {
      const st = v.lightsAt(end);
      const dir = x > 0 ? 1 : -1;
      if (st !== "off") {
        ctx.fillStyle = st === "head" ? "rgba(255,255,255,.35)" : "rgba(198,50,30,.35)";
        ctx.beginPath();
        if (st === "head") { ctx.moveTo(x, -1); ctx.lineTo(x + dir * 9, -3.5); ctx.lineTo(x + dir * 9, 3.5); ctx.lineTo(x, 1); }
        else { ctx.moveTo(x, -1.2); ctx.lineTo(x + dir * 2.2, -1.6); ctx.lineTo(x + dir * 2.2, 1.6); ctx.lineTo(x, 1.2); }
        ctx.fill();
      }
      for (const dy of [-0.85, 0.85]) {
        ctx.fillStyle = st === "head" ? C.white : st === "tail" ? C.red : "#2b2b2b";
        ctx.strokeStyle = st === "off" ? "#555" : C.ink; ctx.lineWidth = 0.12;
        ctx.beginPath(); ctx.arc(x, dy, 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (st === "tail") { ctx.fillStyle = "rgba(255,120,100,.9)"; ctx.beginPath(); ctx.arc(x, dy, 0.16, 0, Math.PI * 2); ctx.fill(); }
      }
    };
    light("A", L / 2 - 1.05);
    light("B", -L / 2 + 1.05);
    // labels
    if (s >= 1.6) {
      const flipText = Math.cos(ang) < 0;
      ctx.save();
      if (flipText) ctx.rotate(Math.PI);
      ctx.fillStyle = C.brass; ctx.font = `700 1.5px ${DISPLAY}`; ctx.textAlign = "center";
      const nx = v.type.pantograph ? -L / 2 + 4.2 : 0;
      ctx.fillText(v.number, nx * (flipText ? -1 : 1), 1.1);
      ctx.fillStyle = C.ivory; ctx.font = `600 1.4px ${DISPLAY}`;
      for (const end of v.type.cabs) {
        const x = (end === "A" ? L / 2 - 1.6 : -L / 2 + 1.6) * (flipText ? -1 : 1);
        ctx.fillText(end, x, 1.05);
      }
      ctx.restore();
    }
    // horn
    if (world.time < v.hornUntil) {
      ctx.fillStyle = C.brass; ctx.font = `700 3px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.save(); if (Math.cos(ang) < 0) ctx.rotate(Math.PI); ctx.fillText("♪", 0, -W / 2 - 1.2); ctx.restore();
    }
    ctx.restore();
  }

  private drawDriver(ctx: CanvasRenderingContext2D, world: World, s: number) {
    const p = world.driverPoint();
    const d = world.driver;
    const y = p.y;
    ctx.fillStyle = C.brass; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.2;
    ctx.beginPath(); ctx.arc(p.x, y, 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (d.kind === "walking") {
      ctx.strokeStyle = C.brass; ctx.lineWidth = 0.15; ctx.setLineDash([0.6, 0.6]);
      // drawn from the target to the driver, so the dashes stay fixed at the target while the driver walks
      const to = world.anchorPoint(d.target);
      ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(p.x, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s >= 2 && d.kind !== "cab") {
      ctx.fillStyle = C.slate; ctx.font = `600 2px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText(d.kind === "walking" ? "WALKING" : "DRIVER", p.x, y + 3);
    }
  }
}
