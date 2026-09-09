import { World } from "../sim/world";
import { type Edge, type Pt, worldPoint, pointAt, tangentAt } from "../track/graph";
import { type Signal, type Board } from "../track/layouts";
import { type Vehicle, type End } from "../stock/vehicles";

const C = { green: "#1F4B3F", ivory: "#F4EFE3", paper: "#FBF8F0", red: "#C6321E", brass: "#B5913F", ink: "#1A1A1A", slate: "#4A5560", chalk: "#D9D2C0", amber: "#D9A21B", lamp: "#2E9E5B", white: "#FFFFFF" };
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";

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
      const w = p.major ? 3.6 : 3.2, h = p.major ? 2.4 : 1.8;
      ctx.fillStyle = C.ivory;
      ctx.strokeStyle = p.major ? C.green : C.ink;
      ctx.lineWidth = p.major ? 0.3 : 0.15;
      ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 0.25); ctx.fill(); ctx.stroke();
      if (s >= 1.2) {
        ctx.fillStyle = p.major ? C.green : C.ink;
        ctx.textAlign = "center";
        if (p.major) {
          ctx.font = `600 0.8px ${DISPLAY}`; ctx.fillText("KM", p.x, p.y - 0.55);
          ctx.font = `700 1.7px ${DISPLAY}`; ctx.fillText(p.label, p.x, p.y + 1.0);
        } else {
          ctx.font = `600 1.5px ${DISPLAY}`; ctx.fillText(p.label, p.x, p.y + 0.55);
        }
      }
    }
  }

  private drawPlatforms(ctx: CanvasRenderingContext2D, world: World) {
    for (const p of world.layout.platforms) {
      const x0 = p.kmFrom * 1000, x1 = p.kmTo * 1000;
      const y = p.side * 2.2, hgt = p.side * 5;
      ctx.fillStyle = C.chalk;
      ctx.fillRect(x0, Math.min(y, y + hgt), x1 - x0, Math.abs(hgt));
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.15;
      ctx.strokeRect(x0, Math.min(y, y + hgt), x1 - x0, Math.abs(hgt));
      ctx.fillStyle = C.green;
      ctx.font = `600 4px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText(p.name.toUpperCase().split("").join(" "), (x0 + x1) / 2, y + hgt / 2 + 1.4);
    }
  }

  private drawEdge(ctx: CanvasRenderingContext2D, e: Edge, s: number) {
    ctx.lineCap = "butt"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(e.pts[0].x, e.pts[0].y);
    for (let i = 1; i < e.pts.length; i++) ctx.lineTo(e.pts[i].x, e.pts[i].y);
    if (s >= 2.2) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.7; ctx.stroke();
      ctx.strokeStyle = C.ivory; ctx.lineWidth = 1.0; ctx.stroke();
    } else {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  private drawSwitches(ctx: CanvasRenderingContext2D, world: World, s: number) {
    for (const sw of world.layout.graph.switches) {
      const sel = sw.state === "normal" ? sw.normal : sw.reverse;
      const n = sw.node;
      // highlight the set branch with a short green line from the node
      const along = sel.a === n ? pointAt(sel, Math.min(12, sel.length)) : pointAt(sel, Math.max(0, sel.length - 12));
      ctx.strokeStyle = C.lamp; ctx.lineWidth = 0.6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(along.x, along.y); ctx.stroke();
      ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.25;
      ctx.beginPath(); ctx.arc(n.x, n.y, 1.0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (s >= 2) {
        ctx.fillStyle = C.slate; ctx.font = `600 2.6px ${DISPLAY}`; ctx.textAlign = "center";
        ctx.fillText(sw.id, n.x, n.y + 4.8);
      }
    }
  }

  /** side offset: objects stand on the right of the direction they face */
  private sideOf(o: Signal | Board): { p: Pt; t: Pt; n: Pt } {
    const p = worldPoint(o.pos);
    const t0 = tangentAt(o.pos.edge, o.pos.s);
    const t = o.pos.dir === 1 ? t0 : { x: -t0.x, y: -t0.y };
    const n = { x: -t.y, y: t.x }; // right-hand normal (screen y down)
    return { p, t, n };
  }

  private drawSignal(ctx: CanvasRenderingContext2D, sig: Signal, s: number) {
    const { p, t, n } = this.sideOf(sig);
    const off = 3.2;
    const cx = p.x + n.x * off, cy = p.y + n.y * off;
    if (sig.type === "main") {
      // post from the track towards the head
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(p.x + n.x * 1.2, p.y + n.y * 1.2); ctx.lineTo(cx, cy); ctx.stroke();
      const col = sig.aspect === "clear" ? C.lamp : sig.aspect === "caution" ? C.amber : C.red;
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 1.0, 0, Math.PI * 2); ctx.fill();
      // a small pointer showing which way it faces
      ctx.fillStyle = C.ink; ctx.beginPath();
      ctx.moveTo(cx + t.x * 1.5, cy + t.y * 1.5); ctx.lineTo(cx + t.x * 2.6 + n.x * 0.7, cy + t.y * 2.6 + n.y * 0.7); ctx.lineTo(cx + t.x * 2.6 - n.x * 0.7, cy + t.y * 2.6 - n.y * 0.7); ctx.fill();
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
      ctx.moveTo(cx + t.x * 1.6, cy + t.y * 1.6); ctx.lineTo(cx + t.x * 2.5 + n.x * 0.5, cy + t.y * 2.5 + n.y * 0.5); ctx.lineTo(cx + t.x * 2.5 - n.x * 0.5, cy + t.y * 2.5 - n.y * 0.5); ctx.fill();
    }
    if (s >= 1.6) {
      ctx.fillStyle = C.ink; ctx.font = `600 2.4px ${DISPLAY}`;
      if (sig.type === "main") {
        // main signals are labelled behind the head, along the track, so they never collide with a ground signal alongside
        ctx.textAlign = t.x > 0 ? "right" : "left";
        ctx.fillText(sig.id, cx - t.x * 2.6, cy - t.y * 2.6 + 0.9);
      } else {
        ctx.textAlign = "center";
        ctx.fillText(sig.id, cx + n.x * 3.2, cy + n.y * 3.2 + 0.9);
      }
    }
  }

  private drawBoard(ctx: CanvasRenderingContext2D, b: Board, s: number) {
    const { p, t, n } = this.sideOf(b);
    if (b.board === "gradient") {
      // one physical post per change of grade, drawn from the Down-facing object, on the post side of the line (-y)
      if (b.pos.dir * b.pos.edge.kmDir !== 1) return;
      const after = b.value ?? 0, before = Number(b.label ?? 0);
      // it stands beyond the hectometre plate that shares its kilometre, so the two never overlap
      const cx = p.x, cy = p.y - 9.0;
      ctx.strokeStyle = C.slate; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.moveTo(cx, p.y - 5.2); ctx.lineTo(cx, cy); ctx.stroke();
      // two arms: the left arm follows the grade behind, the right arm the grade ahead (rising Down = up to the right)
      const arm = 2.6, k = 0.12;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.45; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - arm, cy + before * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + arm, cy - after * k); ctx.stroke();
      ctx.fillStyle = C.ivory; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.15;
      ctx.beginPath(); ctx.arc(cx, cy, 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (s >= 2) {
        ctx.fillStyle = C.ink; ctx.font = `700 1.4px ${DISPLAY}`; ctx.textAlign = "center";
        const txt = (g: number) => (g === 0 ? "L" : `${Math.abs(g)}‰`);
        ctx.fillText(txt(before), cx - arm + 0.4, cy + before * k - 1.0);
        ctx.fillText(txt(after), cx + arm - 0.4, cy - after * k - 1.0);
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
      ctx.fillRect(-0.5, -1.6, 1.0, 3.2); ctx.strokeRect(-0.5, -1.6, 1.0, 3.2);
      ctx.strokeStyle = C.red; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-0.5, 1.4); ctx.lineTo(0.5, -1.4); ctx.stroke();
    } else if (b.board === "speed") {
      ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.rotate(-Math.atan2(t.y, t.x));
      ctx.fillStyle = C.ink; ctx.font = `700 2px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText(String(b.value), 0, 0.7);
    } else if (b.board === "speedAdvance") {
      // an ivory triangle, point up: a lower limit lies one warning distance ahead
      ctx.rotate(-Math.atan2(t.y, t.x));
      ctx.fillStyle = C.white; ctx.strokeStyle = C.ink; ctx.lineWidth = 0.3; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(0, -1.9); ctx.lineTo(1.75, 1.2); ctx.lineTo(-1.75, 1.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = `700 1.7px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText(String(b.value), 0, 1.0);
    }
    ctx.restore();
    if (s >= 2.5 && b.board !== "speed" && b.board !== "speedAdvance") {
      ctx.fillStyle = C.slate; ctx.font = `600 2px ${DISPLAY}`; ctx.textAlign = "center";
      const label = b.board === "stop" ? `STOP · ${b.label}` : "LIMIT OF SHUNT";
      ctx.fillText(label, cx + n.x * 3.4, cy + n.y * 3.4 + 0.7);
    }
  }

  private drawBaton(ctx: CanvasRenderingContext2D, world: World) {
    for (const st of world.stations) {
      if (!st.batonShown) continue;
      const x = st.stopBoardKm * 1000 - st.arriveDir * 6, y = st.platform.side * 4.5;
      ctx.fillStyle = C.lamp; ctx.strokeStyle = C.ivory; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.green; ctx.font = `700 2.2px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText("READY TO START", x, y + 3.6);
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
    const light = (end: End, x: number) => {
      const st = v.lightsAt(end);
      if (st === "off") return;
      ctx.fillStyle = st === "head" ? C.white : C.red;
      for (const dy of [-0.9, 0.9]) { ctx.beginPath(); ctx.arc(x, dy, 0.32, 0, Math.PI * 2); ctx.fill(); }
      if (st === "head") {
        ctx.fillStyle = "rgba(255,255,255,.35)";
        const dir = x > 0 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x, -1); ctx.lineTo(x + dir * 9, -3.5); ctx.lineTo(x + dir * 9, 3.5); ctx.lineTo(x, 1); ctx.fill();
      }
    };
    light("A", L / 2 - 0.25);
    light("B", -L / 2 + 0.25);
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
      const to = world.anchorPoint(d.target);
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s >= 2 && d.kind !== "cab") {
      ctx.fillStyle = C.slate; ctx.font = `600 2px ${DISPLAY}`; ctx.textAlign = "center";
      ctx.fillText(d.kind === "walking" ? "WALKING" : "DRIVER", p.x, y + 3);
    }
  }
}
