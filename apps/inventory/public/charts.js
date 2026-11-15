/* Small SVG charts, no dependencies. Exposes window.Charts. Colours come from CSS classes so both themes work. */
(function () {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = new Intl.NumberFormat("en-IN");
  const short = (n) => (n >= 1e7 ? (n / 1e7).toFixed(1) + " cr" : n >= 1e5 ? (n / 1e5).toFixed(1) + " L" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n)));

  /** Grouped daily bars: sold (accent) and received (good). days: [{day, sold, received}] */
  function dailyBars(days) {
    const W = 640, H = 220, padL = 36, padR = 8, padT = 10, padB = 28;
    const n = days.length || 1;
    const max = Math.max(1, ...days.map((d) => Math.max(d.sold, d.received)));
    const iw = (W - padL - padR) / n;
    const bw = Math.max(1, iw * 0.38);
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const ticks = [0, Math.ceil(max / 2), max];
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Units sold and received per day">`;
    for (const t of ticks) s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
    days.forEach((d, i) => {
      const x0 = padL + i * iw + (iw - 2 * bw - 2) / 2;
      if (d.sold) s += `<rect class="bar" x="${x0}" y="${y(d.sold)}" width="${bw}" height="${y(0) - y(d.sold)}" rx="1"><title>${esc(d.day)}: ${d.sold} sold</title></rect>`;
      if (d.received) s += `<rect class="bar in" x="${x0 + bw + 2}" y="${y(d.received)}" width="${bw}" height="${y(0) - y(d.received)}" rx="1"><title>${esc(d.day)}: ${d.received} received</title></rect>`;
      const step = n > 60 ? 14 : n > 30 ? 7 : 5;
      if (i % step === 0 || i === n - 1) s += `<text x="${padL + i * iw + iw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.day.slice(5))}</text>`;
    });
    s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
    return s;
  }

  /** Horizontal bars with labels: rows [{name, value, sub}] */
  function hBars(rows, opts = {}) {
    const total = Math.max(1, rows.reduce((a, r) => a + r.value, 0));
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<div class="table-wrap flat"><table><tbody>${rows
      .map((r) => `<tr><td>${esc(r.name)}${r.sub ? `<br><span class="muted small">${esc(r.sub)}</span>` : ""}</td><td class="r">${opts.money ? "₹" : ""}${fmt.format(Math.round(r.value))}</td><td class="r muted small">${Math.round((100 * r.value) / total)}%</td><td style="width:30%;min-width:70px"><div class="bar-h"><i style="width:${Math.round((100 * r.value) / max)}%"></i></div></td></tr>`)
      .join("")}</tbody></table></div>`;
  }

  window.Charts = { dailyBars, hBars, short, esc };
})();
