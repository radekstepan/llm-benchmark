#!/usr/bin/env node
/**
 * Results web server — serve benchmark results as a beautiful, minimal web app.
 * Usage: node dist/serve.js [port]  (default: 4000)
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = parseInt(process.argv[2] ?? process.env.PORT ?? '4000', 10);

function readResults(): string {
  const p = join(process.cwd(), 'results', 'benchmarks.json');
  return existsSync(p) ? readFileSync(p, 'utf-8') : '{"models":[]}';
}

// ---------------------------------------------------------------------------
// HTML page (fully self-contained, no external deps)
// ---------------------------------------------------------------------------
const PAGE = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LLM Benchmark</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f5f5f4;--card:#fff;--border:#e7e5e4;
  --text:#1c1917;--muted:#78716c;--faint:#a8a29e;
  --red:#dc2626;--red-light:#fee2e2;
  font-size:14px;
}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,ui-sans-serif,sans-serif;line-height:1.5;min-height:100vh}

/* ── Header ──────────────────────────────────────────── */
.hdr{
  position:sticky;top:0;z-index:20;
  background:rgba(255,255,255,.9);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--border);
  height:52px;padding:0 28px;
  display:flex;align-items:center;gap:12px;
}
.logo{
  display:flex;align-items:center;gap:9px;
  font-size:13px;font-weight:600;letter-spacing:-.02em;color:var(--text);
  text-decoration:none;
}
.logo-mark{
  width:26px;height:26px;border-radius:7px;
  background:var(--text);
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;
}
.hdr-meta{margin-left:auto;font-size:11px;color:var(--faint);letter-spacing:.01em}

/* ── Toolbar ─────────────────────────────────────────── */
.toolbar{
  background:var(--card);border-bottom:1px solid var(--border);
  padding:10px 28px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;
}
.fg{display:flex;align-items:center;gap:8px}
.fg-label{font-size:10.5px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.07em;white-space:nowrap}
.pills{display:flex;gap:5px;flex-wrap:wrap}
.pill{
  padding:4px 11px;border-radius:99px;font-size:11.5px;font-weight:500;
  border:1.5px solid var(--border);background:transparent;color:var(--muted);
  cursor:pointer;transition:all .12s;white-space:nowrap;
}
.pill:hover{border-color:#a8a29e;color:var(--text)}
.pill.on{color:#fff!important;border-color:transparent!important}

/* ── Main ────────────────────────────────────────────── */
.main{padding:24px 28px;max-width:1200px;margin:0 auto}

/* ── Cards ───────────────────────────────────────────── */
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.card-head{padding:18px 22px 6px;display:flex;align-items:baseline;gap:7px}
.card-title{font-size:12px;font-weight:600;letter-spacing:.005em}
.card-unit{font-size:11px;color:var(--faint)}

/* ── Chart grid ──────────────────────────────────────── */
.cgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:720px){.cgrid{grid-template-columns:1fr}}
.ch-svg{display:block;width:100%;height:240px}

/* ── Legend ──────────────────────────────────────────── */
.legend{padding:4px 22px 16px;display:flex;flex-wrap:wrap;gap:14px}
.li{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}
.li-swatch{width:14px;height:2.5px;border-radius:2px}
.li-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.li-circle{width:7px;height:7px;border-radius:50%;flex-shrink:0;border:1.5px solid var(--border)}

/* ── Stats grid ──────────────────────────────────────── */
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.sc{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 20px}
.sc-label{font-size:10px;font-weight:600;color:var(--faint);text-transform:uppercase;letter-spacing:.07em}
.sc-model{font-size:10px;color:var(--faint);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-val{font-size:26px;font-weight:600;letter-spacing:-.04em;line-height:1}
.sc-unit{font-size:12px;font-weight:400;color:var(--muted)}
.sc-sub{font-size:10.5px;color:var(--faint);margin-top:4px}

/* ── Tooltip ─────────────────────────────────────────── */
#tip{
  position:fixed;pointer-events:none;z-index:99;
  background:var(--text);color:#fafaf9;
  border-radius:9px;padding:9px 14px;
  font-size:11.5px;line-height:1.7;
  box-shadow:0 8px 24px rgba(0,0,0,.18);
  transition:opacity .08s;
}
#tip b{font-size:12.5px;font-weight:600;display:block;margin-bottom:1px}
#tip span{color:#d6d3d1}

/* ── Empty state ─────────────────────────────────────── */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;gap:8px;color:var(--faint)}
.empty-icon{font-size:28px;opacity:.35}
.empty-msg{font-size:12px}
.empty-cmd{font-size:11px;font-family:ui-monospace,monospace;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:4px 10px;margin-top:4px;color:var(--muted)}
</style>
</head>
<body>

<header class="hdr">
  <a class="logo" href="/">
    <div class="logo-mark">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="9" width="3" height="5.5" fill="white" rx=".8"/>
        <rect x="6.5" y="5" width="3" height="9.5" fill="white" rx=".8"/>
        <rect x="11.5" y="1.5" width="3" height="13" fill="white" rx=".8"/>
      </svg>
    </div>
    llm-benchmark
  </a>
  <span class="hdr-meta" id="hdr-meta"></span>
</header>

<div class="toolbar" id="toolbar">
  <div class="fg">
    <span class="fg-label">Device</span>
    <div class="pills" id="device-pills"></div>
  </div>
  <div class="fg">
    <span class="fg-label">Model</span>
    <div class="pills" id="model-pills"></div>
  </div>
</div>

<main class="main">
  <div class="cgrid">
    <div class="card">
      <div class="card-head">
        <span class="card-title">Throughput</span>
        <span class="card-unit">tokens / second</span>
      </div>
      <svg id="tps-svg" class="ch-svg"></svg>
      <div class="legend" id="tps-leg"></div>
    </div>
    <div class="card">
      <div class="card-head">
        <span class="card-title">Time to First Token</span>
        <span class="card-unit">latency</span>
      </div>
      <svg id="ttft-svg" class="ch-svg"></svg>
      <div class="legend" id="ttft-leg"></div>
    </div>
  </div>
  <div class="sgrid" id="sgrid"></div>
</main>

<div id="tip" style="display:none"></div>

<script>
'use strict';

// ── Config ────────────────────────────────────────────────────────────────
const PALETTE = ['#2563eb','#16a34a','#9333ea','#ea580c','#be123c','#0284c7','#ca8a04'];
const MIN_TPS  = 2.0;   // threshold line

// ── State ─────────────────────────────────────────────────────────────────
let DB          = { models: [] };
let selDevice   = null;
let selModels   = new Set();
let hoveredCtx  = null;   // shared hover state across charts

// ── DOM helpers ───────────────────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function se(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function de(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ── Formatters ────────────────────────────────────────────────────────────
function fK(v)    { return v >= 1000 ? (v/1000).toFixed(v%1000===0?0:1).replace(/\.0$/,'')+'K' : String(v); }
function fTPS(v)  { return v.toFixed(1); }
function fTTFT(v) {
  if (v >= 60000) return (v/60000).toFixed(1)+'m';
  if (v >= 1000)  return (v/1000).toFixed(v>=10000?0:1).replace(/\.0$/,'')+'s';
  return v+'ms';
}

// ── Nice axis ticks ───────────────────────────────────────────────────────
function niceTicks(lo, hi, n) {
  if (lo === hi) hi = lo + 1;
  const raw  = (hi - lo) / Math.max(n - 1, 1);
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / mag;
  const step = frac < 1.5 ? mag : frac < 3.5 ? 2*mag : frac < 7.5 ? 5*mag : 10*mag;
  const slo  = Math.floor(lo / step) * step;
  const shi  = Math.ceil(hi / step)  * step;
  const ticks = [];
  for (let v = slo; v <= shi + step*1e-9; v = Math.round((v+step)*1e10)/1e10) ticks.push(v);
  return { ticks, lo: slo, hi: shi };
}

// ── Monotone cubic spline ─────────────────────────────────────────────────
function splinePath(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return \`M\${pts[0].x},\${pts[0].y}\`;
  const n = pts.length;
  const dx = [], dy = [];
  for (let i = 0; i < n-1; i++) { dx[i] = pts[i+1].x-pts[i].x; dy[i] = pts[i+1].y-pts[i].y; }
  const s = dx.map((d,i) => d===0 ? 0 : dy[i]/d);
  const m = new Array(n);
  m[0] = s[0]; m[n-1] = s[n-2];
  for (let i = 1; i < n-1; i++) {
    if (s[i-1]===0||s[i]===0||(s[i-1]<0)!==(s[i]<0)) { m[i]=0; continue; }
    const dd = dx[i-1]+dx[i];
    m[i] = 3*dd / ((dx[i-1]+dd)/s[i-1] + (dx[i]+dd)/s[i]);
  }
  let d = \`M\${pts[0].x.toFixed(1)},\${pts[0].y.toFixed(1)}\`;
  for (let i = 0; i < n-1; i++) {
    d += \` C\${(pts[i].x+dx[i]/3).toFixed(1)},\${(pts[i].y+m[i]*dx[i]/3).toFixed(1)}\`
       + \` \${(pts[i+1].x-dx[i]/3).toFixed(1)},\${(pts[i+1].y-m[i+1]*dx[i]/3).toFixed(1)}\`
       + \` \${pts[i+1].x.toFixed(1)},\${pts[i+1].y.toFixed(1)}\`;
  }
  return d;
}

// ── Data helpers ──────────────────────────────────────────────────────────
function getDevices() {
  const m = new Map();
  for (const e of DB.models) {
    if (!m.has(e.hardwareFingerprint)) {
      const info = e.hardwareInfo;
      m.set(e.hardwareFingerprint, info ? \`\${info.cpu} · \${info.ramGb} GB\` : e.hardwareFingerprint.slice(0,8)+'…');
    }
  }
  return m;
}
function getModelIds()    { return [...new Set(DB.models.map(e => e.modelId))]; }
function shortModel(id)   { return id.split('/').pop(); }
function activeSeries()   {
  if (!selDevice) return [];
  const models = getModelIds();
  return DB.models
    .filter(e => e.hardwareFingerprint === selDevice && selModels.has(e.modelId))
    .map(e => ({ ...e, color: PALETTE[models.indexOf(e.modelId) % PALETTE.length] }));
}

// ── Toolbar ───────────────────────────────────────────────────────────────
function buildToolbar() {
  const devices = getDevices();
  const models  = getModelIds();
  if (!selDevice && devices.size) selDevice = [...devices.keys()][0];
  for (const id of models) selModels.add(id);

  // Device pills (single-select)
  const dp = $('device-pills');
  dp.innerHTML = '';
  devices.forEach((label, fp) => {
    const b = de('button', 'pill' + (fp===selDevice?' on':''));
    b.textContent = label;
    b.onclick = () => { selDevice = fp; buildToolbar(); render(); };
    dp.appendChild(b);
  });

  // Model pills (multi-select, coloured when active)
  const modelColors = new Map(models.map((id,i) => [id, PALETTE[i%PALETTE.length]]));
  const mp = $('model-pills');
  mp.innerHTML = '';
  for (const id of models) {
    const on = selModels.has(id);
    const b  = de('button', 'pill' + (on?' on':''));
    b.textContent = shortModel(id);
    if (on) { b.style.background = modelColors.get(id); b.style.borderColor = modelColors.get(id); }
    b.onclick = () => {
      if (selModels.has(id)) { if (selModels.size > 1) selModels.delete(id); }
      else selModels.add(id);
      buildToolbar(); render();
    };
    mp.appendChild(b);
  }
}

// ── Chart render ──────────────────────────────────────────────────────────
function renderChart(svgEl, { series, yGet, yFmt, showProbes, showThreshold }) {
  svgEl.innerHTML = '';
  const W  = svgEl.getBoundingClientRect().width  || 520;
  const H  = svgEl.getBoundingClientRect().height || 240;
  const mg = { t:14, r:14, b:42, l:54 };
  const iw = W - mg.l - mg.r;
  const ih = H - mg.t - mg.b;

  const hasBench = series.some(s => s.benchmarks?.length);
  if (!hasBench) {
    const fo = se('foreignObject', { x:0, y:0, width:W, height:H });
    const d  = de('div', 'empty');
    d.innerHTML = '<div class="empty-icon">◦</div>'
      + '<div class="empty-msg">No benchmark data</div>'
      + '<div class="empty-cmd">npm run bench -- &lt;model-id&gt;</div>';
    fo.appendChild(d);
    svgEl.appendChild(fo);
    return;
  }

  // ── collect extent ────────────────────────────────────────────────────
  let allX = [], allY = [];
  for (const s of series) {
    for (const b of (s.benchmarks||[])) { allX.push(b.contextUsed); allY.push(yGet(b)); }
    if (showProbes) for (const p of (s.contextProbes||[])) { if (p.tps!==null) { allX.push(p.contextSize); allY.push(p.tps); } }
  }
  if (showThreshold) allY.push(MIN_TPS);

  const xs = niceTicks(0, Math.max(...allX)*1.04, 6);
  const ys = niceTicks(0, Math.max(...allY)*1.12, 5);

  const xp = v => mg.l + (v - xs.lo) / (xs.hi - xs.lo) * iw;
  const yp = v => H - mg.b - (v - ys.lo) / (ys.hi - ys.lo) * ih;

  // ── defs (gradients + clip) ───────────────────────────────────────────
  const defs  = se('defs');
  const clip  = se('clipPath', { id:'ch-clip' });
  clip.appendChild(se('rect', { x:mg.l, y:mg.t, width:iw, height:ih }));
  defs.appendChild(clip);
  svgEl.appendChild(defs);

  // ── grid ──────────────────────────────────────────────────────────────
  const gridG = se('g', { opacity:.6 });
  for (const v of ys.ticks) {
    const y = yp(v);
    gridG.appendChild(se('line', { x1:mg.l, x2:W-mg.r, y1:y.toFixed(1), y2:y.toFixed(1), stroke:'#e7e5e4', 'stroke-width':1 }));
    const t = se('text', { x:mg.l-8, y:(y+3.5).toFixed(1), 'text-anchor':'end', fill:'#a8a29e', 'font-size':10.5, 'font-family':'inherit' });
    t.textContent = yFmt(v);
    gridG.appendChild(t);
  }
  for (const v of xs.ticks) {
    if (v <= 0) continue;
    const x = xp(v);
    gridG.appendChild(se('line', { x1:x.toFixed(1), x2:x.toFixed(1), y1:mg.t, y2:H-mg.b, stroke:'#e7e5e4', 'stroke-width':1 }));
    const t = se('text', { x:x.toFixed(1), y:(H-mg.b+15).toFixed(1), 'text-anchor':'middle', fill:'#a8a29e', 'font-size':10.5, 'font-family':'inherit' });
    t.textContent = fK(v);
    gridG.appendChild(t);
  }
  svgEl.appendChild(gridG);

  // ── threshold line ────────────────────────────────────────────────────
  if (showThreshold) {
    const ty = yp(MIN_TPS);
    const tg = se('g');
    tg.appendChild(se('line', { x1:mg.l, x2:W-mg.r, y1:ty.toFixed(1), y2:ty.toFixed(1), stroke:'#fca5a5', 'stroke-width':1.5, 'stroke-dasharray':'5 4' }));
    const tl = se('text', { x:(W-mg.r+4).toFixed(1), y:(ty+3.5).toFixed(1), fill:'#fca5a5', 'font-size':9.5, 'font-family':'inherit' });
    tl.textContent = 'min';
    tg.appendChild(tl);
    svgEl.appendChild(tg);
  }

  // ── axis baseline ─────────────────────────────────────────────────────
  svgEl.appendChild(se('line', { x1:mg.l, x2:W-mg.r, y1:H-mg.b, y2:H-mg.b, stroke:'#e7e5e4', 'stroke-width':1 }));

  // ── series ────────────────────────────────────────────────────────────
  for (const s of series) {
    const color = s.color;
    const cg    = se('g', { 'clip-path':'url(#ch-clip)' });

    // Probe scatter dots
    if (showProbes) {
      for (const p of (s.contextProbes||[])) {
        if (p.tps === null) continue;
        const cx = xp(p.contextSize).toFixed(1);
        const cy = yp(p.tps).toFixed(1);
        if (p.passed) {
          cg.appendChild(se('circle', { cx, cy, r:3.5, fill:color, opacity:.28 }));
        } else {
          const c = se('circle', { cx, cy, r:3.5, fill:'none', stroke:'#c8c5c1', 'stroke-width':1.5, 'stroke-dasharray':'2.5 2' });
          cg.appendChild(c);
        }
      }
    }

    if (!s.benchmarks?.length) { svgEl.appendChild(cg); continue; }

    const sorted = [...s.benchmarks].sort((a,b) => a.contextUsed-b.contextUsed);
    const pts    = sorted.map(b => ({ x:xp(b.contextUsed), y:yp(yGet(b)), b }));

    // Gradient area fill
    const gid = \`g\${Math.random().toString(36).slice(2)}\`;
    const grad = se('linearGradient', { id:gid, x1:0, y1:0, x2:0, y2:1 });
    grad.appendChild(se('stop', { offset:'0%',   'stop-color':color, 'stop-opacity':.14 }));
    grad.appendChild(se('stop', { offset:'100%', 'stop-color':color, 'stop-opacity':.01 }));
    defs.appendChild(grad);

    const areaD = splinePath(pts)
      + \` L\${pts[pts.length-1].x.toFixed(1)},\${(H-mg.b)}\`
      + \` L\${pts[0].x.toFixed(1)},\${(H-mg.b)} Z\`;
    cg.appendChild(se('path', { d:areaD, fill:\`url(#\${gid})\` }));

    // Line
    cg.appendChild(se('path', { d:splinePath(pts), fill:'none', stroke:color, 'stroke-width':2.5, 'stroke-linejoin':'round', 'stroke-linecap':'round' }));

    // Dots
    for (const p of pts) {
      cg.appendChild(se('circle', { cx:p.x.toFixed(1), cy:p.y.toFixed(1), r:5, fill:'#fff', stroke:color, 'stroke-width':2.5 }));
    }

    svgEl.appendChild(cg);
  }

  // ── hover overlay ─────────────────────────────────────────────────────
  const crossV = se('line', { y1:mg.t, y2:H-mg.b, stroke:'#c8c5c1', 'stroke-width':1, 'stroke-dasharray':'4 3', opacity:0 });
  const hDots  = se('g');
  svgEl.appendChild(crossV);
  svgEl.appendChild(hDots);

  // invisible hit rect
  const hit = se('rect', { x:mg.l, y:mg.t, width:iw, height:ih, fill:'transparent', cursor:'crosshair' });
  svgEl.appendChild(hit);

  const tip = $('tip');

  function onMove(e) {
    const r   = svgEl.getBoundingClientRect();
    const mx  = e.clientX - r.left;
    if (mx < mg.l || mx > W - mg.r) { crossV.setAttribute('opacity',0); hDots.innerHTML=''; tip.style.display='none'; return; }

    // Find nearest context point (by x distance)
    let best=null, bestDist=Infinity;
    for (const s of series) {
      for (const b of (s.benchmarks||[])) {
        const d = Math.abs(xp(b.contextUsed)-mx);
        if (d < bestDist) { bestDist=d; best={s,b}; }
      }
    }
    if (!best || bestDist > 60) { crossV.setAttribute('opacity',0); hDots.innerHTML=''; tip.style.display='none'; return; }

    const bx = xp(best.b.contextUsed);
    crossV.setAttribute('x1', bx.toFixed(1));
    crossV.setAttribute('x2', bx.toFixed(1));
    crossV.setAttribute('opacity', 1);

    // Collect all series values at this ctx
    hDots.innerHTML = '';
    const lines = [];
    for (const s of series) {
      const match = (s.benchmarks||[]).find(b => b.contextUsed===best.b.contextUsed);
      if (!match) continue;
      const py = yp(yGet(match));
      hDots.appendChild(se('circle', { cx:bx.toFixed(1), cy:py.toFixed(1), r:6, fill:'#fff', stroke:s.color, 'stroke-width':2.5 }));
      lines.push(\`<span style="color:\${s.color}">●</span> \${shortModel(s.modelId)}: \${yFmt(yGet(match))}\`);
    }
    tip.innerHTML = \`<b>\${fK(best.b.contextUsed)} tokens</b>\` + lines.map(l=>\`<br>\${l}\`).join('');
    tip.style.display = '';

    // Position tip: keep within viewport
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let tx = e.clientX + 14, ty = e.clientY - th/2;
    if (tx + tw > window.innerWidth - 10) tx = e.clientX - tw - 14;
    if (ty < 8) ty = 8;
    if (ty + th > window.innerHeight - 8) ty = window.innerHeight - h - 8;
    tip.style.left = tx + 'px';
    tip.style.top  = ty + 'px';
  }

  hit.addEventListener('mousemove', onMove);
  hit.addEventListener('mouseleave', () => {
    crossV.setAttribute('opacity',0);
    hDots.innerHTML='';
    tip.style.display='none';
  });
}

// ── Legend ────────────────────────────────────────────────────────────────
function renderLegend(legEl, series, showProbes) {
  legEl.innerHTML='';
  for (const s of series) {
    const li = de('div','li');
    const sw = de('div','li-swatch'); sw.style.background=s.color;
    const dt = de('div','li-dot');   dt.style.background=s.color;
    li.append(sw, dt, document.createTextNode(' '+shortModel(s.modelId)));
    legEl.appendChild(li);
  }
  if (showProbes && series.some(s=>(s.contextProbes||[]).length)) {
    const lp = de('div','li');
    lp.innerHTML='<div class="li-dot" style="background:#d6d3d1;opacity:.8"></div> context search (passed)';
    legEl.appendChild(lp);
    const lf = de('div','li');
    lf.innerHTML='<div class="li-circle"></div> context search (failed)';
    legEl.appendChild(lf);
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────
function renderStats(series) {
  const sg = $('sgrid');
  sg.innerHTML='';
  for (const s of series) {
    const short  = shortModel(s.modelId);
    const sorted = [...(s.benchmarks||[])].sort((a,b)=>a.contextUsed-b.contextUsed);
    if (!sorted.length) continue;

    const bestTps     = sorted.reduce((m,b)=>b.tps>m.tps?b:m, sorted[0]);
    const fastestTtft = sorted.reduce((m,b)=>b.ttftMs<m.ttftMs?b:m, sorted[0]);

    function card(label, val, unit, sub) {
      const c = de('div','sc');
      c.innerHTML = \`<div class="sc-model" style="color:\${s.color}">\${short}</div>\`
        + \`<div class="sc-label">\${label}</div>\`
        + \`<div class="sc-val">\${val}<span class="sc-unit"> \${unit}</span></div>\`
        + \`<div class="sc-sub">\${sub}</div>\`;
      return c;
    }

    if (s.maxContext) sg.appendChild(card('Max context', fK(s.maxContext), 'tokens', 'usable window'));
    sg.appendChild(card('Peak throughput', fTPS(bestTps.tps), 't/s', \`at \${fK(bestTps.contextUsed)} tokens\`));
    sg.appendChild(card('Min latency', fTTFT(fastestTtft.ttftMs), '', \`at \${fK(fastestTtft.contextUsed)} tokens\`));
  }
}

// ── Full render pass ──────────────────────────────────────────────────────
function render() {
  const sa = activeSeries();

  renderChart($('tps-svg'),  { series:sa, yGet:b=>b.tps,    yFmt:fTPS,  showProbes:true,  showThreshold:true  });
  renderChart($('ttft-svg'), { series:sa, yGet:b=>b.ttftMs, yFmt:fTTFT, showProbes:false, showThreshold:false });
  renderLegend($('tps-leg'),  sa, true);
  renderLegend($('ttft-leg'), sa, false);
  renderStats(sa);
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const res = await fetch('/api/results');
    DB = await res.json();
  } catch(e) { console.error('Failed to load results:', e); }

  const n = DB.models.length;
  $('hdr-meta').textContent = n > 0
    ? \`\${n} result\${n===1?'':'s'} · \${getDevices().size} device\${getDevices().size===1?'':'s'}\`
    : 'no data yet';

  buildToolbar();
  render();
}

// Re-render on resize
const ro = new ResizeObserver(() => render());
ro.observe($('tps-svg'));

boot();
</script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(PAGE);
  } else if (req.url === '/api/results') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(readResults());
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`
  ┌────────────────────────────────────────────────
  │  LLM Benchmark Results
  │  http://localhost:${PORT}
  └────────────────────────────────────────────────
`);
});
