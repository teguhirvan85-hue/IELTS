// Draws Academic Writing Task 1 charts (line, bar, pie, table) from their data as SVG.
// Series colours are the validated colour-blind-safe order; every series also has its own
// marker shape and a direct label, and the numbers are always available as a table.
import { h } from "/ui.js";

// Colours come from CSS (--series-1 … --series-8), so light and dark mode each use their
// own validated steps of the same palette.
const COLORS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const SHAPES = ["circle", "square", "triangle", "diamond"];
const NS = "http://www.w3.org/2000/svg";

function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// A round tick step (1, 2, 2.5 or 5 × 10ⁿ) giving about five ticks, and the axis top
// just above the largest value.
function scale(maxValue) {
  if (maxValue > 80 && maxValue <= 100) return { step: 20, max: 100 }; // percentages: stop at 100
  const target = Math.max(maxValue * 1.05, 1e-9) / 5;
  const pow = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= target);
  return { step, max: Math.ceil((maxValue * 1.05) / step) * step };
}

function marker(shape, x, y, color) {
  const r = 4.5;
  const ring = { style: `fill:${color};stroke:var(--chart-surface)`, "stroke-width": 2 };
  if (shape === "square") return s("rect", { x: x - r, y: y - r, width: r * 2, height: r * 2, ...ring });
  if (shape === "triangle") return s("path", { d: `M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z`, ...ring });
  if (shape === "diamond") return s("path", { d: `M${x},${y - r - 1.5} L${x + r + 1.5},${y} L${x},${y + r + 1.5} L${x - r - 1.5},${y} Z`, ...ring });
  return s("circle", { cx: x, cy: y, r, ...ring });
}

// Legend for two or more series: the mark beside the name carries the identity.
function legend(series, kind) {
  if (series.length < 2) return null;
  return h("div", { class: "chart-legend" }, series.map((ser, i) => {
    const key = s("svg", { width: 22, height: 12, "aria-hidden": "true" });
    if (kind === "line") {
      key.append(s("line", { x1: 0, y1: 6, x2: 22, y2: 6, style: `stroke:${COLORS[i]}`, "stroke-width": 2 }), marker(SHAPES[i], 11, 6, COLORS[i]));
    } else key.append(s("rect", { x: 4, y: 1, width: 14, height: 10, rx: 2, style: `fill:${COLORS[i]}` }));
    return h("span", { class: "lg" }, key, ser.name);
  }));
}

function axes(svg, { W, H, m, max, step, unit }) {
  const n = Math.round(max / step);
  for (let i = 0; i <= n; i++) {
    const v = step * i;
    const y = H - m.b - ((H - m.t - m.b) * i) / n;
    svg.append(s("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "c-grid" }));
    svg.append(s("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", class: "c-tick" }, fmt(v)));
  }
  // The unit sits above the axis, starting at the left edge so long units are never cut off.
  if (unit) svg.append(s("text", { x: 4, y: m.t - 14, "text-anchor": "start", class: "c-unit" }, unit));
}

function lineChart(c) {
  const W = 680, H = 360, m = { l: 56, r: 120, t: 34, b: 40 };
  const all = c.series.flatMap((x) => x.values);
  const { max, step } = scale(Math.max(...all));
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, c.categories.length - 1);
  const y = (v) => H - m.b - ((H - m.t - m.b) * v) / max;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": c.title });
  axes(svg, { W, H, m, max, step, unit: c.unit });
  c.categories.forEach((cat, i) => svg.append(s("text", { x: x(i), y: H - m.b + 20, "text-anchor": "middle", class: "c-tick" }, cat)));
  // End labels, nudged apart when lines finish close together.
  const ends = c.series.map((ser, i) => ({ i, name: ser.name, y: y(ser.values.at(-1)) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 15);
  c.series.forEach((ser, i) => {
    svg.append(s("path", { d: ser.values.map((v, k) => `${k ? "L" : "M"}${x(k)},${y(v)}`).join(""), fill: "none", style: `stroke:${COLORS[i]}`, "stroke-width": 2, "stroke-linejoin": "round" }));
    ser.values.forEach((v, k) => svg.append(marker(SHAPES[i], x(k), y(v), COLORS[i])));
  });
  if (c.series.length > 1) for (const e of ends) svg.append(s("text", { x: x(c.categories.length - 1) + 12, y: e.y + 4, class: "c-label" }, e.name));
  return svg;
}

function barChart(c) {
  const W = 680, H = 360, m = { l: 56, r: 16, t: 34, b: 52 };
  const { max, step } = scale(Math.max(...c.series.flatMap((x) => x.values)));
  const band = (W - m.l - m.r) / c.categories.length;
  const bar = Math.min(26, (band * 0.76) / c.series.length);
  const y = (v) => H - m.b - ((H - m.t - m.b) * v) / max;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": c.title });
  axes(svg, { W, H, m, max, step, unit: c.unit });
  c.categories.forEach((cat, i) => {
    const cx = m.l + band * i + band / 2;
    const start = cx - (bar * c.series.length) / 2;
    c.series.forEach((ser, k) => {
      const v = ser.values[i];
      const top = y(v);
      const x0 = start + k * bar + 1;
      const w = bar - 2; // 2px surface gap between touching bars
      const r = Math.min(4, w / 2, (H - m.b - top) / 2);
      svg.append(s("path", { d: `M${x0},${H - m.b} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + w - r} Q${x0 + w},${top} ${x0 + w},${top + r} V${H - m.b} Z`, style: `fill:${COLORS[k]}` }, null));
    });
    const label = s("text", { x: cx, y: H - m.b + 18, "text-anchor": "middle", class: "c-tick" }, cat);
    svg.append(label);
  });
  return svg;
}

function pieChart(c) {
  const R = 96, gap = 60;
  const W = c.series.length * (R * 2 + gap) + 140, H = R * 2 + 90;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart-svg", role: "img", "aria-label": c.title });
  c.series.forEach((ser, p) => {
    const cx = 70 + R + p * (R * 2 + gap), cy = R + 40;
    svg.append(s("text", { x: cx, y: 22, "text-anchor": "middle", class: "c-pie-title" }, ser.name));
    const total = ser.values.reduce((a, b) => a + b, 0) || 1;
    let angle = -Math.PI / 2;
    ser.values.forEach((v, i) => {
      const a = (v / total) * Math.PI * 2;
      const end = angle + a;
      const large = a > Math.PI ? 1 : 0;
      const p1 = [cx + R * Math.cos(angle), cy + R * Math.sin(angle)];
      const p2 = [cx + R * Math.cos(end), cy + R * Math.sin(end)];
      svg.append(s("path", { d: `M${cx},${cy} L${p1[0]},${p1[1]} A${R},${R} 0 ${large} 1 ${p2[0]},${p2[1]} Z`, style: `fill:${COLORS[i % COLORS.length]};stroke:var(--chart-surface)`, "stroke-width": 2 }));
      const mid = angle + a / 2;
      const inside = v / total >= 0.09;
      const lr = inside ? R * 0.62 : R + 16;
      const lx = cx + lr * Math.cos(mid), ly = cy + lr * Math.sin(mid);
      const anchor = inside ? "middle" : Math.cos(mid) >= 0 ? "start" : "end";
      svg.append(s("text", { x: lx, y: ly + 4, "text-anchor": anchor, class: inside ? "c-slice" : "c-tick" }, `${fmt(v)}%`));
      angle = end;
    });
  });
  return svg;
}

function dataTable(c) {
  return h("div", { class: "table-wrap" }, h("table", { class: "chart-table" },
    h("thead", {}, h("tr", {}, h("th", { text: c.unit ? `(${c.unit})` : "" }), c.series.map((ser) => h("th", { text: ser.name })))),
    h("tbody", {}, c.categories.map((cat, i) => h("tr", {}, h("th", { text: cat }), c.series.map((ser) => h("td", { text: fmt(ser.values[i]) })))))));
}

// Pie slices are named in a shared key under the pies, in slice order.
function pieKey(c) {
  return h("div", { class: "chart-legend" }, c.categories.map((cat, i) => {
    const key = s("svg", { width: 14, height: 12, "aria-hidden": "true" });
    key.append(s("rect", { x: 1, y: 1, width: 12, height: 10, rx: 2, style: `fill:${COLORS[i % COLORS.length]}` }));
    return h("span", { class: "lg" }, key, cat);
  }));
}

export function renderChart(kind, chart) {
  const fig = h("figure", { class: "chart" }, h("figcaption", { class: "chart-title", text: chart.title }));
  if (kind === "table") {
    fig.append(dataTable(chart));
    return fig;
  }
  const svg = kind === "line" ? lineChart(chart) : kind === "bar" ? barChart(chart) : pieChart(chart);
  fig.append(...[kind === "pie" ? null : legend(chart.series, kind), svg, kind === "pie" ? pieKey(chart) : null].filter(Boolean));
  fig.append(h("details", { class: "chart-data" }, h("summary", { text: "Lihat angka sebagai tabel" }), dataTable(chart)));
  return fig;
}
