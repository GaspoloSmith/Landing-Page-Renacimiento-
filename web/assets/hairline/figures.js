(()=>{"use strict";

/**
 * Caos: from chaos to plan. Nine tool tiles (mail, chat, a form, a client card,
 * a sheet, a calendar, an invoice, a folder, a database) lie strewn round a
 * round hub, turned and overlapping, tied by tangled threads, drifting. Resting
 * the pointer (or a tap) orders them: the threads draw back, the tiles settle
 * on a ring round the hub, spokes join each to it, and pulses run: one input reaches
 * the hub and it deals out to one or two outputs, different each cycle.
 * Leaving lets it all fall back. The slider is the pulse's leg, in ms.
 */
const {
  Cam, circ, clamp, fit, facing, lerp, open, poly, prism, proj, rrect, seg, reducedMotion,
  mk, place, pointer, put, register, disposer, solid,
} = HL;

const R = 58, HUB = 9, TILE = rrect(-10, -10, 10, 10, 3, 3), TILE_IN = rrect(-9, -9, 9, 9, 2.2, 3);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const phase = (p, a, b) => ease(clamp((p - a) / (b - a), 0, 1));
const at = (deg) => [R * Math.cos((deg * Math.PI) / 180), R * Math.sin((deg * Math.PI) / 180)];
const turn = (ring, a, cx, cy) => {
  const c = Math.cos(a), n = Math.sin(a);
  return ring.map((q) => ({ u: cx + q.u * c - q.v * n, v: cy + q.u * n + q.v * c, nu: q.nu * c - q.nv * n, nv: q.nu * n + q.nv * c }));
};
const rect = (w, u0, v0, u1, v1) => poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => w(u, v)));
/** What each tile carries on its face: the few lines that make it that tool. */
const INK = {
  mail: (w) => rect(w, -7, -5, 7, 5) + open([[-7, -5], [0, 1], [7, -5]].map(([u, v]) => w(u, v))),
  chat: (w) => poly([[-7, -5], [7, -5], [7, 3], [0, 3], [-4, 6.5], [-3, 3], [-7, 3]].map(([u, v]) => w(u, v))) + seg(w(-4, -1), w(4, -1)),
  doc: (w) => poly([[-5, -7], [2, -7], [5, -4], [5, 7], [-5, 7]].map(([u, v]) => w(u, v))) + [-1, 2, 5].map((v) => seg(w(-3, v), w(3, v))).join(""),
  crm: (w) => poly(circ(2.4, 12).map((q) => w(-3 + q.u, -2 + q.v))) + open([[-7, 5], [-5, 2.5], [-1, 2.5], [1, 5]].map(([u, v]) => w(u, v))) + seg(w(2, -3), w(7, -3)) + seg(w(2, 0), w(7, 0)),
  sheet: (w) => rect(w, -7, -6, 7, 6) + seg(w(-7, -2), w(7, -2)) + seg(w(-7, 2), w(7, 2)) + seg(w(-2, -6), w(-2, 6)) + seg(w(2.5, -6), w(2.5, 6)),
  cal: (w) => rect(w, -6.5, -5.5, 6.5, 6.5) + seg(w(-6.5, -2), w(6.5, -2)) + seg(w(-3, -7.5), w(-3, -4)) + seg(w(3, -7.5), w(3, -4)),
  invoice: (w) => [-5, -2, 1].map((v) => seg(w(-6, v), w(6, v))).join("") + seg(w(0, 4.5), w(6, 4.5)) + seg(w(0, 6), w(6, 6)),
  folder: (w) => poly([[-7, -5], [-2, -5], [0, -3], [7, -3], [7, 6], [-7, 6]].map(([u, v]) => w(u, v))) + seg(w(-7, -1), w(7, -1)),
  db: (w) => [6.5, 3.5].map((r) => poly(circ(r, 20).map((q) => w(q.u, q.v)))).join(""),
};
// the plan: three inputs on one arc, six outputs round the rest, 40° apart. The chaos is composed,
// not thrown: a loose vortex round the hub, two tiles fallen on others, every one turned its own way.
const TILES = [
  ["mail", "in", 95, [-48, -26, 0, -22]], ["chat", "in", 135, [-12, -46, 2.6, 14]], ["doc", "in", 175, [32, -42, 0, -8]],
  ["crm", "out", 215, [56, 6, 0, 26]], ["sheet", "out", 255, [-24, -38, 0, -35]], ["cal", "out", 295, [8, 32, 0, -18]],
  ["invoice", "out", 335, [-46, 20, 0, 31]], ["folder", "out", 15, [38, 42, 2.6, -28]], ["db", "out", 55, [30, 34, 0, 9]],
].map(([k, side, deg, [x, y, z, r]], i) => ({ k, side, deg, plan: at(deg), chaos: [x, y, z, (r * Math.PI) / 180], i }));
const THREADS = [[0, 4], [1, 6], [2, 8], [3, 7], [5, 0], [4, 2], [6, 3], [7, 1], [8, 5], [0, 3]];

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let leg = val;
  const C = Cam(45, 0.5, 2.25);
  fit(C, [[-R, -R, 0], [R, R, 0], [R, -R, 0], [-R, R, 0], [-60, -48, 6], [60, 50, 6]], 200, 166);
  const P = proj(C), front = facing(C), still = reducedMotion();

  const g = mk("g", {}, svg);
  const threads = THREADS.map(([a, b], i) => ({ a, b, i, el: mk("path", { class: "nf" }, g) }));
  const spokes = TILES.map(() => mk("path", { class: "nf" }, g));
  const things = mk("g", {}, g);
  const hub = solid(things), hubTop = mk("path", { class: "nf" }, hub.g);
  put(hub, prism(P, front, circ(HUB, 28), circ(HUB - 1.2, 28), 0, 7));
  hubTop.setAttribute("d", poly(circ(5, 20).map((q) => P(q.u, q.v, 7))));
  TILES.forEach((t) => { t.el = solid(things); t.ink = mk("path", { class: "nf" }, t.el.g); });
  const dots = mk("g", {}, g);

  /** A polyline cut at share f of its length. */
  const part = (pts, f) => {
    const out = [pts[0]], L = pts.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0) * f;
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if (acc + d >= L) { const s = (L - acc) / d; out.push([lerp(pts[k - 1][0], pts[k][0], s), lerp(pts[k - 1][1], pts[k][1], s)]); break; }
      acc += d; out.push(pts[k]);
    }
    return out;
  };
  /** Where a pulse is on tile i's spoke, s from the hub's edge (0) to the tile's (1). */
  const onSpoke = (i, s) => { const [x, y] = TILES[i].plan, r = lerp(HUB, R - 11, s) / R; return P(x * r, y * r, 0.3); };

  let q = 0, target = 0, nextCycle = 0, lastIn = -1, lastOuts = [], hubAt = -1e9;
  const legs = [], litAt = TILES.map(() => -1e9);

  function cycle(now) {
    const ins = TILES.filter((t) => t.side === "in"), outs = TILES.filter((t) => t.side === "out");
    let i; do i = ins[Math.floor(Math.random() * ins.length)].i; while (i === lastIn);
    lastIn = i;
    const pick = [], n = Math.random() < 0.55 ? 1 : 2;
    while (pick.length < n) { const o = outs[Math.floor(Math.random() * outs.length)].i; if (!pick.includes(o) && !lastOuts.includes(o)) pick.push(o); }
    lastOuts = pick;
    legs.push({ i, t0: now, dir: -1 });
    hubAt = now + leg;
    pick.forEach((o) => { legs.push({ i: o, t0: now + leg + 120, dir: 1 }); litAt[o] = now + 2 * leg + 120; });
  }

  const B = register(stage, (dt, now) => {
    q = still ? target : target ? Math.min(1, q + dt / 2) : Math.max(0, q - dt / 2);
    const p = ease(q), T = now / 1000, drift = still ? 0 : 1 - phase(p, 0.1, 0.8);
    // 1) the threads draw back into the tiles they tie
    const tf = 1 - phase(p, 0, 0.35), m = phase(p, 0.1, 0.8);
    const pos = TILES.map((t) => {
      const [cx, cy, cz, cr] = t.chaos;
      return [lerp(cx, t.plan[0], m) + drift * 1.6 * Math.sin(T * (0.5 + t.i * 0.07) + t.i), lerp(cy, t.plan[1], m) + drift * 1.4 * Math.cos(T * (0.43 + t.i * 0.05) + 2 * t.i),
        lerp(cz, 0, m), lerp(cr, 0, m) + drift * 0.05 * Math.sin(T * 0.37 + t.i)];
    });
    threads.forEach((th) => {
      const A = pos[th.a], Bp = pos[th.b], k = th.i, pts = [];
      const c1 = [A[0] + 30 * Math.sin(k * 2.1), A[1] + 30 * Math.cos(k * 1.3)], c2 = [Bp[0] - 28 * Math.cos(k * 1.7), Bp[1] + 26 * Math.sin(k * 2.9)];
      for (let s = 0; s <= 24; s++) {
        const u = s / 24, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
        pts.push([a * A[0] + b * c1[0] + c * c2[0] + d * Bp[0], a * A[1] + b * c1[1] + c * c2[1] + d * Bp[1]]);
      }
      th.el.setAttribute("d", tf > 0.01 ? open(part(pts, tf).map(([x, y]) => P(x, y, 0.4))) : "");
    });
    // 2) the spokes reach out from the hub to every tile
    const wf = phase(p, 0.45, 1);
    spokes.forEach((el, i) => el.setAttribute("d", wf > 0.01 ? seg(onSpoke(i, 0), onSpoke(i, wf)) : ""));
    // the tiles, painted far to near, a fallen one after what it lies on
    const order = TILES.map((t, i) => [pos[i][0] + pos[i][1] + pos[i][2] * 4, t.el.g]).concat([[0, hub.g]]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, el]) => things.append(el));
    TILES.forEach((t, i) => {
      const [x, y, z, r] = pos[i];
      put(t.el, prism(P, front, turn(TILE, r, x, y), turn(TILE_IN, r, x, y), z, z + 2.4));
      const w = (u, v) => P(x + u * Math.cos(r) - v * Math.sin(r), y + u * Math.sin(r) + v * Math.cos(r), z + 2.4);
      t.ink.setAttribute("d", INK[t.k](w));
      t.el.sil.classList.toggle("hi", now >= litAt[i] - 40 && now < litAt[i] + 520);
    });
    // 4) the system runs: an input to the hub, the hub to one or two outputs, never the same twice
    const on = !still && q >= 0.98;
    if (on && now >= nextCycle) { cycle(now); nextCycle = now + 2 * leg + 500; }
    if (!on) { nextCycle = now + 200; legs.length = 0; dots.replaceChildren(); }
    for (let k = legs.length - 1; k >= 0; k--) {
      const L = legs[k], s = (now - L.t0) / leg;
      if (!L.dot) L.dot = mk("circle", { r: 2.2, class: "dot" }, dots);
      if (s >= 1) { L.dot.remove(); legs.splice(k, 1); continue; }
      L.dot.setAttribute("r", s < 0 ? 0 : 2.2);
      place(L.dot, onSpoke(L.i, L.dir < 0 ? 1 - ease(clamp(s, 0, 1)) : ease(clamp(s, 0, 1))));
    }
    hub.sil.classList.toggle("hi", q < 0.5 || (now >= hubAt - 40 && now < hubAt + 380));
    return true;
  });
  bag.add(B.unregister);

  const run = (to) => { target = to; read.textContent = to ? "plan" : "rest"; B.wake(); };
  bag.add(pointer(stage, {
    move: (_p, e) => { if (!e || e.pointerType === "mouse") run(1); },
    down: (_p, e) => run(e && e.pointerType !== "mouse" ? 1 - target : 1),
    leave: (e) => { if (!e || e.pointerType === "mouse") run(0); },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { leg = clamp(v, 300, 1500); }, destroy: bag.dispose };
}

hairline({
  name: "caos",
  means: "Scattered work tools, tied in tangled threads, order themselves into a plan where a hub routes every task.",
  rules: [4, 5, 6, 7],
  range: [600, 850, 1100],
  mount,
});

})();
(()=>{"use strict";

/**
 * CRM: follow-up, from by hand to automated. On a desk, a phone with four chat
 * bubbles piled crooked on its screen, and a client card standing in a holder:
 * a round portrait, a name, three rows and, last, a next step with its box.
 * Hovering runs them one by one; leaving puts back. Count: messages have been logged: each bubble lifts
 * off the phone, turns upright, shrinks onto the card and becomes its row; the
 * fourth becomes the next step. At rest two are logged; the newest row is
 * bright. The slider is the stagger, in ms.
 */
const {
  Cam, clamp, fillet, fit, facing, lerp, poly, prism, proj, rings, rrect, seg, circ,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const N = 4, REST = 2, PX = 24, PY = 56, XM = 118, ROWZ = [38, 30, 22, 14];
const SKEW = [-10, 8, -5, 11], OFF = [[1.5, -1.5], [-2, 1], [1, 2], [-1.5, -1]];
const BUBBLE = fillet([[6, -11], [6, 11], [-6, 11], [-6, 6], [-10, 8.5], [-6, 2.5], [-6, -11]], [3, 3, 3, 0.8, 0.6, 0.8, 3]);

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let stag = val;
  const C = Cam(45, 0.5, 1.95);
  fit(C, [[0, 8, -5], [140, 80, -5], [140, 8, -5], [0, 80, -5], [XM, 14, 64], [XM, 58, 64], [60, 50, 40]], 200, 166);
  const P = proj(C), front = facing(C);
  const card = (y, z) => P(XM, y, z);

  const g = mk("g", {}, svg);
  const [dr, di] = rings(0, 8, 140, 80, 8, 2);
  put(solid(g), prism(P, front, dr, di, -5, 0));
  // the phone, lying on the desk, its screen inset
  const [pr, pi] = rings(10, 34, 38, 78, 5, 1.2);
  put(solid(g), prism(P, front, pr, pi, 0, 3));
  mk("path", { d: poly(rrect(12.5, 38, 35.5, 74, 3, 4).map((q) => P(q.u, q.v, 3))), class: "nf lo" }, g);
  const pile = mk("g", {}, g);

  // the card in its holder
  const [hr, hi] = rings(108, 24, 124, 48, 4, 1.2);
  put(solid(g), prism(P, front, hr, hi, 0, 5));
  const face = rrect(14, 6, 58, 64, 3.5, 5);
  mk("path", { d: poly(face.map((q) => P(XM - 1.4, q.u, q.v))), class: "lo" }, g);
  mk("path", { d: poly(face.map((q) => card(q.u, q.v))), class: "sil" }, g);
  mk("path", { d: poly(circ(5, 16).map((q) => card(49 + q.u, 54 + q.v))) + seg(card(41, 56), card(22, 56)) + seg(card(41, 51), card(30, 51)), class: "nf" }, g);
  // the rows, a dashed blank until a message is logged into them; the last is the next step
  const rows = ROWZ.map((z, j) => ({
    blank: seg(card(48, z), card(22, z)),
    empty: mk("path", { class: "nf dash" }, g),
    full: mk("path", { class: "nf" }, g),
    d: (j === N - 1 ? poly(rrect(46, z - 2, 50, z + 2, 0.8, 2).map((q) => card(q.u, q.v))) : seg(card(50, z), card(49, z))) + seg(card(43, z + 1.4), card(22 + j * 3, z + 1.4)) + seg(card(43, z - 1.6), card(32 - j * 2, z - 1.6)),
  }));
  const top = mk("g", {}, g);

  // the pile, bottom bubble first; bubble n is the (N - 1 - n)th to be logged
  const bubs = [];
  for (let n = 0; n < N; n++) {
    const grp = mk("g", {}, pile);
    bubs.push({ n, i: N - 1 - n, grp, back: mk("path", { class: "lo" }, grp), face: mk("path", { class: "sil" }, grp), ink: mk("path", { class: "nf lo" }, grp), tw: tween(N - 1 - n < REST ? 1 : 0), drawn: NaN });
  }

  function drawBubble(b, t) {
    if (t === b.drawn) return;
    b.drawn = t;
    const done = t >= 0.999, row = rows[b.i];
    row.empty.setAttribute("d", done ? "" : row.blank);
    row.full.setAttribute("d", done ? row.d : "");
    (t <= 0 ? pile : top).append(b.grp);
    if (done) { b.back.setAttribute("d", ""); b.face.setAttribute("d", ""); b.ink.setAttribute("d", ""); return; }
    const e = t * t * (3 - 2 * t), a = SKEW[b.n] * (1 - e) * Math.PI / 180, th = e * Math.PI / 2, sc = lerp(1.35, 0.6, e);
    const cx = lerp(PX + OFF[b.n][0], XM + 1, t), cy = lerp(PY + OFF[b.n][1], 36, t);
    const zc = lerp(3.6 + b.n * 3.2, ROWZ[b.i], t) + 22 * Math.sin(Math.PI * t);
    const W = (dz) => (r, s) => {
      const rr = sc * (r * Math.cos(a) - s * Math.sin(a)), ss = sc * (r * Math.sin(a) + s * Math.cos(a));
      return P(cx + rr * Math.cos(th) - dz * Math.sin(th), cy + ss, zc + rr * Math.sin(th) - dz * Math.cos(th));
    };
    b.back.setAttribute("d", poly(BUBBLE.map(([r, s]) => W(1.2)(r, s))));
    b.face.setAttribute("d", poly(BUBBLE.map(([r, s]) => W(0)(r, s))));
    b.ink.setAttribute("d", seg(W(0)(2, -7), W(0)(2, 7)) + seg(W(0)(-2, -7), W(0)(-2, 2)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const b of bubs) { drawBubble(b, tval(b.tw, now)); if (!tdone(b.tw, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);


  let k = -1;
  function log(a) {
    if (a === k) return;
    const now = performance.now(), from = a > k ? k : k - 1;
    k = a;
    for (const b of bubs) {
      tset(b.tw, b.i < a ? 1 : 0, now, Math.abs(b.i - from) * stag);
      rows[b.i].full.classList.toggle("hi", b.i === a - 1);
      b.face.classList.toggle("hi", a === 0 && b.i === 0);
    }
    B.wake();
  }
  log(REST);

  bag.add(pointer(stage, {
    move: () => { log(N); read.textContent = `${N}/${N}`; },
    leave: () => { log(REST); read.textContent = "rest"; },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { stag = clamp(v, 0, 400); }, destroy: bag.dispose };
}

hairline({
  name: "crm",
  means: "Chat messages piled on a phone become the rows of a client card, the last one its next step.",
  rules: [2, 4, 5, 10],
  range: [100, 250, 400],
  mount,
});

})();
(()=>{"use strict";

/**
 * Cubos: a process. Three cubes in a row joined by a rail, the middle one
 * marked with a ring on its lid, and a small box waiting on the rail after the
 * first. Hovering sends the box along: into the second cube, out, into the
 * third, out to the end of the rail. Each cube swells a little while the box
 * is inside it, so you can tell it is passing through. The cube holding the
 * box is bright, or the box itself when it is between. The slider is the swell.
 */
const {
  Cam, circ, clamp, fit, facing, lerp, poly, prism, proj, rings, seg, tween, tset, tval, tdone,
  mk, pointer, put, register, disposer, solid,
} = HL;

const XS = [0, 46, 92], H = 12, B = 4.2, RZ = 10, X_REST = 23, X_END = 122;

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let swell = val;
  const C = Cam(45, 0.5, 2.15);
  fit(C, [[XS[0] - H * 1.3, -H * 1.3, 0], [X_END + B, H * 1.3, 0], [XS[0] - H * 1.3, -H * 1.3, 2 * H * 1.3], [XS[2] + H * 1.3, H * 1.3, 0]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  // each cube in its own group, then the rail that leaves it, so the box can be slipped in between
  const cubes = XS.map((x, k) => {
    const grp = mk("g", {}, g), el = solid(grp), mark = mk("path", { class: "nf lo" }, grp);
    const x1 = k < 2 ? XS[k + 1] - H : X_END;
    mk("path", { d: seg(P(x + H, -2.4, RZ), P(x1, -2.4, RZ)) + seg(P(x + H, 2.4, RZ), P(x1, 2.4, RZ)), class: "nf lo" }, g);
    return { x, grp, el, mark, drawn: NaN };
  });
  const box = solid(g);

  function drawCube(c, k, s) {
    if (s === c.drawn) return;
    c.drawn = s;
    const h = H * s, [r, i] = rings(c.x - h, -h, c.x + h, h, 2.2, 1);
    put(c.el, prism(P, front, r, i, 0, 2 * h));
    c.mark.setAttribute("d", k === 1 ? [4, 1.4].map((rr) => poly(circ(rr * s, 24).map((q) => P(c.x + q.u, q.v, 2 * h)))).join("") : "");
  }

  const tw = tween(0, 2800);
  const B_ = register(stage, (_dt, now) => {
    const u = tval(tw, now), bx = lerp(X_REST, X_END - B, u);
    let inside = -1;
    cubes.forEach((c, k) => {
      const near = clamp(1 - Math.abs(bx - c.x) / (H + B), 0, 1);
      if (Math.abs(bx - c.x) < H) inside = k;
      drawCube(c, k, 1 + swell * near * near * (3 - 2 * near));
    });
    // the box is painted just before the first cube it has not yet left, so a cube it is in covers it
    const next = cubes.find((c) => c.x + H > bx - B);
    next ? next.grp.before(box.g) : g.append(box.g);
    const [r, i] = rings(bx - B, -B, bx + B, B, 1, 0.5);
    put(box, prism(P, front, r, i, RZ - 0.5, RZ - 0.5 + 2 * B));
    cubes.forEach((c, k) => c.el.sil.classList.toggle("hi", k === inside));
    box.sil.classList.toggle("hi", inside < 0);
    return !tdone(tw, now);
  });
  bag.add(B_.unregister);

  const run = (to) => { tset(tw, to, performance.now(), 0); read.textContent = to ? "run" : "rest"; B_.wake(); };
  bag.add(pointer(stage, { move: () => run(1), leave: () => run(0) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { swell = clamp(v, 0, 0.3); cubes.forEach((c) => { c.drawn = NaN; }); B_.wake(); }, destroy: bag.dispose };
}

hairline({
  name: "cubos",
  means: "A small box travels a rail through three cubes; each one swells while the box is inside it.",
  rules: [4, 5, 6, 8],
  range: [0.06, 0.14, 0.22],
  mount,
});

})();
(()=>{"use strict";

/**
 * Documentos: document processing, from by hand to automated. On a desk, a
 * crooked pile of six papers of three kinds (a contract with a signature, a
 * delivery note with a grid, a receipt with a total), and three open file boxes
 * marked with one, two and three dots. Hovering runs them one by one; leaving puts back. Count: are
 * filed: each paper lifts off the pile, straightens, turns upright, and drops
 * into the box of its kind. At rest two are filed; the newest is bright. The
 * slider is the stagger, in ms.
 */
const {
  Cam, clamp, fit, facing, hull, lerp, open, poly, prism, proj, rings, ringAt, rrect, run, seg,
  tween, tset, tval, tdone, mk, place, pointer, put, register, disposer, solid,
} = HL;

const N = 6, REST = 2, PX = 22, PY = 58, BXS = [62, 90, 118], BW = 22, BY0 = 18, BY1 = 52, WH = 15, WT = 1.8;
const SKEW = [-9, 7, -4, 10, -6, 5], OFF = [[1.5, -1], [-2, 1.5], [1, 2], [-1.5, -1.5], [2, 0.5], [-1, 1]];
const PAGE = rrect(-10, -13, 10, 13, 2, 3);
/** The face of each kind, in page units (r up the page, s across): what makes it that kind of paper. */
const INK = [
  (w) => [6, 3, 0, -3].map((r) => seg(w(r, -9), w(r, 9))).join("") + open([[-7, 2], [-5.5, 4], [-7.5, 5.5], [-5.5, 7], [-7, 9]].map(([r, s]) => w(r, s))),
  (w) => seg(w(7, -9), w(7, 2)) + [3, -1, -5].map((r) => seg(w(r, -9), w(r, 9))).join("") + seg(w(3, 0), w(-8, 0)),
  (w) => poly([[8, -9], [8, -2], [4, -2], [4, -9]].map(([r, s]) => w(r, s))) + [1, -2].map((r) => seg(w(r, -9), w(r, 9))).join("") + seg(w(-6, 2), w(-6, 9)) + seg(w(-7.6, 2), w(-7.6, 9)),
];

/** An open box: `far` is painted before what stands in it, `near` after. */
function box(P, front, x0) {
  const outer = rrect(x0, BY0, x0 + BW, BY1, 4, 5), inner = rrect(x0 + WT, BY0 + WT, x0 + BW - WT, BY1 - WT, 4 - WT, 5);
  const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());
  const iF = LR(ringAt(P, run(inner, front), WH)), oT = LR(ringAt(P, run(outer, front), WH)), oB = LR(ringAt(P, run(outer, front), 0));
  return {
    far: [[poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), "sil"], [poly(ringAt(P, inner, WH)), "nf"]],
    near: [[poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo"], [open(oT), "nf lo"], [open(iF), "nf"], [open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil"]],
  };
}

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let stag = val;
  const C = Cam(45, 0.5, 1.9);
  fit(C, [[0, 12, -5], [146, 78, -5], [146, 12, -5], [0, 78, -5], [60, 45, 46], [140, 18, 22]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [dr, di] = rings(0, 12, 146, 78, 8, 2);
  put(solid(g), prism(P, front, dr, di, -5, 0));
  const pile = mk("g", {}, g), inside = [];
  BXS.forEach((x0, b) => {
    const p = box(P, front, x0);
    for (const [d, cls] of p.far) mk("path", { d, class: cls }, g);
    inside.push(mk("g", {}, g));
    for (const [d, cls] of p.near) mk("path", { d, class: cls }, g);
    // the box's mark: one, two or three dots on its front face
    for (let k = 0; k <= b; k++) place(mk("circle", { r: 1.1, class: "dot m" }, g), P(x0 + BW / 2 + (k - b / 2) * 4, BY1, 8));
  });
  const top = mk("g", {}, g);

  // the pile, bottom paper first; paper n is the (N - 1 - n)th to be filed
  const docs = [];
  for (let n = 0; n < N; n++) {
    const i = N - 1 - n, grp = mk("g", {}, pile);
    docs.push({ n, i, kind: i % 3, slot: Math.floor(i / 3), grp, back: mk("path", { class: "lo" }, grp), face: mk("path", { class: "sil" }, grp), ink: mk("path", { class: "nf lo" }, grp), tw: tween(i < REST ? 1 : 0), drawn: NaN });
  }

  function drawDoc(d, t) {
    if (t === d.drawn) return;
    d.drawn = t;
    const t1 = clamp(t / 0.65, 0, 1), t2 = clamp((t - 0.65) / 0.35, 0, 1), e = t1 * t1 * (3 - 2 * t1);
    const sx = BXS[d.kind] + 8 + d.slot * 6, a = SKEW[d.n] * (1 - e) * Math.PI / 180, th = e * Math.PI / 2;
    const cx = lerp(PX + OFF[d.n][0], sx, t1), cy = lerp(PY + OFF[d.n][1], 35, t1);
    const zc = t1 < 1 ? lerp(d.n * 3, 34, t1) + 16 * Math.sin(Math.PI * t1) : lerp(34, 12, t2);
    const W = (dx) => (r, s) => {
      const rr = r * Math.cos(a) - s * Math.sin(a), ss = r * Math.sin(a) + s * Math.cos(a);
      return P(cx + rr * Math.cos(th) - dx, cy + ss, zc + rr * Math.sin(th) + (1 - Math.sin(th)) * 1.2 * (dx ? 0 : 1));
    };
    (t <= 0 ? pile : t1 < 1 ? top : inside[d.kind]).append(d.grp);
    d.back.setAttribute("d", poly(PAGE.map((q) => W(1.2)(q.u, q.v))));
    d.face.setAttribute("d", poly(PAGE.map((q) => W(0)(q.u, q.v))));
    d.ink.setAttribute("d", INK[d.kind](W(0)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const d of docs) { drawDoc(d, tval(d.tw, now)); if (!tdone(d.tw, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);


  let k = -1;
  function file(a) {
    if (a === k) return;
    const now = performance.now(), from = a > k ? k : k - 1;
    k = a;
    for (const d of docs) {
      tset(d.tw, d.i < a ? 1 : 0, now, Math.abs(d.i - from) * stag);
      d.face.classList.toggle("hi", a === 0 ? d.i === 0 : d.i === a - 1);
    }
    B.wake();
  }
  file(REST);

  bag.add(pointer(stage, {
    move: () => { file(N); read.textContent = `${N}/${N}`; },
    leave: () => { file(REST); read.textContent = "rest"; },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { stag = clamp(v, 0, 400); }, destroy: bag.dispose };
}

hairline({
  name: "documentos",
  means: "A mixed pile of contracts, delivery notes and receipts files itself, paper by paper, into the box of each kind.",
  rules: [2, 4, 6, 10],
  range: [100, 250, 400],
  mount,
});

})();
(()=>{"use strict";

/**
 * Envio: delivery. A taped box on the ground, and above it a paper with three
 * lines and a tick, held at a slant. Hovering lowers the paper: it straightens
 * and settles on the lid, and the moment it rests there the box is sent,
 * sliding away with the paper on it. The tick is bright while the paper waits;
 * once it lands the box is. Leaving brings both back. The slider is how far
 * the box travels.
 */
const {
  Cam, clamp, fit, facing, lerp, open, poly, prism, proj, rings, rrect, seg, tween, tset, tval, tdone,
  mk, pointer, put, register, disposer, solid,
} = HL;

const BW = 30, BH = 22, HOVER = 46, SKEW = 20 * Math.PI / 180;
const PAPER = rrect(-10, -13, 10, 13, 1.8, 3), PAPER_IN = rrect(-9, -12, 9, 12, 1, 3);
const ss = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const turn = (ring, a, cx, cy) => {
  const c = Math.cos(a), n = Math.sin(a);
  return ring.map((q) => ({ u: cx + q.u * c - q.v * n, v: cy + q.u * n + q.v * c, nu: q.nu * c - q.nv * n, nv: q.nu * n + q.nv * c }));
};

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let dist = val;
  const C = Cam(45, 0.5, 3.1);
  fit(C, [[0, 0, 0], [BW + 58, BW, 0], [0, BW, 0], [BW + 58, 0, BH], [0, 0, HOVER + 6], [BW, BW, HOVER]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const box = solid(g), tape = mk("path", { class: "nf lo" }, g);
  const paper = solid(g), lines = mk("path", { class: "nf lo" }, g), tick = mk("path", { class: "nf" }, g);

  const tw = tween(0, 2600);
  let drawn = NaN;
  function draw(u) {
    if (u === drawn) return;
    drawn = u;
    const f = ss(u / 0.42), dx = dist * ss((u - 0.48) / 0.52);
    const [r, i] = rings(dx, 0, dx + BW, BW, 2.5, 1.1);
    put(box, prism(P, front, r, i, 0, BH));
    tape.setAttribute("d", seg(P(dx, BW / 2, BH), P(dx + BW, BW / 2, BH)) + seg(P(dx + BW, BW / 2, BH), P(dx + BW, BW / 2, BH - 8)));
    const a = SKEW * (1 - f), cx = dx + BW / 2, cy = BW / 2, z = lerp(HOVER, BH + 0.2, f);
    put(paper, prism(P, front, turn(PAPER, a, cx, cy), turn(PAPER_IN, a, cx, cy), z, z + 1));
    const w = (pu, pv) => { const q = turn([{ u: pu, v: pv, nu: 0, nv: 0 }], a, cx, cy)[0]; return P(q.u, q.v, z + 1); };
    // three lines of what was agreed, and the tick that approves it
    lines.setAttribute("d", [-10, -7.5, -5].map((v) => seg(w(-6, v), w(6, v))).join(""));
    tick.setAttribute("d", open([[-4.5, 6.5], [-1, 6.5], [-3, -2.5]].map(([pu, pv]) => w(pu, pv))));
    const landed = f >= 0.999;
    tick.classList.toggle("hi", !landed);
    box.sil.classList.toggle("hi", landed);
  }

  const B = register(stage, (_dt, now) => { draw(tval(tw, now)); return !tdone(tw, now); });
  bag.add(B.unregister);
  const run = (to) => { tset(tw, to, performance.now(), 0); read.textContent = to ? "run" : "rest"; B.wake(); };
  bag.add(pointer(stage, { move: () => run(1), leave: () => run(0) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";
  draw(0);

  return { set: (v) => { dist = clamp(v, 0, 58); drawn = NaN; draw(tval(tw, performance.now())); }, destroy: bag.dispose };
}

hairline({
  name: "envio",
  means: "An approved paper settles on a box, and the moment it lands the box is sent on its way.",
  rules: [4, 5, 6, 8],
  range: [34, 46, 58],
  mount,
});

})();
(()=>{"use strict";

/**
 * Facturas: accounts payable, from by hand to automated. A filing cabinet of
 * three drawers with six paper invoices piled crooked on its top. The
 * pointer's x sets how many have been filed: for each, its drawer slides open,
 * the invoice lifts off the pile, straightens, drops in, and the drawer shuts.
 * Dots on each drawer's front count what it holds. At rest two are filed; the
 * drawer that took the newest is bright. The slider is the stagger, in ms.
 */
const {
  Cam, clamp, fit, facing, lerp, poly, prism, proj, rings, rrect, seg, tween, tset, tval, tdone,
  mk, place, pointer, put, register, disposer, solid,
} = HL;

const N = 6, REST = 2, CX0 = 40, CX1 = 80, CY0 = 20, CY1 = 60, CH = 54, OPEN = 22;
const BANDS = [[4, 17], [20, 33], [36, 49]], DRAWER = [2, 1, 0, 2, 1, 0];
const SKEW = [-9, 7, -4, 10, -6, 5], OFF = [[1.5, -1], [-2, 1.5], [1, 2], [-1.5, -1.5], [2, 0.5], [-1, 1]];
const PAPER = rrect(-8, -12, 8, 12, 1.8, 3), PAPER_IN = rrect(-7, -11, 7, 11, 1, 3);

/** A ring turned by a radians and moved to (cx, cy): an invoice set down by a hand. */
const turn = (ring, a, cx, cy) => {
  const c = Math.cos(a), n = Math.sin(a);
  return ring.map((q) => ({ u: cx + q.u * c - q.v * n, v: cy + q.u * n + q.v * c, nu: q.nu * c - q.nv * n, nv: q.nu * n + q.nv * c }));
};
/** How far a paper's drawer stands open at t: out fast, held while it drops, then shut. */
const openAt = (t) => OPEN * (t < 0.7 ? clamp(t / 0.25, 0, 1) : clamp((1 - t) / 0.3, 0, 1));

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let stag = val;
  const C = Cam(45, 0.5, 2.05);
  fit(C, [[30, 12, -4], [114, 68, -4], [114, 12, -4], [30, 68, -4], [CX0, CY0, CH + 20], [CX1 + OPEN + 2, CY0, 50]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [dr, di] = rings(30, 12, 114, 68, 7, 2);
  put(solid(g), prism(P, front, dr, di, -4, 0));
  const [cr, ci] = rings(CX0, CY0, CX1, CY1, 3, 1.2);
  put(solid(g), prism(P, front, cr, ci, 0, CH));

  // the drawers, bottom first, so an open one above covers what lies in one below
  const drawers = BANDS.map(() => {
    const el = solid(g), cav = mk("path", { class: "nf lo" }, g), handle = mk("path", { class: "nf" }, g);
    const dots = [0, 1].map(() => mk("circle", { r: 1, class: "dot off" }, g));
    return { el, cav, handle, dots, papers: mk("g", {}, g), drawn: NaN };
  });
  const pile = mk("g", {}, g), top = mk("g", {}, g);

  const papers = [];
  for (let n = 0; n < N; n++) {
    const i = N - 1 - n, grp = mk("g", {}, pile), el = solid(grp), ink = mk("path", { class: "nf lo" }, grp);
    papers.push({ n, i, d: DRAWER[i], grp, el, ink, tw: tween(i < REST ? 1 : 0) });
  }

  function drawDrawer(k, o) {
    const dw = drawers[k], [z0, z1] = BANDS[k], x1 = CX1 + 2 + o;
    if (o === dw.drawn) return;
    dw.drawn = o;
    const [r, i] = rings(CX1, CY0 + 3, x1, CY1 - 3, 1.2, 0.5);
    put(dw.el, prism(P, front, r, i, z0, z1));
    dw.cav.setAttribute("d", o > 4 ? poly(rrect(CX1 + 1, CY0 + 4.5, x1 - 1.5, CY1 - 4.5, 0.8, 3).map((q) => P(q.u, q.v, z1))) : "");
    dw.handle.setAttribute("d", poly(rrect(CY0 + 14, z0 + 5, CY1 - 14, z0 + 8, 1.4, 3).map((q) => P(x1, q.u, q.v))));
    dw.dots.forEach((el, j) => place(el, P(x1, CY1 - 7 - j * 3.5, z0 + 6.5)));
  }

  function drawPaper(p, t, o) {
    const [, z1] = BANDS[p.d], f = clamp((t - 0.1) / 0.55, 0, 1), inside = f >= 1;
    const cx = inside ? CX1 + 2 + o - 10.5 : lerp(60 + OFF[p.n][0], CX1 + 2 + OPEN - 10.5, f);
    const cy = lerp(40 + OFF[p.n][1], 40, f);
    const z = inside ? z1 - 0.5 : lerp(CH + 0.2 + p.n * 2.2, z1 - 0.5, f) + 14 * Math.sin(Math.PI * f);
    const a = SKEW[p.n] * (1 - f) * Math.PI / 180, hidden = t >= 0.999 || (inside && o < 17);
    (inside ? drawers[p.d].papers : t > 0 ? top : pile).append(p.grp);
    if (hidden) { p.el.sil.setAttribute("d", ""); p.el.cr.setAttribute("d", ""); p.ink.setAttribute("d", ""); return; }
    put(p.el, prism(P, front, turn(PAPER, a, cx, cy), turn(PAPER_IN, a, cx, cy), z, z + 1));
    const w = (u, v) => { const r = turn([{ u, v, nu: 0, nv: 0 }], a, cx, cy)[0]; return P(r.u, r.v, z + 1); };
    // a header block, three item lines, and the total under a double rule
    p.ink.setAttribute("d", poly([[-5, -9], [-1, -9], [-1, -4], [-5, -4]].map(([u, v]) => w(u, v)))
      + [-1, 2.5, 6].map((v) => seg(w(-5, v), w(5, v))).join("") + seg(w(1, 9), w(5, 9)) + seg(w(1, 10.5), w(5, 10.5)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    const opens = [0, 0, 0], held = [0, 0, 0], ts = papers.map((p) => tval(p.tw, now));
    papers.forEach((p, j) => { opens[p.d] = Math.max(opens[p.d], openAt(ts[j])); if (ts[j] >= 0.999) held[p.d]++; if (!tdone(p.tw, now)) moving = true; });
    drawers.forEach((dw, k) => { drawDrawer(k, opens[k]); dw.dots.forEach((el, j) => el.setAttribute("class", j < held[k] ? "dot m" : "dot off")); });
    papers.forEach((p, j) => drawPaper(p, ts[j], opens[p.d]));
    return moving;
  });
  bag.add(B.unregister);


  let k = -1;
  function file(a) {
    if (a === k) return;
    const now = performance.now(), from = a > k ? k : k - 1;
    k = a;
    for (const p of papers) {
      tset(p.tw, p.i < a ? 1 : 0, now, Math.abs(p.i - from) * stag);
      p.el.sil.classList.toggle("hi", a === 0 && p.i === 0);
    }
    drawers.forEach((dw, d) => dw.el.sil.classList.toggle("hi", a > 0 && DRAWER[a - 1] === d));
    B.wake();
  }
  file(REST);

  bag.add(pointer(stage, {
    move: () => { file(N); read.textContent = `${N}/${N}`; },
    leave: () => { file(REST); read.textContent = "rest"; },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { stag = clamp(v, 0, 400); }, destroy: bag.dispose };
}

hairline({
  name: "facturas",
  means: "Paper invoices piled on a cabinet file themselves: each drawer opens, takes its invoice, and shuts.",
  rules: [2, 4, 6, 10],
  range: [100, 250, 400],
  mount,
});

})();
(()=>{"use strict";

/**
 * Lupa: diagnosis. Three cards lie in a row on the ground, each with two ruled
 * lines, and a magnifying glass hangs over the first. Hovering sends the glass
 * along the row: it glides to the middle card, stops there a moment to look,
 * then goes on to the last. The card under the glass is bright. Leaving brings
 * it back. The slider is the glass's height.
 */
const {
  Cam, circ, clamp, fit, facing, lerp, poly, prism, proj, rings, seg, tween, tset, tval, tdone,
  mk, pointer, put, register, disposer, solid,
} = HL;

const XS = [0, 52, 104], HALF = 13, R = 11;
const ss = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** Where the glass is along the row, in cards, at progress u: a glide, a stop on the middle card, a glide. */
const along = (u) => (u < 0.42 ? ss(u / 0.42) : u < 0.58 ? 1 : 1 + ss((u - 0.58) / 0.42));

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let lift = val;
  const C = Cam(45, 0.5, 1.9);
  fit(C, [[XS[0] - HALF, -HALF, 0], [XS[2] + HALF, HALF, 0], [XS[0], 0, 42 + R + 2], [XS[2] + HALF, 0, 42 + R], [XS[2] + 26, 0, 14]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const cards = XS.map((x) => {
    const el = solid(g), [r, i] = rings(x - HALF, -HALF, x + HALF, HALF, 2.4, 0.9);
    put(el, prism(P, front, r, i, 0, 2));
    mk("path", { d: seg(P(x - 7, -2, 2), P(x + 7, -2, 2)) + seg(P(x - 7, 3, 2), P(x + 3, 3, 2)), class: "nf lo" }, g);
    return el;
  });
  // the glass: a rim and its inner edge, open so the card shows through, and a handle
  const rim = mk("path", { class: "nf" }, g), lens = mk("path", { class: "nf lo" }, g), handle = mk("path", { class: "sil" }, g);

  const tw = tween(0, 2600);
  let drawn = NaN;
  function draw(u) {
    if (u === drawn) return;
    drawn = u;
    const pos = along(u), cx = lerp(XS[0], XS[2], pos / 2), cz = lift + 1.5 * Math.sin(Math.PI * 2 * pos);
    const ring = (rr) => poly(circ(rr, 40).map((q) => P(cx + q.u, 0, cz + q.v)));
    rim.setAttribute("d", ring(R));
    lens.setAttribute("d", ring(R - 2));
    // the handle leaves the rim down and to the right, as a hand would hold it
    const a = -0.9, ux = Math.cos(a), uz = Math.sin(a), nx = -uz, nz = ux, x0 = cx + R * ux, z0 = cz + R * uz, L = 16, w = 1.4;
    handle.setAttribute("d", poly([[x0 + nx * w, z0 + nz * w], [x0 + L * ux + nx * w, z0 + L * uz + nz * w], [x0 + L * ux - nx * w, z0 + L * uz - nz * w], [x0 - nx * w, z0 - nz * w]].map(([x, z]) => P(x, 0, z))));
    cards.forEach((el, k) => el.sil.classList.toggle("hi", Math.abs(pos - k) < 0.2));
  }

  const B = register(stage, (_dt, now) => { draw(tval(tw, now)); return !tdone(tw, now); });
  bag.add(B.unregister);
  const run = (to) => { tset(tw, to, performance.now(), 0); read.textContent = to ? "run" : "rest"; B.wake(); };
  bag.add(pointer(stage, { move: () => run(1), leave: () => run(0) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";
  draw(0);

  return { set: (v) => { lift = v; drawn = NaN; draw(tval(tw, performance.now())); }, destroy: bag.dispose };
}

hairline({
  name: "lupa",
  means: "A magnifying glass looks over three cards in turn, stopping at the middle one before it moves on.",
  rules: [4, 5, 7, 8],
  range: [30, 36, 42],
  mount,
});

})();
(()=>{"use strict";

/**
 * Maquina: a gear train after Leonardo's notebooks. On a wooden bench, four
 * spoked gears stand on posts and mesh in a zigzag; the first has a hand crank,
 * the last a drum that winds a rope and lifts a weight. Hovering turns
 * the crank on a spring; every gear follows at its own ratio and the weight
 * rises or falls. The bright stroke sits on the crank while the hand does the
 * work and passes to the weight once it is lifted past half. The slider is how
 * many turns a full sweep gives.
 */
const {
  Cam, clamp, circ, fit, facing, hull, poly, prism, proj, rings, seg, spring, stepS,
  mk, pointer, put, register, disposer, solid,
} = HL;

const GY = 40, R = [14, 9, 16, 8], TEETH = [12, 8, 14, 7], X0 = 22, Z0 = 30, U_REST = 0.35;

/** Gear centres in the (x, z) plane, each touching the last at its pitch radius. */
const CEN = [[X0, Z0]];
for (const [i, dx] of [[1, 20], [2, 22], [3, 22]]) {
  const [px, pz] = CEN[i - 1], d = R[i - 1] + R[i];
  CEN.push([px + dx, pz + (i % 2 ? 1 : -1) * Math.sqrt(d * d - dx * dx)]);
}
const ALPHA = CEN.slice(1).map(([x, z], i) => Math.atan2(z - CEN[i][1], x - CEN[i][0]));
/** The angle of every gear, from the crank's: each meshes tooth into gap with the one before. */
function angles(p0) {
  const out = [p0];
  for (let i = 1; i < 4; i++) {
    const a = ALPHA[i - 1], w = (2 * Math.PI) / TEETH[i];
    out.push(a + Math.PI - 0.5 * w - (out[i - 1] - a) * (R[i - 1] / R[i]));
  }
  return out;
}

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let turns = val;
  const C = Cam(45, 0.5, 2.25);
  const [lx, lz] = CEN[3], RX = lx + 3;
  fit(C, [[-4, 28, 0], [112, 56, 0], [112, 28, -6], [-4, 56, -6], [CEN[1][0], GY, CEN[1][1] + R[1] + 2], [X0, GY, Z0 + R[0] + 2], [RX, 50, 0]], 200, 166);
  const P = proj(C), front = facing(C);
  const at = (x, z, y = GY) => P(x, y, z);

  const g = mk("g", {}, svg);
  const [br, bi] = rings(-4, 28, 112, 56, 4, 1.4);
  put(solid(g), prism(P, front, br, bi, -6, 0));
  // a post behind each gear, from the bench up to its axle
  CEN.forEach(([x, z]) => { const [r, i] = rings(x - 2.2, 33, x + 2.2, 37.4, 1.2, 0.5); put(solid(g), prism(P, front, r, i, 0, z)); });

  const gears = R.map(() => ({ back: mk("path", { class: "lo" }, g), face: mk("path", { class: "sil" }, g), spokes: mk("path", { class: "nf lo" }, g) }));
  const crank = mk("path", { class: "nf sil" }, g);
  // the drum on the last axle: a short cylinder standing out of the gear
  const ring = (y) => circ(3.4, 14).map((q) => at(lx + q.u, lz + q.v, y));
  mk("path", { d: poly(hull(ring(GY).concat(ring(46)))), class: "sil" }, g);
  mk("path", { d: poly(ring(46)), class: "nf lo" }, g);
  const rope = mk("path", { class: "nf" }, g), weight = solid(g);

  /** A gear's outline at angle phi: flat-topped teeth round its pitch circle. */
  function teeth(i, phi, y) {
    const [cx, cz] = CEN[i], r = R[i], n = TEETH[i], w = (2 * Math.PI) / n, pts = [];
    for (let j = 0; j < n; j++) {
      const a = phi + j * w;
      for (const [f, rr] of [[-0.2, r + 1.7], [0.2, r + 1.7], [0.3, r - 1.5], [0.7, r - 1.5]]) pts.push(at(cx + rr * Math.cos(a + f * w), cz + rr * Math.sin(a + f * w), y));
    }
    return poly(pts);
  }

  const sp = spring(U_REST);
  let drawn = NaN;
  function draw(u) {
    if (u === drawn) return;
    drawn = u;
    const ph = angles((u - U_REST) * 2 * Math.PI * turns);
    gears.forEach((el, i) => {
      const [cx, cz] = CEN[i], r = R[i] - 4;
      el.back.setAttribute("d", teeth(i, ph[i], GY - 2.4));
      el.face.setAttribute("d", teeth(i, ph[i], GY));
      // a rim, four spokes and a hub: the wheel as Leonardo drew it
      el.spokes.setAttribute("d", poly(circ(r, 20).map((q) => at(cx + q.u, cz + q.v))) + poly(circ(1.8, 10).map((q) => at(cx + q.u, cz + q.v)))
        + [0, 1, 2, 3].map((k) => { const a = ph[i] + k * Math.PI / 2; return seg(at(cx + 1.8 * Math.cos(a), cz + 1.8 * Math.sin(a)), at(cx + r * Math.cos(a), cz + r * Math.sin(a))); }).join(""));
    });
    const a0 = ph[0], hx = X0 + 9 * Math.cos(a0), hz = Z0 + 9 * Math.sin(a0);
    crank.setAttribute("d", seg(at(X0, Z0), at(hx, hz)) + seg(at(hx, hz), at(hx, hz, GY + 9)));
    const zw = clamp(12 - (ph[3] - angles(0)[3]) * 1.6, 1, 19);
    rope.setAttribute("d", seg(at(RX, lz, 46), at(RX, zw + 8, 46)));
    const [wr, wi] = rings(RX - 4, 42, RX + 4, 50, 1.6, 0.7);
    put(weight, prism(P, front, wr, wi, zw, zw + 8));
    const lifted = zw > 10;
    weight.sil.classList.toggle("hi", lifted);
    crank.classList.toggle("hi", !lifted);
  }

  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(sp.x); return m; });
  bag.add(B.unregister);

  bag.add(pointer(stage, {
    move: () => { sp.t = 1; read.textContent = "run"; B.wake(); },
    leave: () => { sp.t = U_REST; read.textContent = "rest"; B.wake(); },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";
  draw(U_REST);

  return { set: (v) => { turns = v; drawn = NaN; draw(sp.x); }, destroy: bag.dispose };
}

hairline({
  name: "maquina",
  means: "A hand crank drives a train of gears; the machine winds the rope and lifts the weight.",
  rules: [1, 3, 8, 9],
  range: [0.4, 0.8, 1.2],
  mount,
});

})();
(()=>{"use strict";

/**
 * Monedas: savings. Two stacks of coins: eight on the left, two on the right.
 * Hovering moves them one by one, each lifting off the top of the left stack
 * and landing on top of the right, until the left holds one and the right
 * nine. The top coin of the right stack is bright. Leaving sends them back.
 * The slider is the stagger, in ms.
 */
const {
  Cam, circ, clamp, fit, facing, lerp, prism, proj, tween, tset, tval, tdone,
  mk, pointer, put, register, disposer, solid,
} = HL;

const R = 12, TH = 3, STEP = 3.4, M = 7, LEFT = [0, 26], RIGHT = [42, -10];
const ring = (rr, cx, cy) => circ(rr, 28).map((q) => ({ u: cx + q.u, v: cy + q.v, nu: q.nu, nv: q.nv }));

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let stag = val;
  const C = Cam(45, 0.5, 3.1);
  fit(C, [[LEFT[0] - R, LEFT[1] + R, 0], [RIGHT[0] + R, RIGHT[1] - R, 0], [LEFT[0] - R, LEFT[1], 9 * STEP], [RIGHT[0] + R, RIGHT[1], 10 * STEP], [24, 6, 9 * STEP + 26]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  // one coin stays on the left and two on the right; the seven between travel. Coin m leaves
  // the left at level 7 - m (the top first) and lands on the right at level 2 + m.
  const coins = [[LEFT, 0, 0], [RIGHT, 0, 1], [RIGHT, 1, 1]].map(([[x, y], lv, side]) => ({ el: solid(g), from: [x, y, lv], to: [x, y, lv], side }));
  for (let m = 0; m < M; m++) coins.push({ m, el: solid(g), from: [...LEFT, M - m], to: [...RIGHT, 2 + m], tw: tween(0) });

  function place(c, t) {
    const [x0, y0, l0] = c.from, [x1, y1, l1] = c.to, x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    const z = lerp(l0 * STEP, l1 * STEP, t) + 26 * Math.sin(Math.PI * t);
    put(c.el, prism(P, front, ring(R, x, y), ring(R - 1.3, x, y), z, z + TH));
  }
  /** Paint order: the left stack bottom up, then the right, then whatever is in the air. */
  function order(ts) {
    const key = (c, t) => (t <= 0 ? c.from[2] : t >= 1 ? 100 + c.to[2] : 200 + t);
    const sorted = coins.map((c, i) => [key(c, ts[i]), c]).sort((a, b) => a[0] - b[0]);
    sorted.forEach(([, c]) => g.append(c.el.g));
    const top = sorted.filter(([k]) => k >= 100 && k < 200).pop();
    coins.forEach((c) => c.el.sil.classList.toggle("hi", !!top && c === top[1]));
  }

  let last = "";
  const B = register(stage, (_dt, now) => {
    let moving = false;
    const ts = coins.map((c) => (c.tw ? tval(c.tw, now) : c.side));
    coins.forEach((c, i) => { place(c, ts[i]); if (c.tw && !tdone(c.tw, now)) moving = true; });
    const sig = ts.map((t) => (t <= 0 ? 0 : t >= 1 ? 2 : 1)).join("");
    if (moving || sig !== last) { order(ts); last = sig; }
    return moving;
  });
  bag.add(B.unregister);

  const run = (to) => {
    const now = performance.now();
    coins.forEach((c) => c.tw && tset(c.tw, to, now, (to ? c.m : M - 1 - c.m) * stag));
    read.textContent = to ? "run" : "rest";
    B.wake();
  };
  bag.add(pointer(stage, { move: () => run(1), leave: () => run(0) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { stag = clamp(v, 0, 400); }, destroy: bag.dispose };
}

hairline({
  name: "monedas",
  means: "Coins move one by one from a tall stack on the left to the right, until almost all of them sit there.",
  rules: [2, 4, 5, 6],
  range: [100, 180, 260],
  mount,
});

})();
(()=>{"use strict";

/**
 * Planilla: reporting, from by hand to automated. On a desk, a pile of six
 * printed spreadsheets, stacked crooked, and a monitor whose screen holds a bar
 * chart. Hovering runs them one by one; leaving puts back. Count: sheets have been fed in: each one flies
 * off the pile, straightens, slips behind the screen, and raises one bar. At
 * rest half the pile is gone and three bars stand; the newest bar is bright.
 * The slider is the stagger, in ms.
 */
const {
  Cam, clamp, fit, facing, lerp, poly, prism, proj, rings, rrect, seg, tween, tset, tval, tdone,
  mk, pointer, put, register, disposer, solid,
} = HL;

const N = 6, REST = 3, XM = 124, TK = 3, PX = 25, PY = 40;
const SKEW = [-8, 6, -3, 9, -6, 4], OFF = [[1.5, -1], [-2, 1.5], [1, 2], [-1.5, -1.5], [2, 0.5], [-1, 1]];
const BARS = [10, 16, 13, 22, 27, 33];
const SHEET = rrect(-13, -17, 13, 17, 2.4, 3), SHEET_IN = rrect(-12, -16, 12, 16, 1.4, 3);

/** A ring turned by a degrees, scaled by s and moved to (cx, cy): a sheet set down by a hand. */
const turn = (ring, a, s, cx, cy) => {
  const c = Math.cos(a * Math.PI / 180), n = Math.sin(a * Math.PI / 180);
  return ring.map((q) => ({ u: cx + s * (q.u * c - q.v * n), v: cy + s * (q.u * n + q.v * c), nu: q.nu * c - q.nv * n, nv: q.nu * n + q.nv * c }));
};

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let stag = val;
  const C = Cam(45, 0.5, 1.9);
  fit(C, [[-8, -8, -5], [140, 72, -5], [140, -8, -5], [-8, 72, -5], [XM, 0, 64], [60, 36, 46]], 200, 166);
  const P = proj(C), front = facing(C);
  const onScreen = (pts, x = XM) => pts.map((q) => P(x, q.u, q.v));

  const g = mk("g", {}, svg);
  const [dr, di] = rings(-8, -8, 140, 72, 8, 2);
  put(solid(g), prism(P, front, dr, di, -5, 0));

  // the pile, bottom sheet first; sheet n flies when n >= N - k
  const sheets = [];
  for (let n = 0; n < N; n++) {
    const el = solid(g), ink = mk("path", { class: "nf lo" }, el.g);
    sheets.push({ n, el, ink, tw: tween(n >= N - REST ? 1 : 0), drawn: NaN });
  }

  // the monitor: a foot, a neck, and a screen standing in the plane x = XM
  const [fr, fi] = rings(104, 20, 128, 42, 5, 1.2), [nr, ni] = rings(108, 27, 115, 35, 2.5, 0.8);
  put(solid(g), prism(P, front, fr, fi, 0, 3));
  put(solid(g), prism(P, front, nr, ni, 3, 20));
  const frame = rrect(0, 16, 64, 64, 4, 5);
  mk("path", { d: poly(onScreen(frame, XM - TK)), class: "lo" }, g);
  mk("path", { d: poly(onScreen(frame)), class: "sil" }, g);
  mk("path", { d: poly(onScreen(rrect(3, 19, 61, 61, 2, 4))) + seg(P(XM, 6, 22), P(XM, 58, 22)), class: "nf lo" }, g);
  const bars = BARS.map(() => mk("path", { class: "nf" }, g));

  function drawSheet(sh, t) {
    if (t === sh.drawn) return;
    sh.drawn = t;
    if (t > 0.97) { sh.el.sil.setAttribute("d", ""); sh.el.cr.setAttribute("d", ""); sh.ink.setAttribute("d", ""); return; }
    const n = sh.n, cx = lerp(PX + OFF[n][0], XM - 3, t), cy = lerp(PY + OFF[n][1], 32, t);
    const z = lerp(n * 3, 40, t) + 18 * Math.sin(Math.PI * t), a = SKEW[n] * (1 - t), s = lerp(1, 0.25, t);
    put(sh.el, prism(P, front, turn(SHEET, a, s, cx, cy), turn(SHEET_IN, a, s, cx, cy), z, z + 1.2));
    // the printed grid: four rows and a column, on the sheet's face
    const w = (u, v) => { const r = turn([{ u, v, nu: 0, nv: 0 }], a, s, cx, cy)[0]; return P(r.u, r.v, z + 1.2); };
    sh.ink.setAttribute("d", [-10, -4, 2, 8].map((v) => seg(w(-9, v), w(9, v))).join("") + seg(w(-4, -13), w(-4, 13)));
  }
  function drawBar(i, t) {
    const y1 = 57 - i * 9, h = BARS[i] * clamp((t - 0.6) / 0.4, 0, 1);
    bars[i].setAttribute("d", h < 0.5 ? "" : poly(onScreen(rrect(y1 - 6.5, 22, y1, 22 + h, 1.2, 3))));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const sh of sheets) {
      const t = tval(sh.tw, now);
      drawSheet(sh, t); drawBar(N - 1 - sh.n, t);
      if (!tdone(sh.tw, now)) moving = true;
    }
    return moving;
  });
  bag.add(B.unregister);


  let k = -1;
  function feed(a) {
    if (a === k) return;
    const now = performance.now(), from = a > k ? k : k - 1;
    k = a;
    for (const sh of sheets) {
      const i = N - 1 - sh.n;
      tset(sh.tw, i < a ? 1 : 0, now, Math.abs(i - from) * stag);
      bars[i].classList.toggle("hi", i === a - 1);
      sh.el.sil.classList.toggle("hi", a === 0 && sh.n === N - 1);
    }
    B.wake();
  }
  feed(REST);

  bag.add(pointer(stage, {
    move: () => { feed(N); read.textContent = `${N}/${N}`; },
    leave: () => { feed(REST); read.textContent = "rest"; },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { stag = clamp(v, 0, 400); }, destroy: bag.dispose };
}

hairline({
  name: "planilla",
  means: "Printed spreadsheets leave the pile one by one and become the bars of a live report on the screen.",
  rules: [1, 2, 4, 5],
  range: [100, 250, 400],
  mount,
});

})();
(()=>{"use strict";

/**
 * Prototipo: building a prototype. A sheet lies on the ground with a system
 * half drawn on it: three boxes joined by lines, like a flow. A pencil leans
 * over it, its tip on the last point drawn. Hovering lets the pencil finish
 * the drawing, line by line, box by box; leaving rubs it back to where it was.
 * The graphite tip is the bright mark. The slider is how much is drawn at rest.
 */
const {
  Cam, clamp, fit, facing, hull, lerp, open, poly, prism, proj, rings, tween, tset, tval, tdone,
  mk, pointer, put, register, disposer, solid,
} = HL;

const Z = 1.2;
/** The system, as one stroke on the sheet: box, line, box, line, box. A short retrace is hidden under ink. */
const PATH = [
  [-14, -14], [-14, -8], [-32, -8], [-32, -20], [-14, -20], [-14, -14],
  [0, -14], [0, -2],
  [-9, -2], [-9, 10], [9, 10], [9, -2], [0, -2], [9, -2], [9, 4],
  [23, 4], [23, 14],
  [14, 14], [14, 26], [32, 26], [32, 14], [23, 14],
];
const LEN = [0];
for (let k = 1; k < PATH.length; k++) LEN.push(LEN[k - 1] + Math.hypot(PATH[k][0] - PATH[k - 1][0], PATH[k][1] - PATH[k - 1][1]));
const TOTAL = LEN[LEN.length - 1];

/** The stroke drawn up to share u, ending at the pencil's tip. */
function upTo(u) {
  const L = u * TOTAL, pts = [PATH[0]];
  for (let k = 1; k < PATH.length; k++) {
    if (LEN[k] <= L) { pts.push(PATH[k]); continue; }
    const f = (L - LEN[k - 1]) / (LEN[k] - LEN[k - 1]);
    pts.push([lerp(PATH[k - 1][0], PATH[k][0], f), lerp(PATH[k - 1][1], PATH[k][1], f)]);
    break;
  }
  return pts;
}

// the pencil leans up and away from its tip, so it never hides what it has drawn
const D = (() => { const v = [0.3, -0.5, 0.82], n = Math.hypot(...v); return v.map((c) => c / n); })();
const E1 = (() => { const n = Math.hypot(D[1], D[0]); return [D[1] / n, -D[0] / n, 0]; })();
const E2 = [D[1] * E1[2] - D[2] * E1[1], D[2] * E1[0] - D[0] * E1[2], D[0] * E1[1] - D[1] * E1[0]];

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let rest = val;
  const C = Cam(45, 0.5, 2.5);
  const top = (x, y) => [x + D[0] * 46, y + D[1] * 46, Z + D[2] * 46];
  fit(C, [[-40, -30, 0], [40, 30, 0], [40, -30, 0], [-40, 30, 0], top(-32, -20), top(32, 26), top(-32, -8), top(32, 14)], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [sr, si] = rings(-40, -30, 40, 30, 2.4, 1.2);
  put(solid(g), prism(P, front, sr, si, 0, Z));
  const ink = mk("path", { class: "nf" }, g);
  const eraser = mk("path", {}, g), body = mk("path", { class: "sil" }, g), cone = mk("path", {}, g), lead = mk("path", { class: "hi" }, g);

  /** A ring round the pencil's axis, s along it from the tip, of radius r, projected. */
  const ring = (T, s, r) => Array.from({ length: 14 }, (_, k) => {
    const a = (k / 14) * Math.PI * 2, c = Math.cos(a) * r, n = Math.sin(a) * r;
    return P(T[0] + D[0] * s + E1[0] * c + E2[0] * n, T[1] + D[1] * s + E1[1] * c + E2[1] * n, T[2] + D[2] * s + E1[2] * c + E2[2] * n);
  });

  const tw = tween(rest, 3200);
  let drawn = NaN;
  function draw(u) {
    if (u === drawn) return;
    drawn = u;
    const pts = upTo(u), [px, py] = pts[pts.length - 1], T = [px, py, Z], tip = P(...T);
    ink.setAttribute("d", open(pts.map(([x, y]) => P(x, y, Z))));
    eraser.setAttribute("d", poly(hull(ring(T, 40, 2.2).concat(ring(T, 46, 2.2)))));
    body.setAttribute("d", poly(hull(ring(T, 7, 2.2).concat(ring(T, 40, 2.2)))));
    cone.setAttribute("d", poly(hull([tip].concat(ring(T, 7, 2.2)))));
    lead.setAttribute("d", poly(hull([tip].concat(ring(T, 2.4, 0.75)))));
  }

  const B = register(stage, (_dt, now) => { draw(tval(tw, now)); return !tdone(tw, now); });
  bag.add(B.unregister);
  let on = false;
  const run = (to) => { on = to; tset(tw, to ? 1 : rest, performance.now(), 0); read.textContent = to ? "run" : "rest"; B.wake(); };
  bag.add(pointer(stage, { move: () => run(true), leave: () => run(false) }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";
  draw(rest);

  return { set: (v) => { rest = clamp(v, 0.1, 0.9); if (!on) run(false); }, destroy: bag.dispose };
}

hairline({
  name: "prototipo",
  means: "A pencil finishes drawing a small system on a sheet: three boxes, joined by lines.",
  rules: [4, 5, 6, 8],
  range: [0.2, 0.38, 0.55],
  mount,
});

})();
(()=>{"use strict";

/**
 * Sourcing: screening, from by hand to automated. On a desk, a crooked pile of
 * five CVs (a photo square and lines), a gate strung with a dashed mesh, and a
 * row of five pedestals stepping down, highest score first. The pointer's x
 * sets how many have been screened: each CV lifts off the pile, passes through
 * the gate, stands up and lands on the pedestal of its rank, so the row fills
 * out of order and ends sorted. At rest two are placed; the newest is bright.
 * The slider is the stagger, in ms.
 */
const {
  Cam, clamp, fit, facing, lerp, poly, prism, proj, rings, rrect, seg,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const N = 5, REST = 2, PX = 22, PY = 56, GX = 62, CY = 38;
const SLOTX = [84, 97, 110, 123, 136], PED = [24, 19, 14, 9, 4], RANK = [2, 0, 4, 1, 3];
const SKEW = [-9, 7, -4, 10, -6], OFF = [[1.5, -1], [-2, 1.5], [1, 2], [-1.5, -1.5], [2, 0.5]];
const CV = rrect(-8.5, -6, 8.5, 6, 1.8, 3);

function mount({ stage, svg, read }, val) {
  const bag = disposer();
  let stag = val;
  const C = Cam(45, 0.5, 1.95);
  fit(C, [[0, 14, -5], [148, 78, -5], [148, 14, -5], [0, 78, -5], [GX, 22, 36], [86, 38, 40], [40, 46, 34]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [dr, di] = rings(0, 14, 148, 78, 8, 2);
  put(solid(g), prism(P, front, dr, di, -5, 0));
  const pile = mk("g", {}, g), behind = mk("g", {}, g);

  // the gate: two posts, a bar, and the dashed mesh strung between them
  mk("path", { d: [8, 14, 20, 26].map((z) => seg(P(GX + 2, 27, z), P(GX + 2, 49, z))).join(""), class: "nf dash" }, g);
  for (const [y0, y1, z0, z1] of [[23, 27, 0, 34], [49, 53, 0, 34], [23, 53, 30, 34]]) {
    const [r, i] = rings(GX, y0, GX + 4, y1, 1.6, 0.6);
    put(solid(g), prism(P, front, r, i, z0, z1));
  }
  // the pedestals, highest score first, each followed by the group its CV stands in
  const slots = SLOTX.map((x, k) => {
    const [r, i] = rings(x - 6, CY - 6, x + 6, CY + 6, 2, 0.8);
    put(solid(g), prism(P, front, r, i, 0, PED[k]));
    return mk("g", {}, g);
  });
  const top = mk("g", {}, g);

  // the pile, bottom CV first; CV n is the (N - 1 - n)th to be screened
  const cvs = [];
  for (let n = 0; n < N; n++) {
    const i = N - 1 - n, grp = mk("g", {}, pile);
    cvs.push({ n, i, rank: RANK[i], grp, back: mk("path", { class: "lo" }, grp), face: mk("path", { class: "sil" }, grp), ink: mk("path", { class: "nf lo" }, grp), tw: tween(i < REST ? 1 : 0), drawn: NaN });
  }

  function drawCV(c, t) {
    if (t === c.drawn) return;
    c.drawn = t;
    const t1 = clamp(t / 0.5, 0, 1), t2 = clamp((t - 0.5) / 0.5, 0, 1), e = t2 * t2 * (3 - 2 * t2);
    const sx = SLOTX[c.rank], top0 = PED[c.rank] + 8.5;
    const a = SKEW[c.n] * (1 - t1) * Math.PI / 180, th = e * Math.PI / 2;
    const cx = t < 0.5 ? lerp(PX + OFF[c.n][0], GX + 2, t1) : lerp(GX + 2, sx, t2);
    const cy = t < 0.5 ? lerp(PY + OFF[c.n][1], CY, t1) : CY;
    const zc = t < 0.5 ? lerp(c.n * 3.6, 16, t1) + 8 * Math.sin(Math.PI * t1) : lerp(16, top0, t2) + 14 * Math.sin(Math.PI * t2);
    const W = (dy) => (r, s) => {
      const rr = r * Math.cos(a) - s * Math.sin(a), ss = r * Math.sin(a) + s * Math.cos(a);
      return P(cx + ss, cy + rr * Math.cos(th) - dy * Math.sin(th), zc + rr * Math.sin(th) + (1 - Math.sin(th)) * 1.2 * (dy ? 0 : 1));
    };
    (t <= 0 ? pile : cx < GX + 2 ? behind : t2 < 1 ? top : slots[c.rank]).append(c.grp);
    c.back.setAttribute("d", poly(CV.map((q) => W(1.2)(q.u, q.v))));
    c.face.setAttribute("d", poly(CV.map((q) => W(0)(q.u, q.v))));
    const w = W(0);
    c.ink.setAttribute("d", poly([[7, -4.4], [7, -1], [3.4, -1], [3.4, -4.4]].map(([r, s]) => w(r, s)))
      + seg(w(6, 0.8), w(6, 4.4)) + seg(w(4.2, 0.8), w(4.2, 3.2)) + [0.5, -2.5, -5.5].map((r) => seg(w(r, -4.4), w(r, 4.4))).join(""));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const c of cvs) { drawCV(c, tval(c.tw, now)); if (!tdone(c.tw, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);


  let k = -1;
  function screen(a) {
    if (a === k) return;
    const now = performance.now(), from = a > k ? k : k - 1;
    k = a;
    for (const c of cvs) {
      tset(c.tw, c.i < a ? 1 : 0, now, Math.abs(c.i - from) * stag);
      c.face.classList.toggle("hi", a === 0 ? c.i === 0 : c.i === a - 1);
    }
    B.wake();
  }
  screen(REST);

  bag.add(pointer(stage, {
    move: () => { screen(N); read.textContent = `${N}/${N}`; },
    leave: () => { screen(REST); read.textContent = "rest"; },
  }));
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return { set: (v) => { stag = clamp(v, 0, 400); }, destroy: bag.dispose };
}

hairline({
  name: "sourcing",
  means: "A pile of CVs passes through a filter one by one and stands in a row sorted by score.",
  rules: [2, 4, 5, 6],
  range: [100, 250, 400],
  mount,
});

})();
