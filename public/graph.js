/* Radial project graph. Colour is one ramp: violet (oldest) through teal, rose
   and gold to white-gold (now). Radius is age: older work sits further out.
   A span runs from `started` to the start of the newest descendant. A project
   with no descendants is one short burst — the burst width is a drawing size,
   not a stored date. `ongoing: true` on the project runs that span to today
   and pours light into the core. Ended is the absence of that flag.
   ?still freezes motion for screenshots. prefers-reduced-motion does the same.
   No 14-day rule and no ?asof preview. */
(() => {
  "use strict";

  const DAY = 864e5;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const BURST_DAYS = 6;
  const STOPS = [[0, [92, 70, 214]], [0.3, [42, 178, 200]], [0.6, [226, 104, 156]], [0.84, [242, 176, 86]], [1, [255, 243, 214]]];
  const COOL = [120, 128, 150];
  /* Tuned wedges for the current roots so the field matches the approved layout.
     A root that is not listed takes the next free wedge. */
  const ANG = { jarvas: [0, 74], loom: [52, 0], oraxle: [104, 0], "grok-bot-galaxy-archive": [162, 84], "ai-cambrian": [298, 0] };
  const SHORT = {
    "grok-bot-galaxy-archive": "Galaxy archive",
    "jarvas-mnemoteca": "Mnemoteca",
    "jarvas-youtube-ingestion": "YouTube ingestion",
    "jarvas-inbox-ranking": "Inbox ranking",
    "galaxy-transcription-pipeline": "Transcription",
    "galaxy-scored-chapters": "Scored chapters",
    "galaxy-seekable-viewer": "Seekable viewer",
    "galaxy-format-map": "Format map",
  };

  const parseD = (s) => {
    const m = String(s || "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3] || 1);
  };
  const fmt = (t, y = true) => {
    const d = new Date(t);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${y ? " " + d.getUTCFullYear() : ""}`;
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || new URLSearchParams(location.search).has("still");
  const nowDate = new Date();
  const TODAY = Date.UTC(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const cv = $("graph");
  const ctx = cv.getContext("2d");
  const labelsEl = $("labels");
  const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
  const measure = (() => {
    const c = document.createElement("canvas").getContext("2d");
    return (t, f) => { c.font = f; return c.measureText(t).width; };
  })();

  let hooks = {};
  let byId = new Map();
  let nodes = [];
  let roots = [];
  let edges = [];
  let months = [];
  let D0 = TODAY;
  let span = 1;
  let G = null;
  let focus = null;
  let pinned = null;
  let filter = "all";
  let t0 = 0;
  let introDone = reduced;
  let ready = false;
  let raf = 0;
  let lastW = 0;
  let queuedPin = false;
  let queuedId = null;

  const tf = (t) => Math.max(0, Math.min(1, (t - D0) / span));
  const ramp = (f) => {
    for (let i = 1; i < STOPS.length; i++) {
      const [p1, c1] = STOPS[i];
      const [p0, c0] = STOPS[i - 1];
      if (f <= p1) {
        const k = (f - p0) / (p1 - p0);
        return c0.map((v, j) => v + (c1[j] - v) * k);
      }
    }
    return STOPS[STOPS.length - 1][1];
  };
  const colorOf = (t, cooled) => {
    const c = ramp(tf(t));
    return cooled ? c.map((v, j) => v * 0.84 + COOL[j] * 0.16) : c;
  };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const cmp = (a, b) => a.start - b.start || String(a.title).localeCompare(String(b.title));
  const rOf = (t) => {
    const R0 = 0.13;
    return R0 + (1 - R0) * Math.sqrt(Math.max(0, (TODAY - t) / span));
  };

  function buildModel(projects) {
    byId = new Map();
    (projects || []).forEach((p) => {
      const s = parseD(p.started);
      if (!Number.isFinite(s) || s > TODAY) return;
      byId.set(p.id, { ...p, title: p.title || p.id, start: s, kids: [], links: new Set() });
    });
    nodes = [...byId.values()];
    nodes.forEach((n) => {
      n.parentNode = (n.parent && byId.get(n.parent)) || null;
      if (n.parentNode) n.parentNode.kids.push(n);
    });
    nodes.forEach((n) => (n.connections || []).forEach((id) => {
      const m = byId.get(id);
      if (m && m !== n) { n.links.add(m); m.links.add(n); }
    }));
    const desc = (n) => n.kids.flatMap((k) => [k, ...desc(k)]);
    nodes.forEach((n) => {
      n.desc = desc(n);
      n.last = Math.max(n.start, ...n.desc.map((d) => d.start));
      n.ongoing = n.ongoing === true;
      n.burst = n.desc.length === 0;
      n.end = n.ongoing ? TODAY : n.last;
      n.root = n;
      while (n.root.parentNode) n.root = n.root.parentNode;
    });
    roots = nodes.filter((n) => !n.parentNode).sort(cmp);
    const first = nodes.length ? Math.min(...nodes.map((n) => n.start)) : TODAY;
    const firstDate = new Date(first);
    D0 = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1);
    span = Math.max(DAY, TODAY - D0);
    months = [];
    for (let d = new Date(D0); d.getTime() <= TODAY; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());

    let free = 0;
    roots.forEach((r) => {
      if (!ANG[r.id]) ANG[r.id] = [300 + 24 * free++, r.desc.length ? 36 : 0];
    });
    roots.forEach((r) => {
      const [c, spread] = ANG[r.id];
      r.ang = c;
      const ks = r.desc.slice().sort(cmp);
      const h = Math.ceil(ks.length / 2) || 1;
      ks.forEach((k, i) => { k.ang = c + (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) / h * spread / 2; });
    });
    nodes.forEach((n) => { n.r = rOf(n.start); n.rgb = colorOf(n.start, !n.ongoing); n.hot = ramp(tf(n.start)); });

    edges = [];
    nodes.forEach((n) => { if (n.parentNode) edges.push({ a: n.parentNode, b: n, tree: true }); });
    const seen = new Set();
    nodes.forEach((n) => n.links.forEach((m) => {
      const k = [n.id, m.id].sort().join("|");
      if (seen.has(k)) return;
      seen.add(k);
      const older = n.start <= m.start ? n : m;
      const newer = older === n ? m : n;
      edges.push({ a: older, b: newer, tree: false });
    }));
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    edges.forEach((e) => { e.phase = rnd(); e.speed = 0.11 + rnd() * 0.05; });
  }

  function layout() {
    const phone = isPhone();
    const W = stage.clientWidth;
    const H = phone ? Math.round(W * 1.12) : Math.max(640, Math.min(920, window.innerHeight - 40));
    const mh = document.querySelector(".masthead");
    const sb = stage.getBoundingClientRect();
    const mb = mh.getBoundingClientRect();
    const avoid = phone ? null : { x0: mb.left - sb.left - 8, y0: mb.top - sb.top - 8, x1: mb.right - sb.left + 8, y1: mb.bottom - sb.top + 8 };
    const hitAvoid = (x0, y0, x1, y1) => avoid && x1 > avoid.x0 && x0 < avoid.x1 && y1 > avoid.y0 && y0 < avoid.y1;
    const rot = phone ? -90 : 0;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pol = (r, a, R, cx, cy) => {
      const t = (a + rot) * Math.PI / 180;
      return [cx + Math.cos(t) * r * R, cy + Math.sin(t) * r * R];
    };
    const labOf = (n) => {
      const show = !phone || !n.parentNode;
      const text = phone ? (SHORT[n.id] || n.title) : n.title;
      const f = n.parentNode ? "400 12px Inter" : "500 13.5px Inter";
      return { show, text, w: measure(text, f) + 2, h: n.parentNode ? 15 : 17 };
    };
    const place = (n, R, cx, cy) => {
      const [x, y] = pol(n.r, n.ang, R, cx, cy);
      const L = labOf(n);
      const t = (n.ang + rot) * Math.PI / 180;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const g = n.parentNode ? 11 : 14;
      let lx;
      let ly;
      if (c > 0.34) { lx = x + g; ly = y - L.h / 2; }
      else if (c < -0.34) { lx = x - g - L.w; ly = y - L.h / 2; }
      else { lx = x - L.w / 2; ly = s < 0 ? y - g - L.h : y + g - 2; }
      return { x, y, lx, ly, L };
    };
    const cx = W / 2 + (phone ? 0 : -W * 0.02);
    const cy = H / 2;
    let R = Math.min(W, H) / 2;
    for (let it = 0; it < 40; it++) {
      const ok = nodes.every((n) => {
        const p = place(n, R, cx, cy);
        return !p.L.show || (
          p.lx >= 4 && p.lx + p.L.w <= W - 4 && p.ly >= 22 && p.ly + p.L.h <= H - 4
          && !hitAvoid(p.lx, p.ly, p.lx + p.L.w, p.ly + p.L.h)
          && !hitAvoid(p.x - 16, p.y - 16, p.x + 16, p.y + 16)
        );
      }) && R <= H / 2 - 12 && R <= W / 2 - 8;
      if (ok) break;
      R *= 0.97;
    }
    nodes.forEach((n) => { n.p = place(n, R, cx, cy); });
    const shown = nodes.filter((n) => n.p.L.show);
    for (let pass = 0; pass < 6; pass++) {
      shown.forEach((a, i) => shown.slice(i + 1).forEach((b) => {
        const A = a.p;
        const B = b.p;
        if (A.lx < B.lx + B.L.w + 6 && B.lx < A.lx + A.L.w + 6 && A.ly < B.ly + B.L.h + 2 && B.ly < A.ly + A.L.h + 2) {
          const d = (Math.min(A.ly + A.L.h, B.ly + B.L.h) - Math.max(A.ly, B.ly) + 3) / 2;
          if (A.ly <= B.ly) { A.ly -= d; B.ly += d; }
          else { A.ly += d; B.ly -= d; }
        }
      }));
    }
    edges.forEach((e) => {
      let da = e.b.ang - e.a.ang;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      const am = e.a.ang + da / 2;
      const rm = (e.a.r + e.b.r) / 2 * (e.tree ? 1.0 : 0.62);
      e.c = pol(rm, am, R, cx, cy);
      e.p0 = [e.a.p.x, e.a.p.y];
      e.p1 = [e.b.p.x, e.b.p.y];
    });
    labelsEl.replaceChildren();
    nodes.forEach((n) => {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "lab" + (n.parentNode ? " branch" : "") + (n.ongoing ? " live" : " ended");
      d.textContent = n.p.L.text;
      d.dataset.id = n.id;
      d.style.left = n.p.lx + "px";
      d.style.top = n.p.ly + "px";
      d.setAttribute("aria-pressed", n === focus ? "true" : "false");
      if (!n.p.L.show) d.hidden = true;
      bind(d, n);
      labelsEl.appendChild(d);
      n.lab = d;
    });
    const now = document.createElement("div");
    now.className = "lab now";
    const nowWord = document.createElement("span");
    nowWord.textContent = fmt(TODAY, false).toUpperCase();
    now.append("NOW", nowWord);
    now.style.left = cx + "px";
    now.style.top = cy + 16 + "px";
    labelsEl.appendChild(now);
    const ma = phone ? 252 : 268;
    let lastR = -99;
    months.forEach((m, i) => {
      if (phone) return;
      if (Math.abs(lastR - rOf(m) * R) < 15) return;
      lastR = rOf(m) * R;
      const [x, y] = pol(rOf(m), ma, R, cx, cy);
      const d = document.createElement("div");
      d.className = "lab month";
      d.textContent = MONTHS[new Date(m).getUTCMonth()] + (i === 0 ? " " + new Date(m).getUTCFullYear() : "");
      d.style.left = x + 5 + "px";
      d.style.top = y - 7 + "px";
      labelsEl.appendChild(d);
    });
    G = { W, H, R, cx, cy, rot, pol, phone };
  }

  const bez = (e, t) => {
    const u = 1 - t;
    return [
      u * u * e.p0[0] + 2 * u * t * e.c[0] + t * t * e.p1[0],
      u * u * e.p0[1] + 2 * u * t * e.c[1] + t * t * e.p1[1],
    ];
  };
  const vis = (n) => filter === "all" || (filter === "ongoing" ? n.ongoing : !n.ongoing);
  const rel = (n) => {
    if (!focus) return 1;
    if (n === focus) return 1;
    if (focus.links.has(n) || n.parentNode === focus || focus.parentNode === n) return 0.95;
    if (n.root === focus.root) return 0.55;
    return 0.14;
  };
  const nodeA = (n) => (vis(n) ? 1 : 0.12) * rel(n);
  const reveal = (r, p) => Math.max(0, Math.min(1, (p - (1 - r) * 0.55) / 0.35));
  const famAng = (r) => {
    const as = [r, ...r.desc].map((n) => n.ang);
    return [Math.min(...as), Math.max(...as)];
  };
  const dur = (n) => {
    const days = Math.round((n.end - n.start) / DAY) + 1;
    if (n.burst && !n.ongoing) return "single burst";
    if (days < 14) return `${days} days`;
    if (days < 92) return `${Math.round(days / 7)} weeks`;
    return `${Math.round(days / 30.4)} months`;
  };
  const bandTag = (r) => (
    r.desc.length
      ? (r.ongoing ? "ONGOING" : dur(r).toUpperCase().replace(" WEEKS", " WK").replace(" MONTHS", " MO"))
      : ""
  );

  function drawRingBand(r, p, a) {
    const { R, cx, cy, rot } = G;
    if (r.burst && !r.ongoing) {
      const { x, y } = r.p;
      const rr = 11;
      const k = 0.8;
      const g = ctx.createLinearGradient(x - rr, y - rr, x + rr, y + rr);
      g.addColorStop(0, rgba(colorOf(r.start, true), 0.75 * a * k));
      g.addColorStop(1, rgba(colorOf(r.start + BURST_DAYS * DAY, true), 0.75 * a * k));
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, 7);
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      return;
    }
    let [a0, a1] = famAng(r);
    const padA = r.desc.length ? 7 : 9;
    a0 -= padA;
    a1 += padA;
    const R0 = 0.13;
    const rin = r.ongoing ? R0 * 0.82 : Math.max(0, rOf(r.burst ? r.start + BURST_DAYS * DAY : r.end) - 0.03);
    const rout = rOf(r.start) + 0.03;
    const A0 = (a0 + rot) * Math.PI / 180;
    const A1 = (a1 + rot) * Math.PI / 180;
    const g = ctx.createRadialGradient(cx, cy, rin * R, cx, cy, rout * R);
    const cS = colorOf(r.start, !r.ongoing);
    const cE = colorOf(r.end, !r.ongoing);
    const k = r.ongoing ? 1 : 0.7;
    if (r.ongoing) {
      g.addColorStop(0, `rgba(255,236,200,${0.16 * a})`);
      g.addColorStop(0.5, rgba(cE, 0.08 * a));
      g.addColorStop(1, rgba(cS, 0.06 * a));
    } else {
      g.addColorStop(0, rgba(cE, 0.10 * a * k));
      g.addColorStop(1, rgba(cS, 0.07 * a * k));
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rout * R, A0, A1);
    ctx.arc(cx, cy, rin * R, A1, A0, true);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    const gs = ctx.createRadialGradient(cx, cy, rin * R, cx, cy, rout * R);
    gs.addColorStop(0, rgba(cE, 0.55 * a * k));
    gs.addColorStop(1, rgba(cS, 0.45 * a * k));
    ctx.strokeStyle = gs;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (!r.ongoing) {
      ctx.beginPath();
      ctx.arc(cx, cy, rin * R, A0, A1);
      ctx.strokeStyle = rgba(cE, 0.9 * a * k);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    const tag = bandTag(r);
    if (tag && a > 0.2) {
      const ta = A1 + 0.07;
      const tr = (rin + rout) / 2 * R;
      ctx.save();
      ctx.translate(cx + Math.cos(ta) * tr, cy + Math.sin(ta) * tr);
      let rotA = ta + Math.PI / 2;
      if (Math.cos(rotA) < 0) rotA += Math.PI;
      ctx.rotate(rotA);
      ctx.font = "400 10px 'Plex Mono'";
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(colorOf(r.end, false).map((v) => Math.min(255, v + 50)), Math.min(1, 0.9 * a));
      ctx.fillText(tag.split("").join(String.fromCharCode(8202)), 0, 3);
      ctx.restore();
    }
  }

  function strandPath(e, off, upto) {
    const N = 40;
    ctx.beginPath();
    for (let i = 0; i <= N * upto; i++) {
      const t = i / N;
      const [x, y] = bez(e, t);
      const dx = e.p1[0] - e.p0[0];
      const dy = e.p1[1] - e.p0[1];
      const l = Math.hypot(dx, dy) || 1;
      const w = Math.sin(Math.PI * t) * off;
      const px = x - dy / l * w;
      const py = y + dx / l * w;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
  }

  function drawEdge(e, p, time) {
    const a = Math.min(nodeA(e.a), nodeA(e.b)) * (e.tree ? 1 : 0.8);
    const hot = focus && (e.a === focus || e.b === focus);
    const upto = reveal(e.b.r, p);
    if (upto <= 0) return;
    const live = e.b.ongoing && e.a.ongoing;
    const g = ctx.createLinearGradient(e.p0[0], e.p0[1], e.p1[0], e.p1[1]);
    const ca = hot ? e.a.hot : e.a.rgb;
    const cb = hot ? e.b.hot : e.b.rgb;
    const base = (hot ? 0.9 : live ? 0.62 : 0.42) * a;
    g.addColorStop(0, rgba(ca, base));
    g.addColorStop(1, rgba(cb, base));
    ctx.strokeStyle = g;
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    const offs = e.tree ? [-2.6, 0, 2.6] : [-1.6, 1.6];
    offs.forEach((o) => {
      strandPath(e, o, upto);
      ctx.lineWidth = o === 0 ? (hot ? 1.3 : 1) : 0.6;
      ctx.globalAlpha = o === 0 ? 1 : 0.7;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (!reduced && upto >= 1 && a > 0.3) {
      const s = ((time / 1000) * e.speed + e.phase) % 1;
      const L = 0.12;
      const amp = (hot ? 0.9 : live ? 0.7 : 0.32) * a;
      for (let i = 0; i < 8; i++) {
        const t1 = s - L + (i / 8) * L;
        const t2 = t1 + L / 8;
        if (t1 < 0 || t2 > 1) continue;
        const [x1, y1] = bez(e, t1);
        const [x2, y2] = bez(e, t2);
        const k = Math.sin(Math.PI * i / 8);
        const c = ramp(tf(e.a.start + (e.b.start - e.a.start) * t1)).map((v) => Math.min(255, v + 40));
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = rgba(c, amp * k);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  function drawNode(n, p, time) {
    const a = nodeA(n) * reveal(n.r, p);
    if (a <= 0) return;
    const { x, y } = n.p;
    const root = !n.parentNode;
    const sel = n === focus;
    const pulse = n.ongoing && !reduced ? 0.5 + 0.5 * Math.sin(time / 900 + n.r * 9) : 0.5;
    const halo = (root ? 15 : 10) * (sel ? 1.35 : 1) * (n.ongoing ? 1 + 0.18 * pulse : 0.85);
    const c = sel ? n.hot : n.rgb;
    const g = ctx.createRadialGradient(x, y, 0, x, y, halo);
    const ha = (n.ongoing ? 0.55 : 0.3) * a * (sel ? 1.5 : 1);
    g.addColorStop(0, rgba(c, ha));
    g.addColorStop(0.35, rgba(c, ha * 0.35));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, halo, 0, 7);
    ctx.fill();
    const cr = root ? 3.2 : 2.1;
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, 7);
    ctx.fillStyle = rgba(c.map((v) => Math.min(255, v * 0.8 + 60)), (n.ongoing ? 1 : 0.9) * a);
    ctx.fill();
    if (root) {
      ctx.beginPath();
      ctx.arc(x, y, cr + 3.2, 0, 7);
      ctx.strokeStyle = rgba(c, 0.55 * a);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  function drawPour(n, p, time) {
    const a = nodeA(n) * Math.max(0, (p - 0.6) / 0.4);
    if (a <= 0) return;
    const { cx, cy } = G;
    const e = { p0: [n.p.x, n.p.y], p1: [cx, cy] };
    const mx = (n.p.x + cx) / 2;
    const my = (n.p.y + cy) / 2;
    const dx = cx - n.p.x;
    const dy = cy - n.p.y;
    e.c = [mx - dy * 0.18, my + dx * 0.18];
    const g = ctx.createLinearGradient(n.p.x, n.p.y, cx, cy);
    g.addColorStop(0, rgba(n.hot, 0.7 * a));
    g.addColorStop(1, `rgba(255,243,214,${0.5 * a})`);
    ctx.strokeStyle = g;
    ctx.setLineDash([]);
    [-1.8, 0, 1.8].forEach((o) => { strandPath(e, o, 1); ctx.lineWidth = o ? 0.6 : 1.1; ctx.stroke(); });
    if (!reduced) {
      for (let q = 0; q < 2; q++) {
        const s = ((time / 1000) * 0.22 + q * 0.5) % 1;
        for (let i = 0; i < 8; i++) {
          const t1 = s - 0.14 + i * 0.0175;
          const t2 = t1 + 0.0175;
          if (t1 < 0 || t2 > 1) continue;
          const [x1, y1] = bez(e, t1);
          const [x2, y2] = bez(e, t2);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `rgba(255,240,210,${0.85 * a * Math.sin(Math.PI * i / 8)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  function drawCore(p, time) {
    const { R, cx, cy } = G;
    const k = Math.max(0, (p - 0.75) / 0.25);
    if (k <= 0) return;
    const br = reduced ? 1 : 1 + 0.06 * Math.sin(time / 1400);
    const rr = R * 0.2 * br;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, `rgba(255,246,226,${0.5 * k})`);
    g.addColorStop(0.12, `rgba(255,214,150,${0.22 * k})`);
    g.addColorStop(0.45, `rgba(236,140,150,${0.06 * k})`);
    g.addColorStop(1, "rgba(120,90,220,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, 7);
    ctx.fill();
    const sh = ctx.createLinearGradient(cx - rr * 1.6, cy, cx + rr * 1.6, cy);
    sh.addColorStop(0, "rgba(255,220,170,0)");
    sh.addColorStop(0.5, `rgba(255,236,205,${0.28 * k})`);
    sh.addColorStop(1, "rgba(255,220,170,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(cx - rr * 1.6, cy - 0.6, rr * 3.2, 1.2);
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, 7);
    ctx.fillStyle = `rgba(255,250,240,${k})`;
    ctx.fill();
  }

  function drawRings() {
    const { R, cx, cy } = G;
    months.forEach((m, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, rOf(m) * R, 0, 7);
      ctx.strokeStyle = rgba(colorOf(m, true), i === 0 ? 0.13 : 0.075);
      ctx.lineWidth = 0.7;
      ctx.stroke();
    });
  }

  function frame(time) {
    if (!G) return;
    const p = reduced ? 1 : Math.min(1, (time - t0) / 1900);
    const e = 1 - Math.pow(1 - p, 3);
    ctx.clearRect(0, 0, G.W, G.H);
    ctx.globalCompositeOperation = "source-over";
    drawRings();
    ctx.globalCompositeOperation = "lighter";
    roots.forEach((r) => drawRingBand(r, e, Math.min(1, e * 1.5) * (vis(r) ? 1 : 0.15) * (focus ? (focus.root === r ? 1.4 : 0.35) : 1)));
    edges.forEach((ed) => drawEdge(ed, e, time));
    nodes.forEach((n) => { if (n.ongoing && !n.kids.some((k) => k.ongoing)) drawPour(n, e, time); });
    drawCore(e, time);
    nodes.forEach((n) => drawNode(n, e, time));
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    nodes.forEach((n) => {
      if (!n.lab) return;
      n.lab.style.opacity = (nodeA(n) * reveal(n.r, e)).toFixed(3);
      n.lab.classList.toggle("sel", n === focus);
      n.lab.setAttribute("aria-pressed", n === focus ? "true" : "false");
    });
    if (p >= 1) {
      introDone = true;
      window.__loomReady = true;
    }
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  const redraw = () => { if (reduced && G) frame(performance.now()); };

  function setFocus(n) {
    focus = n;
    showCard(n);
    redraw();
  }

  function notify(id) {
    if (hooks.onPin) hooks.onPin(id);
  }

  function clearPin() {
    pinned = null;
    setFocus(null);
    notify(null);
  }

  function bind(el, n) {
    el.addEventListener("mouseenter", () => { if (!pinned && !isPhone()) setFocus(n); });
    el.addEventListener("mouseleave", () => { if (!pinned && !isPhone()) setFocus(null); });
    el.addEventListener("focus", () => { if (!pinned) setFocus(n); });
    el.addEventListener("blur", (ev) => {
      if (pinned) return;
      const next = ev.relatedTarget;
      if (next && next.closest && next.closest("#detail")) return;
      setFocus(null);
    });
    el.addEventListener("click", (ev) => { ev.stopPropagation(); select(n); });
  }

  const nearest = (ev) => {
    const b = cv.getBoundingClientRect();
    const x = ev.clientX - b.left;
    const y = ev.clientY - b.top;
    let best = null;
    let bd = 22;
    nodes.forEach((n) => {
      if (!n.p) return;
      const d = Math.hypot(n.p.x - x, n.p.y - y);
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  };

  function select(n) {
    pinned = pinned === n && !isPhone() ? null : n;
    if (pinned && isPhone()) document.body.classList.add("sheet-open");
    setFocus(pinned);
    notify(pinned ? pinned.id : null);
  }

  function pin(id) {
    if (!ready) { queuedPin = true; queuedId = id || null; return; }
    const n = id ? byId.get(id) || null : null;
    pinned = n;
    if (n && isPhone()) document.body.classList.add("sheet-open");
    setFocus(n);
  }

  function appendSummary(el, summary) {
    const text = String(summary || "");
    const re = /https?:\/\/[^\s<]+/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement("a");
      a.href = m[0];
      a.textContent = m[0];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      el.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  function showCard(s) {
    const card = $("detail");
    const idle = $("idle");
    if (!s) {
      card.hidden = true;
      idle.hidden = false;
      document.body.classList.remove("sheet-open");
      return;
    }
    idle.hidden = !isPhone();
    card.hidden = false;
    card.classList.toggle("pinned", pinned === s);
    if (!reduced) {
      card.style.animation = "none";
      void card.offsetWidth;
      card.style.animation = "";
    }
    const st = $("c-status");
    st.textContent = s.ongoing ? "Ongoing" : "Ended";
    st.className = "status " + (s.ongoing ? "live" : "ended");
    st.style.setProperty("--c", rgba(s.hot, 1));
    $("c-kind").textContent = s.parentNode ? `Branch of ${s.parentNode.title}` : "Thread";
    $("c-title").textContent = s.title;
    const add = s.desc.length ? ` · ${s.desc.length} addition${s.desc.length > 1 ? "s" : ""}` : "";
    const sameYear = new Date(s.start).getUTCFullYear() === new Date(s.end).getUTCFullYear();
    const range = s.burst && !s.ongoing
      ? fmt(s.start)
      : `${fmt(s.start, !sameYear)} – ${s.ongoing ? "now" : fmt(s.end)}`;
    $("c-date").textContent = `${range} · ${dur(s)}${add}`;
    const f0 = tf(s.start);
    const f1 = s.burst && !s.ongoing ? Math.min(1, f0 + 0.012) : tf(s.end);
    const sp = $("c-span");
    sp.style.left = f0 * 100 + "%";
    sp.style.width = Math.max(1.2, (f1 - f0) * 100) + "%";
    sp.style.backgroundImage = `linear-gradient(90deg, ${rgba(ramp(f0), 1)}, ${rgba(ramp(f1), 1)})`;
    sp.classList.toggle("live", s.ongoing);
    $("c-l0").textContent = fmt(D0, false).replace(/^1 /, "").toUpperCase();
    $("c-l1").textContent = "NOW";
    const body = $("c-body");
    body.replaceChildren();
    appendSummary(body, s.summary || "");
    body.scrollTop = 0;
    const facts = $("c-facts");
    facts.replaceChildren();
    const row = (label, build) => {
      const d = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      d.append(dt, dd);
      build(dd);
      facts.appendChild(d);
    };
    const links = (dd, list) => list.forEach((m, i) => {
      if (i) dd.append(", ");
      const a = document.createElement("button");
      a.type = "button";
      a.textContent = m.title;
      a.style.setProperty("--c", rgba(m.hot, 1));
      a.addEventListener("click", (ev) => { ev.stopPropagation(); select(m); });
      dd.appendChild(a);
    });
    if (s.links.size) row("Woven with", (dd) => links(dd, [...s.links].sort(cmp)));
    if (s.kids.length) row("Branches", (dd) => links(dd, s.kids.slice().sort(cmp)));
    row("Tags", (dd) => { dd.className = "tags"; dd.textContent = (s.tags || []).join("  ·  "); });
  }

  function buildSide() {
    const bar = document.querySelector(".ramp-bar");
    bar.style.backgroundImage = `linear-gradient(90deg, ${STOPS.map(([p, c]) => `${rgba(c, 1)} ${p * 100}%`).join(", ")})`;
    const ticks = $("ramp-ticks");
    ticks.replaceChildren();
    months.forEach((m) => {
      if (tf(m) > 0.93) return;
      const s = document.createElement("span");
      s.style.left = tf(m) * 100 + "%";
      s.textContent = MONTHS[new Date(m).getUTCMonth()];
      ticks.appendChild(s);
    });
    const s = document.createElement("span");
    s.className = "now";
    s.style.left = "100%";
    s.textContent = "NOW";
    ticks.appendChild(s);
    const on = nodes.filter((n) => n.ongoing).length;
    $("meta").textContent = `${nodes.length} threads · ${roots.length} bodies of work · ${on} ongoing`;
    $("note").textContent = "A thread runs from its start to the start of its newest addition. A thread with no additions is a single burst. Ongoing threads run to today and glow into the core.";
  }

  function space() {
    const c = $("space");
    if (!c) return;
    const x = c.getContext("2d");
    const W = window.innerWidth;
    const H = Math.max(window.innerHeight, document.documentElement.scrollHeight);
    const d = window.devicePixelRatio || 1;
    c.width = W * d;
    c.height = H * d;
    c.style.height = H + "px";
    x.setTransform(d, 0, 0, d, 0, 0);
    x.fillStyle = "#04050a";
    x.fillRect(0, 0, W, H);
    [[0.32, 0.55, 0.55, [70, 50, 160], 0.13], [0.62, 0.42, 0.4, [190, 80, 120], 0.06], [0.15, 0.2, 0.35, [30, 120, 140], 0.06], [0.85, 0.85, 0.45, [200, 150, 80], 0.04]].forEach(([fx, fy, fr, col, a]) => {
      const r = fr * Math.max(W, 900);
      const g = x.createRadialGradient(fx * W, fy * Math.min(H, 1100), 0, fx * W, fy * Math.min(H, 1100), r);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    });
    let s2 = 11;
    const r2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
    const count = Math.round(W * H / 15000);
    for (let i = 0; i < count; i++) {
      const sx = r2() * W;
      const sy = r2() * H;
      const rr = 0.25 + r2() * r2() * 0.8;
      const a = 0.18 + r2() * 0.5;
      x.beginPath();
      x.arc(sx, sy, rr, 0, 7);
      x.fillStyle = `rgba(235,232,255,${a})`;
      x.fill();
    }
  }

  function build() {
    layout();
    space();
    redraw();
  }

  async function start() {
    try {
      await Promise.all([
        document.fonts.load("500 13.5px Inter"),
        document.fonts.load("400 12px Inter"),
        document.fonts.load("400 10px 'Plex Mono'"),
        document.fonts.load("400 52px 'Instrument Serif'"),
      ]);
    } catch (err) { /* draw with the fallback metrics */ }
    ready = true;
    lastW = window.innerWidth;
    layout();
    space();
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
    if (queuedPin) pin(queuedId);
  }

  cv.addEventListener("mousemove", (ev) => {
    if (pinned || isPhone() || !ready) return;
    const n = nearest(ev);
    if (n !== focus) setFocus(n);
    cv.style.cursor = n ? "pointer" : "default";
  });
  cv.addEventListener("mouseleave", () => { if (!pinned && !isPhone()) setFocus(null); });
  cv.addEventListener("click", (ev) => {
    const n = nearest(ev);
    if (n) { ev.stopPropagation(); select(n); }
  });
  document.addEventListener("click", (ev) => {
    if (!pinned) return;
    if (ev.target.closest(".detail, .card, .filter, .lab, .tabs, #record")) return;
    clearPin();
  });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && (pinned || focus)) clearPin(); });
  $("close").addEventListener("click", (ev) => { ev.stopPropagation(); clearPin(); });
  $("detail").addEventListener("focusout", (ev) => {
    if (pinned) return;
    const next = ev.relatedTarget;
    if (next && next.closest && (next.closest("#detail") || next.closest(".lab"))) return;
    setFocus(null);
  });
  $("filter").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    ev.stopPropagation();
    filter = b.dataset.f;
    [...$("filter").children].forEach((x) => {
      const on = x === b;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    redraw();
  });
  window.addEventListener("resize", () => {
    if (!ready || window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    build();
  });

  window.RadialGraph = {
    mount(projects, options) {
      hooks = options || {};
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ready = false;
      introDone = reduced;
      window.__loomReady = false;
      focus = null;
      pinned = null;
      document.body.classList.remove("sheet-open");
      buildModel(projects);
      buildSide();
      const idle = $("idle");
      const detail = $("detail");
      if (idle) idle.hidden = false;
      if (detail) detail.hidden = true;
      document.fonts.ready.then(start);
    },
    pin,
    relayout() { if (ready) build(); },
  };
})();
