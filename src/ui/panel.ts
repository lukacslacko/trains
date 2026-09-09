import { World } from "../sim/world";
import { DutyTracker } from "../sim/duty";
import { BRAKE_NAMES, type BrakeStep, type LightState, type Reverser } from "../stock/vehicles";
import { fmtTime, parseTime } from "../core/util";
import { kmOf } from "../track/graph";

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

/** The side panel: cab (or ground) controls, what lies ahead, and the working tabs. */
export class SidePanel {
  root: HTMLElement;
  cabEl: HTMLElement;
  aheadEl: HTMLElement;
  tabsEl: HTMLElement;
  paneEl: HTMLElement;
  tab: "messages" | "sheet" | "incidents" = "messages";
  private lastCab = "";
  private lastAhead = "";
  private lastPane = "";
  private msgCount = -1;
  world: World;
  duty: DutyTracker;

  constructor(root: HTMLElement, world: World, duty: DutyTracker) {
    this.root = root; this.world = world; this.duty = duty;
    root.innerHTML = `<div class="col drive"><div class="cab"></div><div class="ahead"></div></div><div class="col work"><div class="tabs"></div><div class="tabpane"></div></div><div class="keys">W/S power · A/D brake · Space emergency · B parking brake · F/N/R reverser · P panto · L lights · O doors · H horn (hold for a long blast) · C cab · Home re-centre</div>`;
    this.cabEl = root.querySelector(".cab")!;
    this.aheadEl = root.querySelector(".ahead")!;
    this.tabsEl = root.querySelector(".tabs")!;
    this.paneEl = root.querySelector(".tabpane")!;
    root.addEventListener("click", (e) => this.onClick(e));
    // the horn button sounds while it is held down
    root.addEventListener("pointerdown", (e) => {
      const el = (e.target as HTMLElement).closest("[data-a=horn]");
      if (!el) return;
      e.preventDefault();
      world.hornDown(); this.update(true);
    });
    for (const ev of ["pointerup", "pointercancel"] as const) window.addEventListener(ev, () => { if (this.world.hornHeld) { this.world.hornUp(); this.update(true); } });
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest("[data-a]") as HTMLElement | null;
    if (!el) return;
    const a = el.dataset.a!, v = el.dataset.v ?? "";
    const w = this.world;
    switch (a) {
      case "rev": w.setReverser(v as Reverser); break;
      case "notch": w.setNotch(Number(v)); break;
      case "brake": w.setBrake(Number(v) as BrakeStep); break;
      case "panto": w.togglePanto(); break;
      case "park": w.setParkingBrake(v === "on"); break;
      case "lights": w.setLights(v as LightState); break;
      case "doors": w.toggleDoors(); break;
      case "test": w.startBrakeTest(); break;
      case "leave": w.leaveCab(); break;
      case "enter": w.enterCab(); break;
      case "walk": { const t = w.walkTargets()[Number(v)]; if (t) w.walkTo(t.anchor); break; }
      case "uncouple": w.uncouple(); break;
      case "connect": w.connectPipe(); break;
      case "tab": this.tab = v as SidePanel["tab"]; this.lastPane = ""; break;
      case "skipto": { const l = this.duty.legs[Number(v)]; if (l) w.skipTo(parseTime(l.leg.dep)); break; }
    }
    this.update(true);
  }

  update(force = false) {
    const cab = this.renderCab();
    if (force || cab !== this.lastCab) { this.cabEl.innerHTML = cab; this.lastCab = cab; }
    const ahead = this.renderAhead();
    if (force || ahead !== this.lastAhead) { this.aheadEl.innerHTML = ahead; this.lastAhead = ahead; }
    const tabs = (["messages", "sheet", "incidents"] as const).map((t) => {
      const n = t === "incidents" ? this.world.incidents.filter((i) => !i.note).length : 0;
      const label = t === "messages" ? "Messages" : t === "sheet" ? "Duty sheet" : `Incident Book${n ? ` (${n})` : ""}`;
      return `<button class="${this.tab === t ? "on" : ""}" data-a="tab" data-v="${t}">${label}</button>`;
    }).join("");
    if (this.tabsEl.innerHTML !== tabs) this.tabsEl.innerHTML = tabs;
    const pane = this.tab === "messages" ? this.renderMessages() : this.tab === "sheet" ? this.renderSheet() : this.renderIncidents();
    if (force || pane !== this.lastPane) {
      const atBottom = this.paneEl.scrollTop + this.paneEl.clientHeight >= this.paneEl.scrollHeight - 40;
      this.paneEl.innerHTML = pane; this.lastPane = pane;
      if (this.tab === "messages" && (atBottom || this.msgCount !== this.world.messages.length)) this.paneEl.scrollTop = this.paneEl.scrollHeight;
      this.msgCount = this.world.messages.length;
    }
  }

  private renderCab(): string {
    const w = this.world;
    const d = w.driver;
    const dc = w.driverCab;
    if (d.kind === "walking") {
      const left = Math.max(0, d.duration - d.t);
      const target = d.target.kind === "cab" ? `Cab ${d.target.end} of ${d.target.vehicle.number}` : `coupling ${d.target.consist.vehicles[d.target.index].number}–${d.target.consist.vehicles[d.target.index + 1].number}`;
      return `<h4>On foot <span class="where">walking</span></h4><p>Walking to ${esc(target)}… <span class="mono">${left.toFixed(0)} s</span></p>`;
    }
    if (d.kind === "ground") {
      const at = d.at;
      const where = at.kind === "cab" ? `beside Cab ${at.end} of ${at.vehicle.number}` : `at the coupling ${at.consist.vehicles[at.index].number}–${at.consist.vehicles[at.index + 1].number}`;
      let actions = "";
      if (at.kind === "cab" && at.vehicle.cabs[at.end]) actions += `<button data-a="enter">Enter Cab ${at.end} of ${at.vehicle.number}</button>`;
      if (at.kind === "coupling") {
        const coup = at.consist.couplings[at.index];
        if (coup.pipe) actions += `<button data-a="uncouple" class="red">Uncouple here (part pipe and coupler)</button>`;
        else actions += `<button data-a="connect">Connect brake pipe and control line</button>`;
      }
      w.walkTargets().forEach((t, i) => { actions += `<button data-a="walk" data-v="${i}">Walk to ${esc(t.label)}</button>`; });
      return `<h4>On the ground <span class="where">${esc(where)}</span></h4><div class="ground"><div class="actions">${actions}</div></div>`;
    }
    if (!dc) return "";
    const { vehicle: v, cab, consist: c } = dc;
    const speed = c.speedKmh;
    const lim = w.limitFor(c);
    const pipe = v.pipe;
    const lineV = v.powered;
    const b = (a: string, val: string, label: string, on: boolean, cls = "") => `<button data-a="${a}" data-v="${val}" class="${on ? "on " : ""}${cls}">${label}</button>`;
    const gauges = `
      <div class="gauges">
        <div class="gauge ${speed > lim + 2 ? "warn" : ""}"><div class="lbl">Speed</div><div class="val">${speed.toFixed(0)}<small>km/h · limit ${lim}</small></div></div>
        <div class="gauge"><div class="lbl">Brake pipe</div><div class="val">${pipe.toFixed(1)}<small>bar</small></div></div>
        <div class="gauge"><div class="lbl">Notch</div><div class="val">${cab.notch}<small>/4 · ${cab.reverser === "F" ? "Fwd" : cab.reverser === "R" ? "Rev" : "Neutral"}</small></div></div>
      </div>
      <div class="gauges">
        <div class="gauge"><div class="lbl">Gradient ahead</div><div class="val">${(() => { const g = w.gradeAhead(v, cab); return g === 0 ? "Level" : `${g > 0 ? "↗" : "↘"} ${Math.abs(g)}<small>‰ ${g > 0 ? "rising" : "falling"}</small>`; })()}</div></div>
        <div class="gauge ${v.parkingBrake ? "warn" : ""}"><div class="lbl">Parking brake</div><div class="val">${v.parkingBrake ? "On" : "Off"}</div></div>
        <div class="gauge"><div class="lbl">Height</div><div class="val">${w.layout.elevationAt(kmOf(v.pos), v.pos.edge.line).toFixed(0)}<small>m</small></div></div>
      </div>`;
    const lamps = `
      <div class="lamps">
        <span class="lamp ${lineV ? "on" : v.panto === "raising" || v.panto === "lowering" ? "amber" : "red"}">${lineV ? "Line 1.5 kV" : v.panto === "raising" ? "Panto rising" : v.panto === "lowering" ? "Panto lowering" : "No line volts"}</span>
        <span class="lamp ${c.anyDoorsOpen() ? "amber" : "on"}">Doors ${c.anyDoorsOpen() ? "open" : "closed"}</span>
        <span class="lamp ${c.brakeProved ? "on" : c.vehicles.length > 1 ? "red" : ""}">${c.brakeProved ? "Brake proved" : w.brakeTest ? `Testing ${Math.ceil(w.brakeTest.t)} s` : "Brake not proved"}</span>
        ${c.vehicles.length > 1 ? `<span class="lamp ${c.allPipesConnected() ? "on" : "red"}">${c.allPipesConnected() ? "Pipe through" : "Pipe parted"}</span>` : ""}
        ${w.stations.some((s) => s.baton.has(w.trainVehicle.number)) ? `<span class="lamp on"><span class="baton"></span>Baton shown</span>` : ""}
        ${!v.lineVolts && v.panto === "up" ? `<span class="lamp amber">Neutral section</span>` : ""}
      </div>`;
    const ctl = `
      <div class="ctl"><div class="lbl">Reverser<span class="k">R N F</span></div><div class="opts">${b("rev", "R", "Rev", cab.reverser === "R")}${b("rev", "N", "N", cab.reverser === "N")}${b("rev", "F", "Fwd", cab.reverser === "F")}</div></div>
      <div class="ctl"><div class="lbl">Power<span class="k">W S</span></div><div class="opts">${[0, 1, 2, 3, 4].map((n) => b("notch", String(n), String(n), cab.notch === n)).join("")}</div></div>
      <div class="ctl"><div class="lbl">Train brake<span class="k">A D</span></div><div class="opts">${BRAKE_NAMES.map((n, i) => b("brake", String(i), i === 0 ? "Rel" : i === 5 ? "Emerg" : n, cab.brake === i, i === 5 ? "red" : "")).join("")}</div></div>
      <div class="ctl"><div class="lbl">Parking brake<span class="k">B</span></div><div class="opts">${b("park", "off", "Off", !v.parkingBrake)}${b("park", "on", "On", v.parkingBrake, v.parkingBrake ? "red" : "")}</div></div>
      <div class="ctl"><div class="lbl">Pantograph<span class="k">P</span></div><div class="opts">${b("panto", "", v.panto === "up" || v.panto === "raising" ? "Up" : "Down", v.panto === "up")}</div></div>
      <div class="ctl"><div class="lbl">Lights ${cab.end}<span class="k">L</span></div><div class="opts">${b("lights", "off", "Off", cab.lights === "off")}${b("lights", "tail", "Tail", cab.lights === "tail", cab.lights === "tail" ? "red" : "")}${b("lights", "head", "Head", cab.lights === "head")}</div></div>
      <div class="ctl"><div class="lbl">Doors<span class="k">O</span></div><div class="opts">${b("doors", "", c.anyDoorsOpen() ? "Open" : "Closed", c.anyDoorsOpen())}${b("horn", "", "Horn", w.hornHeld !== null)}${b("test", "", "Prove brake", false)}</div></div>
      <div class="ctl"><div class="lbl">Cab<span class="k">C</span></div><div class="opts">${b("leave", "", "Leave cab", false)}</div></div>`;
    const otherLights = Object.values(v.cabs).filter((x) => x && x.end !== cab.end).map((x) => `other end ${x!.end}: ${x!.lights}`).join(", ");
    return `<h4>Cab ${cab.end} · ${v.type.cls} ${v.number} <span class="where">${esc(otherLights)}</span></h4>${gauges}${lamps}${ctl}`;
  }

  private renderAhead(): string {
    const w = this.world;
    const c = w.driverConsist;
    if (!c || w.driver.kind !== "cab") return "";
    const items = w.ahead(c).slice(0, 5);
    const lead = c.leadingPos(c.v >= 0 ? 1 : -1);
    const rows = items.map((i) => {
      let asp = "";
      if (i.kind === "signal" && i.obj && i.obj.kind === "signal") {
        const col = i.aspect === "clear" ? "#2E9E5B" : i.aspect === "caution" ? "#D9A21B" : i.aspect === "shunt" ? "#fff" : "#C6321E";
        asp = `<span class="asp" style="background:${col}"></span>`;
      }
      const txt = i.kind === "signal" ? `${i.label} · ${(i.aspect ?? "").toUpperCase()}` : i.label;
      return `<tr class="${i.applies ? "" : "dim"}"><td>${asp}${esc(txt)}</td><td class="d">${i.dist.toFixed(0)} m</td></tr>`;
    }).join("");
    return `<h4>Ahead <span class="where">km ${kmOf(lead).toFixed(3)} · ${c.isTrain ? "train" : "shunting move"}</span></h4><table>${rows || "<tr><td>Nothing within 1.2 km</td></tr>"}</table>`;
  }

  private renderMessages(): string {
    return this.world.messages.slice(-60).map((m) => `<div class="msg ${m.kind}"><div class="from"><span class="t">${fmtTime(m.t)}</span>${esc(m.from)}</div><div class="text">${esc(m.text)}</div></div>`).join("");
  }

  private renderSheet(): string {
    const d = this.duty;
    const w = this.world;
    const rows = d.legs.map((l, i) => {
      const cls = l.phase === "done" ? "done" : i === d.index ? "cur" : "";
      const dep = l.departed !== undefined ? fmtTime(l.departed) : "";
      const arr = l.arrived !== undefined ? fmtTime(l.arrived) : "";
      const canSkip = i === d.index && l.phase === "waiting" && w.time < parseTime(l.leg.dep) - 15 && w.skipUntil === null;
      const depCell = canSkip
        ? `<button class="skip" data-a="skipto" data-v="${i}" title="Advance the clock to 15 s before this departure">${l.leg.dep} ▸</button>`
        : w.skipUntil !== null && i === d.index ? `<span class="skipping">${l.leg.dep} …</span>` : l.leg.dep;
      return `<tr class="${cls}"><td>${l.leg.from}</td><td>${depCell}</td><td>${dep}</td><td>${l.leg.to}</td><td>${l.leg.arr}</td><td>${arr}</td></tr>`;
    }).join("");
    const prep = d.prep.map((p) => `<li>${esc(p)}</li>`).join("");
    return `<div class="sheet"><table><thead><tr><th>From</th><th>Dep</th><th>Actual</th><th>To</th><th>Arr</th><th>Actual</th></tr></thead><tbody>${rows}</tbody></table><h4>The duty in brief</h4><ol>${prep}</ol><p class="hint">Waiting for a departure? Click its booked time to bring the clock to 15 s before it. The world runs on meanwhile; the clock stops early if anything moves or is written in the Incident Book.</p></div>`;
  }

  private renderIncidents(): string {
    const inc = this.world.incidents;
    if (inc.length === 0) return `<div class="incidents"><p class="clean">Nothing written. A clean duty so far.</p></div>`;
    return `<div class="incidents">${inc.map((i) => `<div class="inc ${i.note ? "note" : ""}"><span class="t">${fmtTime(i.t)}</span>${esc(i.text)}</div>`).join("")}</div>`;
  }
}
