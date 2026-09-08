import { SCENARIOS, type Scenario } from "../scenarios/duties";
import { World } from "../sim/world";
import { DutyTracker } from "../sim/duty";
import { WorldRenderer } from "./render";
import { LineDiagram } from "./diagram";
import { SidePanel } from "./panel";
import { fmtTime } from "../core/util";
import { type BrakeStep } from "../stock/vehicles";
import { lessonFor } from "../sim/incidents";
import { type Incident } from "../sim/world";

const MARK = "/brand/mark-ivory.svg";

export class App {
  root: HTMLElement;
  private raf = 0;
  private running: { world: World; duty: DutyTracker; scenario: Scenario; renderer: WorldRenderer; diagram: LineDiagram; panel: SidePanel; last: number; acc: number; seenIncidents: number; notices: Incident[] } | null = null;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener("hashchange", () => this.route());
    window.addEventListener("keydown", this.keyHandler);
    this.route();
  }

  private route() {
    const h = location.hash.replace("#", "") || "home";
    this.stop();
    if (h === "library") return this.library();
    const sc = SCENARIOS.find((s) => s.id === h);
    if (sc) return this.play(sc);
    this.home();
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.running = null;
  }

  private home() {
    const cards = SCENARIOS.map((s) => `
      <div class="card" onclick="location.hash='${s.id}'">
        <div class="num">DUTY ${s.number}</div>
        <h3>${s.title}</h3>
        <div class="sub">${s.subtitle}</div>
        <p>${s.blurb}</p>
      </div>`).join("");
    this.root.innerHTML = `
      <div class="home">
        <div class="masthead"><img src="/brand/mark-green.svg" alt=""><div class="name">Meridian Railway<small>A modular train simulator</small></div></div>
        <p class="motto">On the line, on time.</p>
        <h2>Duties</h2>
        <div class="cards">${cards}</div>
        <h2>The Library</h2>
        <div class="cards">
          <div class="card book" onclick="location.hash='library'"><span class="letter">I R S D</span><div class="num">The Company's Books</div><h3>Read the manuals</h3><div class="sub">Identity · Rules · Signalling · Driving</div><p>Booklets in the house style, printable on A5. Every rule the railway enforces is written in one of them.</p></div>
        </div>
        <h2>The plan</h2>
        <p>This is milestone M0/M1 of a long road: the shuttle and the run-round. The development plan and the fiction bible live in <span class="mono">docs/PLAN.md</span> and <span class="mono">docs/WORLD.md</span>.</p>
      </div>`;
  }

  private library() {
    this.root.innerHTML = `
      <div class="library">
        <div class="topbar"><img src="${MARK}" alt=""><span class="brand">Meridian Railway</span><span class="title">The Library</span><span class="spacer"></span><a href="#home">Duties</a></div>
        <iframe src="/manuals/index.html"></iframe>
      </div>`;
  }

  private play(scenario: Scenario) {
    const { world, duty } = scenario.create();
    this.root.innerHTML = `
      <div class="duty">
        <div class="topbar">
          <img src="${MARK}" alt=""><span class="brand">Meridian Railway</span>
          <span class="title">Duty ${scenario.number} · ${scenario.title}</span>
          <span class="spacer"></span>
          <span class="clock" id="clock"></span>
          <span id="warp"></span>
          <a href="#library" target="_self">Library</a>
          <a href="#home">Duties</a>
        </div>
        <div class="diagram"><canvas id="diagram"></canvas></div>
        <div class="view"><canvas id="view"></canvas><div class="hud" id="hud"></div><div id="notice"></div><div id="finish"></div></div>
        <div class="side" id="side"></div>
      </div>`;
    const renderer = new WorldRenderer(this.root.querySelector("#view")!);
    const diagram = new LineDiagram(this.root.querySelector("#diagram")!);
    const panel = new SidePanel(this.root.querySelector("#side")!, world, duty);
    const warpEl = this.root.querySelector("#warp")!;
    const renderWarp = () => {
      warpEl.innerHTML = [["⏸", 0], ["1×", 1], ["2×", 2], ["5×", 5], ["10×", 10]].map(([l, v]) => `<button data-w="${v}" class="${(world.paused ? 0 : world.warp) === v ? "on" : ""}">${l}</button>`).join(" ");
    };
    warpEl.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!b) return;
      const v = Number(b.dataset.w);
      if (v === 0) world.paused = true; else { world.paused = false; world.warp = v; }
      renderWarp();
    });
    renderWarp();
    const hud = this.root.querySelector("#hud")!;
    hud.innerHTML = `<span id="hudtxt"></span><button id="recentre">Re-centre</button>`;
    hud.querySelector("#recentre")!.addEventListener("click", () => { renderer.cam.follow = true; });

    this.running = { world, duty, scenario, renderer, diagram, panel, last: performance.now(), acc: 0, seenIncidents: world.incidents.length, notices: [] };
    (window as unknown as { mr: unknown }).mr = { world, duty, panel, renderer };
    const noticeEl = this.root.querySelector("#notice") as HTMLElement;
    noticeEl.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      this.dismissNotice();
    });
    const loop = (now: number) => {
      const r = this.running; if (!r) return;
      const real = Math.min(0.1, (now - r.last) / 1000);
      r.last = now;
      // Advance the world by exactly the elapsed time, in substeps of at most 20 ms,
      // so that vehicles move every frame and the tracked view stays smooth.
      const held = r.notices.length > 0;
      if (r.world.skipUntil !== null && !held) {
        r.world.runSkip();
      } else if (!r.world.paused && !held) {
        const target = real * r.world.warp;
        const n = Math.max(1, Math.ceil(target / 0.02));
        const dt = target / n;
        for (let i = 0; i < n; i++) r.world.step(dt);
      }
      // new entries in the Incident Book become notices
      while (r.seenIncidents < r.world.incidents.length) {
        const inc = r.world.incidents[r.seenIncidents++];
        if (!inc.note) r.notices.push(inc);
      }
      this.renderNotice(noticeEl);
      r.renderer.draw(r.world);
      r.diagram.draw(r.world);
      r.panel.update();
      (this.root.querySelector("#clock") as HTMLElement).textContent = fmtTime(r.world.time, true);
      (this.root.querySelector("#hudtxt") as HTMLElement).textContent = `${r.world.layout.name} · scale ${r.renderer.cam.scale.toFixed(1)} px/m · drag to pan, wheel to zoom`;
      const fin = this.root.querySelector("#finish") as HTMLElement;
      if (r.world.finished && !fin.innerHTML) {
        const n = r.world.incidents.filter((i) => !i.note).length;
        fin.innerHTML = `<div class="finish">${r.world.finished}<small>${n === 0 ? "Nothing written in the Incident Book. A clean duty." : `${n} entr${n === 1 ? "y" : "ies"} in the Incident Book.`}</small></div>`;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private renderNotice(el: HTMLElement) {
    const r = this.running; if (!r) return;
    const inc = r.notices[0];
    const key = inc ? `${inc.t}|${inc.code}` : "";
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    if (!inc) { el.innerHTML = ""; return; }
    const L = lessonFor(inc.code);
    const more = r.notices.length > 1 ? `<span class="more">${r.notices.length - 1} more to read</span>` : "";
    el.innerHTML = `
      <div class="notice">
        <div class="head"><span>Incident Book</span><span class="t">${fmtTime(inc.t)}</span></div>
        <div class="title">${L ? L.title : inc.code}</div>
        <div class="text">${inc.text}</div>
        ${L ? `<div class="lesson">${L.lesson}</div><div class="cite">${L.rule} · <a href="/manuals/book-${L.book.toLowerCase()}.html#${L.anchor}" target="_blank">Read it in Book ${L.book} ↗</a></div>` : ""}
        <div class="foot"><button class="noted">Noted · Enter</button>${more}</div>
      </div>`;
  }

  private dismissNotice() {
    const r = this.running; if (!r || r.notices.length === 0) return;
    r.notices.shift();
    r.last = performance.now();
  }

  private onKey(e: KeyboardEvent) {
    const r = this.running; if (!r) return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (r.notices.length > 0) {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") { e.preventDefault(); this.dismissNotice(); }
      return;
    }
    const w = r.world;
    const cab = w.driverCab;
    const k = e.key;
    if (k === "Home") { r.renderer.cam.follow = true; return; }
    if (k === " ") { e.preventDefault(); if (cab) w.setBrake(5); r.panel.update(true); return; }
    if (k.toLowerCase() === "c") { if (w.driver.kind === "cab") w.leaveCab(); else if (w.driver.kind === "ground") w.enterCab(); r.panel.update(true); return; }
    if (!cab) return;
    const c = cab.cab;
    switch (k.toLowerCase()) {
      case "w": w.setNotch(c.notch + 1); break;
      case "s": w.setNotch(c.notch - 1); break;
      case "d": w.setBrake(Math.min(5, c.brake + 1) as BrakeStep); break;
      case "a": w.setBrake(Math.max(0, c.brake - 1) as BrakeStep); break;
      case "f": w.setReverser("F"); break;
      case "n": w.setReverser("N"); break;
      case "r": w.setReverser("R"); break;
      case "p": w.togglePanto(); break;
      case "l": w.setLights(c.lights === "off" ? "tail" : c.lights === "tail" ? "head" : "off"); break;
      case "o": w.toggleDoors(); break;
      case "h": w.horn(); break;
      default: return;
    }
    r.panel.update(true);
  }
}
