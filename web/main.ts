'use strict';

// Config
const PALETTE = ['#2563eb','#16a34a','#9333ea','#ea580c','#be123c','#0284c7','#ca8a04'];
const MIN_TPS  = 2.0;

// State
let DB: { models: any[] } = { models: [] };
let selDevice: string | null = null;
let selModels = new Set<string>();
let initialized = false;  // Track if initial auto-selection has happened
let hoveredCtx: any = null;
let openMenu: 'device' | 'model' | null = null;
let deviceQuery = '';
let modelQuery  = '';

// DOM helpers
const $  = (id: string) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function se(tag: string, attrs: Record<string, string> = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function de(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// Formatters
function fK(v: number) { return v >= 1000 ? (v/1000).toFixed(v%1000===0?0:1).replace(/\.0$/,'')+'K' : String(v); }
function fTPS(v: number) { return v.toFixed(1); }
function fTTFT(v: number) {
  if (v >= 60000) return (v/60000).toFixed(1)+'m';
  if (v >= 1000)  return (v/1000).toFixed(v>=10000?0:1).replace(/\.0$/,'')+'s';
  return v+'ms';
}

// Nice axis ticks
function niceTicks(lo: number, hi: number, n: number) {
  if (lo === hi) hi = lo + 1;
  const raw  = (hi - lo) / Math.max(n - 1, 1);
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / mag;
  const step = frac < 1.5 ? mag : frac < 3.5 ? 2*mag : frac < 7.5 ? 5*mag : 10*mag;
  const slo  = Math.floor(lo / step) * step;
  const shi  = Math.ceil(hi / step)  * step;
  const ticks: number[] = [];
  for (let v = slo; v <= shi + step*1e-9; v = Math.round((v+step)*1e10)/1e10) ticks.push(v);
  return { ticks, lo: slo, hi: shi };
}

// Monotone cubic spline
function splinePath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [], dy: number[] = [];
  for (let i = 0; i < n-1; i++) { dx[i] = pts[i+1].x-pts[i].x; dy[i] = pts[i+1].y-pts[i].y; }
  const s = dx.map((d,i) => d===0 ? 0 : dy[i]/d);
  const m: number[] = new Array(n);
  m[0] = s[0]; m[n-1] = s[n-2];
  for (let i = 1; i < n-1; i++) {
    if (s[i-1]===0||s[i]===0||(s[i-1]<0)!==(s[i]<0)) { m[i]=0; continue; }
    const dd = dx[i-1]+dx[i];
    m[i] = 3*dd / ((dx[i-1]+dd)/s[i-1] + (dx[i]+dd)/s[i]);
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n-1; i++) {
    d += ` C${(pts[i].x+dx[i]/3).toFixed(1)},${(pts[i].y+m[i]*dx[i]/3).toFixed(1)}`
       + ` ${(pts[i+1].x-dx[i]/3).toFixed(1)},${(pts[i+1].y-m[i+1]*dx[i]/3).toFixed(1)}`
       + ` ${pts[i+1].x.toFixed(1)},${pts[i+1].y.toFixed(1)}`;
  }
  return d;
}

// Data helpers
function getDevices() {
  const m = new Map<string, string>();
  for (const e of DB.models) {
    if (!m.has(e.hardwareFingerprint)) {
      const info = e.hardwareInfo;
      m.set(e.hardwareFingerprint, info ? `${info.cpu} · ${info.ramGb} GB` : e.hardwareFingerprint.slice(0,8)+'...');
    }
  }
  return m;
}
function getModelIds(device = selDevice) {
  return [...new Set(
    DB.models
      .filter((e: any) => !device || e.hardwareFingerprint === device)
      .map((e: any) => e.modelId),
  )];
}
function shortModel(id: string) { return id.split('/').pop(); }
function activeSeries() {
  if (!selDevice) return [];
  const models = getModelIds();
  return DB.models
    .filter((e: any) => e.hardwareFingerprint === selDevice && selModels.has(e.modelId))
    .map((e: any) => ({ ...e, color: PALETTE[models.indexOf(e.modelId) % PALETTE.length] }));
}

// Toolbar
function buildToolbar() {
  const devices = getDevices();
  if (!selDevice && devices.size) selDevice = [...devices.keys()][0];
  const models  = getModelIds(selDevice);

  // Only auto-select models on initial load
  if (!initialized && !selModels.size) {
    for (const id of models) selModels.add(id);
    initialized = true;
  }

  // Remove models that no longer exist for this device
  for (const id of [...selModels]) {
    if (!models.includes(id)) selModels.delete(id);
  }
  // Don't auto-select after clearing - user explicitly wants empty set

  const modelColors = new Map(models.map((id, i) => [id, PALETTE[i % PALETTE.length]]));

  // Device selector
  const ds = $('device-select');
  if (!ds) return;
  ds.innerHTML = '';
  const dTrigger = de('button', 'select-trigger');
  const selDeviceLabel = devices.get(selDevice!) || 'Select device';
  dTrigger.innerHTML = '<span class="select-value">' + selDeviceLabel + '</span><span class="select-arrow">▾</span>';
  dTrigger.onclick = (e) => {
    e.stopPropagation();
    openMenu = openMenu === 'device' ? null : 'device';
    buildToolbar();
  };
  ds.appendChild(dTrigger);

  if (openMenu === 'device') {
    const menu = de('div', 'select-menu');
    menu.onclick = (e) => e.stopPropagation();
    const input = de('input', 'select-search');
    (input as HTMLInputElement).placeholder = 'Search devices...';
    (input as HTMLInputElement).value = deviceQuery;
    input.oninput = () => {
      deviceQuery = (input as HTMLInputElement).value.toLowerCase();
      buildToolbar();
    };
    menu.appendChild(input);

    const list = de('div', 'select-list');
    const rows = [...devices.entries()].filter(([, label]) =>
      label.toLowerCase().includes(deviceQuery),
    );

    if (!rows.length) {
      list.appendChild(de('div', 'select-empty', 'No matching devices'));
    }

    for (const [fp, label] of rows) {
      const btn = de('button', 'select-item');
      const on = fp === selDevice;
      btn.innerHTML = '<span class="mark radio ' + (on ? 'on' : '') + '">' + (on ? '•' : '') + '</span><span>' + label + '</span>';
      btn.onclick = () => {
        selDevice = fp;
        openMenu = null;
        const newModels = getModelIds(fp);
        selModels = new Set(newModels);
        modelQuery = '';
        buildToolbar();
        render();
      };
      list.appendChild(btn);
    }

    menu.appendChild(list);
    ds.appendChild(menu);
    setTimeout(() => (input as HTMLInputElement).focus(), 0);
  }

  // Model selector
  const ms = $('model-select');
  if (!ms) return;
  ms.innerHTML = '';
  const mTrigger = de('button', 'select-trigger');
  const selectedModels = [...selModels].map(shortModel);
  const modelLabel = selectedModels.length === models.length
    ? 'All models (' + models.length + ')'
    : selectedModels.length === 0
      ? 'No models selected'
      : selectedModels.length === 1
        ? selectedModels[0]
        : selectedModels.length + ' models selected';
  mTrigger.innerHTML = '<span class="select-value">' + modelLabel + '</span><span class="select-arrow">▾</span>';
  mTrigger.onclick = (e) => {
    e.stopPropagation();
    openMenu = openMenu === 'model' ? null : 'model';
    buildToolbar();
  };
  ms.appendChild(mTrigger);

  if (openMenu === 'model') {
    const menu = de('div', 'select-menu');
    menu.onclick = (e) => e.stopPropagation();
    const input = de('input', 'select-search');
    (input as HTMLInputElement).placeholder = 'Search models...';
    (input as HTMLInputElement).value = modelQuery;
    input.oninput = () => {
      modelQuery = (input as HTMLInputElement).value.toLowerCase();
      buildToolbar();
    };
    menu.appendChild(input);

    const actions = de('div', 'select-actions');
    const allBtn = de('button', 'select-act', 'Select all');
    allBtn.onclick = () => {
      selModels = new Set(models);
      buildToolbar();
      render();
    };
    const noneBtn = de('button', 'select-act', 'Clear all');
    noneBtn.onclick = () => {
      selModels = new Set();
      buildToolbar();
      render();
    };
    actions.append(allBtn, noneBtn);
    menu.appendChild(actions);

    const list = de('div', 'select-list');
    const rows = models.filter(id => id.toLowerCase().includes(modelQuery));

    if (!rows.length) {
      list.appendChild(de('div', 'select-empty', 'No matching models'));
    }

    for (const id of rows) {
      const on = selModels.has(id);
      const color = modelColors.get(id);
      const btn = de('button', 'select-item');
      btn.innerHTML = '<span class="mark ' + (on ? 'on' : '') + '">' + (on ? '✓' : '') + '</span><span class="swatch" style="background:' + color + '"></span><span>' + shortModel(id) + '</span>';
      btn.onclick = () => {
        if (on) selModels.delete(id);
        else selModels.add(id);
        buildToolbar();
        render();
      };
      list.appendChild(btn);
    }

    menu.appendChild(list);
    ms.appendChild(menu);
    setTimeout(() => (input as HTMLInputElement).focus(), 0);
  }
}

// Chart render
function renderChart(svgEl: SVGSVGElement, opts: { series: any[]; yGet: (b: any) => number; yFmt: (v: number) => string; showProbes: boolean; showThreshold: boolean }) {
  const { series, yGet, yFmt, showProbes, showThreshold } = opts;
  svgEl.innerHTML = '';
  const W  = svgEl.getBoundingClientRect().width  || 520;
  const H  = svgEl.getBoundingClientRect().height || 240;
  const mg = { t:14, r:14, b:42, l:54 };
  const iw = W - mg.l - mg.r;
  const ih = H - mg.t - mg.b;

  // Check if no models are selected - show specific message
  if (selModels.size === 0) {
    const fo = se('foreignObject', { x:'0', y:'0', width:String(W), height:String(H) });
    const d  = de('div', 'empty');
    d.innerHTML = '<div class="empty-msg">No models selected</div>'
      + '<div class="empty-cmd">Use the selector above to pick models</div>';
    fo.appendChild(d);
    svgEl.appendChild(fo);
    return;
  }

  const hasBench = series.some((s: any) => s.benchmarks?.length);
  if (!hasBench) {
    const fo = se('foreignObject', { x:'0', y:'0', width:String(W), height:String(H) });
    const d  = de('div', 'empty');
    d.innerHTML = '<div class="empty-msg">No benchmark data</div>'
      + '<div class="empty-cmd">npm run bench -- &lt;model-id&gt;</div>';
    fo.appendChild(d);
    svgEl.appendChild(fo);
    return;
  }

  // Collect extent
  let allX: number[] = [], allY: number[] = [];
  for (const s of series) {
    for (const b of (s.benchmarks||[])) { allX.push(b.contextUsed); allY.push(yGet(b)); }
    if (showProbes) for (const p of (s.contextProbes||[])) { if (p.tps!==null) { allX.push(p.contextSize); allY.push(p.tps); } }
  }
  if (showThreshold) allY.push(MIN_TPS);

  const xs = niceTicks(0, Math.max(...allX)*1.04, 6);
  const ys = niceTicks(0, Math.max(...allY)*1.12, 5);

  const xp = (v: number) => mg.l + (v - xs.lo) / (xs.hi - xs.lo) * iw;
  const yp = (v: number) => H - mg.b - (v - ys.lo) / (ys.hi - ys.lo) * ih;

  // Defs
  const defs  = se('defs');
  const clip  = se('clipPath', { id:'ch-clip' });
  clip.appendChild(se('rect', { x:String(mg.l), y:String(mg.t), width:String(iw), height:String(ih) }));
  defs.appendChild(clip);
  svgEl.appendChild(defs);

  // Grid
  const gridG = se('g', { opacity:'.6' });
  for (const v of ys.ticks) {
    const y = yp(v);
    gridG.appendChild(se('line', { x1:String(mg.l), x2:String(W-mg.r), y1:y.toFixed(1), y2:y.toFixed(1), stroke:'#e7e5e4', 'stroke-width':'1' }));
    const t = se('text', { x:String(mg.l-8), y:(y+3.5).toFixed(1), 'text-anchor':'end', fill:'#a8a29e', 'font-size':'10.5', 'font-family':'inherit' });
    t.textContent = yFmt(v);
    gridG.appendChild(t);
  }
  for (const v of xs.ticks) {
    if (v <= 0) continue;
    const x = xp(v);
    gridG.appendChild(se('line', { x1:x.toFixed(1), x2:x.toFixed(1), y1:String(mg.t), y2:String(H-mg.b), stroke:'#e7e5e4', 'stroke-width':'1' }));
    const t = se('text', { x:x.toFixed(1), y:String(H-mg.b+15), 'text-anchor':'middle', fill:'#a8a29e', 'font-size':'10.5', 'font-family':'inherit' });
    t.textContent = fK(v);
    gridG.appendChild(t);
  }
  svgEl.appendChild(gridG);

  // Threshold line
  if (showThreshold) {
    const ty = yp(MIN_TPS);
    svgEl.appendChild(se('line', { x1:String(mg.l), x2:String(W-mg.r), y1:ty.toFixed(1), y2:ty.toFixed(1), stroke:'#fca5a5', 'stroke-width':'1.5', 'stroke-dasharray':'5 4' }));
  }

  // Axis baseline
  svgEl.appendChild(se('line', { x1:String(mg.l), x2:String(W-mg.r), y1:String(H-mg.b), y2:String(H-mg.b), stroke:'#e7e5e4', 'stroke-width':'1' }));

  // Series
  for (const s of series) {
    const color = s.color;
    const cg    = se('g', { 'clip-path':'url(#ch-clip)' });

    if (!s.benchmarks?.length) { svgEl.appendChild(cg); continue; }

    const sorted = [...s.benchmarks].sort((a: any,b: any) => a.contextUsed-b.contextUsed);
    const pts    = sorted.map((b: any) => ({ x:xp(b.contextUsed), y:yp(yGet(b)), b }));

    // Gradient area fill
    const gid = `g${Math.random().toString(36).slice(2)}`;
    const grad = se('linearGradient', { id:gid, x1:'0', y1:'0', x2:'0', y2:'1' });
    grad.appendChild(se('stop', { offset:'0%',   'stop-color':color, 'stop-opacity':'.14' }));
    grad.appendChild(se('stop', { offset:'100%', 'stop-color':color, 'stop-opacity':'.01' }));
    defs.appendChild(grad);

    const areaD = splinePath(pts)
      + ` L${pts[pts.length-1].x.toFixed(1)},${(H-mg.b)}`
      + ` L${pts[0].x.toFixed(1)},${(H-mg.b)} Z`;
    cg.appendChild(se('path', { d:areaD, fill:`url(#${gid})` }));

    // Line
    cg.appendChild(se('path', { d:splinePath(pts), fill:'none', stroke:color, 'stroke-width':'2.5', 'stroke-linejoin':'round', 'stroke-linecap':'round' }));

    // Dots
    for (const p of pts) {
      cg.appendChild(se('circle', { cx:p.x.toFixed(1), cy:p.y.toFixed(1), r:'5', fill:'#fff', stroke:color, 'stroke-width':'2.5' }));
    }

    svgEl.appendChild(cg);
  }

  // Hover overlay
  const crossV = se('line', { y1:String(mg.t), y2:String(H-mg.b), stroke:'#c8c5c1', 'stroke-width':'1', 'stroke-dasharray':'4 3', opacity:'0' });
  const hDots  = se('g');
  svgEl.appendChild(crossV);
  svgEl.appendChild(hDots);

  // Invisible hit rect
  const hit = se('rect', { x:String(mg.l), y:String(mg.t), width:String(iw), height:String(ih), fill:'transparent', cursor:'crosshair' });
  svgEl.appendChild(hit);

  const tip = $('tip');

  function onMove(e: MouseEvent) {
    const r   = svgEl.getBoundingClientRect();
    const mx  = e.clientX - r.left;
    if (mx < mg.l || mx > W - mg.r) { crossV.setAttribute('opacity','0'); hDots.innerHTML=''; (tip as HTMLElement).style.display='none'; return; }

    // Find nearest context point
    let best: { s: any; b: any } | null = null, bestDist = Infinity;
    for (const s of series) {
      for (const b of (s.benchmarks||[])) {
        const d = Math.abs(xp(b.contextUsed)-mx);
        if (d < bestDist) { bestDist=d; best={s,b}; }
      }
    }
    if (!best || bestDist > 60) { crossV.setAttribute('opacity','0'); hDots.innerHTML=''; (tip as HTMLElement).style.display='none'; return; }

    const bx = xp(best.b.contextUsed);
    crossV.setAttribute('x1', bx.toFixed(1));
    crossV.setAttribute('x2', bx.toFixed(1));
    crossV.setAttribute('opacity', '1');

    // Collect all series values at this ctx
    hDots.innerHTML = '';
    const lines: string[] = [];
    for (const s of series) {
      const match = (s.benchmarks||[]).find((b: any) => b.contextUsed===best!.b.contextUsed);
      if (!match) continue;
      const py = yp(yGet(match));
      hDots.appendChild(se('circle', { cx:bx.toFixed(1), cy:py.toFixed(1), r:'6', fill:'#fff', stroke:s.color, 'stroke-width':'2.5' }));
      lines.push(`<span style="color:${s.color}">●</span> ${shortModel(s.modelId)}: ${yFmt(yGet(match))}`);
    }
    (tip as HTMLElement).innerHTML = `<b>${fK(best.b.contextUsed)} tokens</b>` + lines.map(l=>`<br>${l}`).join('');
    (tip as HTMLElement).style.display = '';

    // Position tip
    const tw = (tip as HTMLElement).offsetWidth, th = (tip as HTMLElement).offsetHeight;
    let tx = e.clientX + 14, ty = e.clientY - th/2;
    if (tx + tw > window.innerWidth - 10) tx = e.clientX - tw - 14;
    if (ty < 8) ty = 8;
    if (ty + th > window.innerHeight - 8) ty = window.innerHeight - th - 8;
    (tip as HTMLElement).style.left = tx + 'px';
    (tip as HTMLElement).style.top  = ty + 'px';
  }

  hit.addEventListener('mousemove', onMove);
  hit.addEventListener('mouseleave', () => {
    crossV.setAttribute('opacity','0');
    hDots.innerHTML='';
    (tip as HTMLElement).style.display='none';
  });
}

// Legend
function renderLegend(legEl: HTMLElement, series: any[]) {
  legEl.innerHTML='';
  for (const s of series) {
    const li = de('div','li');
    const sw = de('div','li-swatch'); (sw as HTMLElement).style.background=s.color;
    const dt = de('div','li-dot');   (dt as HTMLElement).style.background=s.color;
    li.append(sw, dt, document.createTextNode(' '+shortModel(s.modelId)));
    legEl.appendChild(li);
  }
}

// Stats
function renderStats(series: any[]) {
  const sg = $('sgrid');
  if (!sg) return;
  sg.innerHTML='';
  for (const s of series) {
    const short  = shortModel(s.modelId);
    const sorted = [...(s.benchmarks||[])].sort((a: any,b: any)=>a.contextUsed-b.contextUsed);
    if (!sorted.length) continue;

    const bestTps     = sorted.reduce((m: any,b: any)=>b.tps>m.tps?b:m, sorted[0]);
    const fastestTtft = sorted.reduce((m: any,b: any)=>b.ttftMs<m.ttftMs?b:m, sorted[0]);

    function card(label: string, val: string, unit: string, sub: string) {
      const c = de('div','sc');
      c.innerHTML = `<div class="sc-model" style="color:${s.color}">${short}</div>`
        + `<div class="sc-label">${label}</div>`
        + `<div class="sc-val">${val}<span class="sc-unit"> ${unit}</span></div>`
        + `<div class="sc-sub">${sub}</div>`;
      return c;
    }

    if (s.maxContext) sg.appendChild(card('Max context', fK(s.maxContext), 'tokens', 'usable window'));
    sg.appendChild(card('Peak throughput', fTPS(bestTps.tps), 't/s', `at ${fK(bestTps.contextUsed)} tokens`));
    sg.appendChild(card('Min latency', fTTFT(fastestTtft.ttftMs), '', `at ${fK(fastestTtft.contextUsed)} tokens`));
  }
}

// Full render
function render() {
  const sa = activeSeries();

  const tpsSvg = $('tps-svg') as SVGSVGElement;
  const ttftSvg = $('ttft-svg') as SVGSVGElement;
  const tpsLeg = $('tps-leg');
  const ttftLeg = $('ttft-leg');

  if (tpsSvg) renderChart(tpsSvg,  { series:sa, yGet:(b: any)=>b.tps,    yFmt:fTPS,  showProbes:false, showThreshold:true  });
  if (ttftSvg) renderChart(ttftSvg, { series:sa, yGet:(b: any)=>b.ttftMs, yFmt:fTTFT, showProbes:false, showThreshold:false });
  if (tpsLeg) renderLegend(tpsLeg,  sa);
  if (ttftLeg) renderLegend(ttftLeg, sa);
  renderStats(sa);
}

// Boot
async function boot() {
  try {
    const res = await fetch('/api/results');
    DB = await res.json();
  } catch(e) { console.error('Failed to load results:', e); }

  const n = DB.models.length;
  const hdrMeta = $('hdr-meta');
  if (hdrMeta) {
    hdrMeta.textContent = n > 0
      ? `${n} result${n===1?'':'s'} · ${getDevices().size} device${getDevices().size===1?'':'s'}`
      : 'no data yet';
  }

  buildToolbar();
  render();
}

// Re-render on resize
const tpsSvg = $('tps-svg');
if (tpsSvg) {
  const ro = new ResizeObserver(() => render());
  ro.observe(tpsSvg);
}

// Close menus on outside click
document.addEventListener('click', (e) => {
  const deviceBox = $('device-select');
  const modelBox = $('model-select');
  const t = e.target;
  if (openMenu === 'device' && deviceBox && !deviceBox.contains(t as Node)) {
    openMenu = null;
    buildToolbar();
  } else if (openMenu === 'model' && modelBox && !modelBox.contains(t as Node)) {
    openMenu = null;
    buildToolbar();
  }
});

boot();