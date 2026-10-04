// Moving backdrops (D-159), the title screen (D-158) and the two end
// screens (D-161, D-162). A backdrop is a
// still picture plus art/background_<name>_motion.js, which names layer
// pictures and effects; this file plays them on a canvas. Every effect is
// drawn by compositing only, never by reading pixels back, so it runs from
// file:// as well as from a server. Under automation (navigator.webdriver)
// a backdrop draws one frozen frame and the title screen stays shut, so
// tests and screenshots are repeatable; the end screens stay shut too.
// ?motion=1, ?title=1 and ?endscreen=1 override.
// New backdrops need new files in art/ only, no change here.

const BACKDROP_MOTION = { defs: {}, waiting: {}, images: {}, live: [], raf: 0, endTimer: 0 };

function backdropMotionAutomated(flag) {
  return navigator.webdriver === true && location.search.indexOf(flag + '=1') === -1;
}

function backdropMotionRegister(name, def) {
  BACKDROP_MOTION.defs[name] = def;
}

function backdropMotionRng(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function backdropMotionCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Loads art/background_<name>_motion.js once; done(def) or done(null).
function backdropMotionLoadDef(name, done) {
  const M = BACKDROP_MOTION;
  if (M.defs[name]) { done(M.defs[name]); return; }
  if (M.waiting[name]) { M.waiting[name].push(done); return; }
  M.waiting[name] = [done];
  const finish = function() {
    const list = M.waiting[name]; delete M.waiting[name];
    list.forEach(function(fn) { fn(M.defs[name] || null); });
  };
  const tag = document.createElement('script');
  tag.onload = finish; tag.onerror = finish;
  tag.src = 'art/background_' + name + '_motion.js?v=' + GAME_CONFIG.BUILD;
  document.head.appendChild(tag);
}

function backdropMotionLoadImages(paths, done) {
  const M = BACKDROP_MOTION;
  let left = paths.length, failed = false;
  const one = function(ok) { if (!ok) failed = true; left--; if (left === 0) done(!failed); };
  paths.forEach(function(p) {
    if (M.images[p]) { one(true); return; }
    const img = new Image();
    img.onload = function() { M.images[p] = img; one(true); };
    img.onerror = function() { one(false); };
    img.src = p.indexOf('data:') === 0 ? p : p + '?v=' + GAME_CONFIG.BUILD;
  });
}

// Shared by shimmer and breathe: the layer's own shape filled black, drawn
// over the still to take the moving part down before light is added back.
function backdropMotionDimmer(layer, box) {
  const w = box[2] - box[0], h = box[3] - box[1];
  const c = backdropMotionCanvas(w, h), k = c.getContext('2d');
  k.drawImage(layer, box[0], box[1], w, h, 0, 0, w, h);
  k.globalCompositeOperation = 'source-in';
  k.fillStyle = '#000'; k.fillRect(0, 0, w, h);
  return c;
}

function backdropMotionCross(ctx, x, y, u, core, arm, tip, size) {
  ctx.fillStyle = core; ctx.fillRect(x, y, u, u);
  if (size >= 1 && arm) {
    ctx.fillStyle = arm;
    ctx.fillRect(x - u, y, u, u); ctx.fillRect(x + u, y, u, u); ctx.fillRect(x, y - u, u, u); ctx.fillRect(x, y + u, u, u);
  }
  if (size >= 2 && tip) {
    ctx.fillStyle = tip;
    ctx.fillRect(x - 2 * u, y, u, u); ctx.fillRect(x + 2 * u, y, u, u); ctx.fillRect(x, y - 2 * u, u, u); ctx.fillRect(x, y + 2 * u, u, u);
  }
}

// One entry per effect type: make(e, env) returns draw(ctx, u, frame, ms),
// u the position in the loop from 0 to 1.
const BACKDROP_MOTION_EFFECTS = {

  // A layer brightened and darkened by a moving pattern: 'bands' is light
  // through smoke, 'blocks' is lava.
  shimmer: function(e, env) {
    const TAU = Math.PI * 2, layer = env.images[e.layer], box = e.box, cell = e.cell;
    const w = box[2] - box[0], h = box[3] - box[1], pw = Math.ceil(w / cell), ph = Math.ceil(h / cell);
    const pat = backdropMotionCanvas(pw, ph), pk = pat.getContext('2d'), data = pk.createImageData(pw, ph);
    const work = backdropMotionCanvas(w, h), wk = work.getContext('2d');
    const dimmer = backdropMotionDimmer(layer, box);
    const bands = e.pattern === 'bands', total = bands ? e.ray + e.smoke + e.breath : e.swing;
    const noise = new Float32Array(pw * ph);
    for (let i = 0; i < noise.length; i++) { noise[i] = env.rng() * 0.6 + (i % pw) * 0.045 + Math.floor(i / pw) * 0.02; }
    for (let i = 0; i < pw * ph; i++) { data.data[i * 4 + 3] = 255; }
    return function(ctx, u) {
      const d = data.data, breath = bands ? e.breath * Math.sin(TAU * 3 * u) : 0;
      for (let cy = 0; cy < ph; cy++) {
        for (let cx = 0; cx < pw; cx++) {
          let p;
          if (bands) {
            const x = box[0] + cx * cell, y = box[1] + cy * cell;
            const ray = 0.5 * Math.sin(TAU * (x / 86 + 2 * u)) + 0.5 * Math.sin(TAU * (x / 37 - 3 * u) + 1.3);
            const smoke = Math.sin(TAU * (y / 170 + x / 260 - 2 * u)) * Math.sin(TAU * (x / 140 + u) + 0.7);
            const dev = Math.round((e.ray * ray + e.smoke * smoke + breath) * 20) / 20;
            p = 0.5 + dev / (2 * total);
          } else {
            const s = Math.sin(TAU * (e.cycles * u - noise[cy * pw + cx]));
            p = s > 0.45 ? 1 : (s < -0.45 ? 0 : 0.5);
          }
          const g = Math.max(0, Math.min(255, Math.round(p * 255))), o = (cy * pw + cx) * 4;
          d[o] = g; d[o + 1] = g; d[o + 2] = g;
        }
      }
      pk.putImageData(data, 0, 0);
      wk.globalCompositeOperation = 'source-over'; wk.imageSmoothingEnabled = false;
      wk.drawImage(pat, 0, 0, pw, ph, 0, 0, pw * cell, ph * cell);
      wk.globalCompositeOperation = 'multiply'; wk.drawImage(layer, box[0], box[1], w, h, 0, 0, w, h);
      wk.globalCompositeOperation = 'destination-in'; wk.drawImage(layer, box[0], box[1], w, h, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = total; ctx.drawImage(dimmer, box[0], box[1]);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, 2 * total); ctx.drawImage(work, box[0], box[1]);
    };
  },

  // A layer that slowly glows and dims between min and max of its painted strength.
  breathe: function(e, env) {
    const layer = env.images[e.layer], box = e.box, w = box[2] - box[0], h = box[3] - box[1];
    const dimmer = backdropMotionDimmer(layer, box);
    return function(ctx, u) {
      const k = 0.5 - 0.5 * Math.cos(Math.PI * 2 * e.cycles * u);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - e.min; ctx.drawImage(dimmer, box[0], box[1]);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, k * (e.max - e.min));
      ctx.drawImage(layer, box[0], box[1], w, h, box[0], box[1], w, h);
    };
  },

  // Lit air: a small soft picture stretched over the whole backdrop.
  haze: function(e, env) {
    const layer = env.images[e.layer];
    return function(ctx, u) {
      ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = e.strength * (0.6 + 0.4 * Math.sin(Math.PI * 2 * 2 * u + 1));
      ctx.drawImage(layer, 0, 0, env.W, env.H);
      ctx.imageSmoothingEnabled = false;
    };
  },

  // Each candle lights the stone around it; the light flickers, so the shadows do.
  candles: function(e, env) {
    const R = e.reach, list = e.points.map(function(cd) {
      const x0 = Math.max(0, cd.x - R), y0 = Math.max(0, cd.y - R), w = Math.min(env.W, cd.x + R) - x0, h = Math.min(env.H, cd.y + R) - y0;
      const c = backdropMotionCanvas(w, h), k = c.getContext('2d');
      k.drawImage(env.still, x0, y0, w, h, 0, 0, w, h);
      k.save(); k.translate(cd.x - x0, cd.y - y0); k.scale(1, 0.8);
      const grad = k.createRadialGradient(0, 0, 0, 0, 0, R);
      for (let i = 0; i <= 8; i++) {
        const f = Math.pow(1 - i / 8, 2);
        grad.addColorStop(i / 8, 'rgb(' + Math.round(255 * f) + ',' + Math.round(158 * f) + ',' + Math.round(64 * f) + ')');
      }
      k.globalCompositeOperation = 'multiply'; k.fillStyle = grad; k.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
      k.restore();
      k.globalCompositeOperation = 'lighter'; k.globalAlpha = 0.125; k.fillStyle = '#E07A2A';
      for (let i = 4; i >= 1; i--) { k.beginPath(); k.arc(cd.x - x0, cd.y - y0, e.halo * i / 4, 0, Math.PI * 2); k.fill(); }
      const raw = [], tab = [];
      for (let i = 0; i < env.N; i++) raw.push(env.rng());
      for (let i = 0; i < env.N; i++) { tab.push(Math.max(0, Math.min(1, ((raw[i] + raw[(i + 1) % env.N]) / 2 - 0.2) * 1.7))); }
      for (let g = 0; g < 3; g++) { const at = Math.floor(env.rng() * env.N); for (let j = 0; j < 3; j++) tab[(at + j) % env.N] *= 0.25; }
      return { x0: x0, y0: y0, canvas: c, tab: tab, flames: cd.flames };
    });
    return function(ctx, u, frame) {
      ctx.globalCompositeOperation = 'lighter';
      list.forEach(function(cd) {
        ctx.globalAlpha = e.low + (e.high - e.low) * cd.tab[frame];
        ctx.drawImage(cd.canvas, cd.x0, cd.y0);
        if (cd.tab[frame] > 0.6) {
          ctx.globalAlpha = 0.9; ctx.fillStyle = e.tip;
          cd.flames.forEach(function(f) { ctx.fillRect(f[0] - 1, f[1] - e.unit - 1, e.unit, e.unit); });
        }
      });
    };
  },

  // Specks hanging in still air: faint everywhere, bright where litLayer says there is light.
  dust: function(e, env) {
    const TAU = Math.PI * 2, lit = env.images[e.litLayer], z = e.litZone, zw = z[2] - z[0], zh = z[3] - z[1];
    const work = backdropMotionCanvas(zw, zh), wk = work.getContext('2d'), sx = lit.naturalWidth / env.W, sy = lit.naturalHeight / env.H;
    const specks = [];
    for (let i = 0; i < e.count; i++) {
      const zone = i < e.count * 0.6 ? e.litZone : e.zone;
      specks.push({ x: zone[0] + env.rng() * (zone[2] - zone[0]), y: zone[1] + env.rng() * (zone[3] - zone[1]),
        ax: (0.4 + env.rng() * 0.6) * e.drift, ay: (0.3 + env.rng() * 0.5) * e.drift, bx: env.rng() * e.drift * 0.3,
        p: env.rng() * TAU, q: env.rng() * TAU, p2: env.rng() * TAU, tw: env.rng() * TAU, size: env.rng() > 0.8 ? e.unit + 1 : e.unit });
    }
    return function(ctx, u) {
      wk.globalCompositeOperation = 'source-over'; wk.clearRect(0, 0, zw, zh);
      ctx.globalCompositeOperation = 'lighter';
      specks.forEach(function(s) {
        const x = Math.round(s.x + s.ax * Math.sin(TAU * u + s.p) + s.bx * Math.sin(TAU * 2 * u + s.p2));
        const y = Math.round(s.y + s.ay * Math.sin(TAU * u + s.q)), tw = 0.65 + 0.35 * Math.sin(TAU * 2 * u + s.tw);
        ctx.globalAlpha = e.dark * tw; ctx.fillStyle = e.darkColour; ctx.fillRect(x, y, s.size, s.size);
        wk.globalAlpha = e.lit * tw; wk.fillStyle = e.litColour; wk.fillRect(x - z[0], y - z[1], s.size, s.size);
      });
      wk.globalAlpha = 1; wk.globalCompositeOperation = 'destination-in'; wk.imageSmoothingEnabled = true;
      wk.drawImage(lit, z[0] * sx, z[1] * sy, zw * sx, zh * sy, 0, 0, zw, zh);
      ctx.globalAlpha = 1; ctx.drawImage(work, z[0], z[1]);
    };
  },

  // Flakes falling and embers rising through a zone, each crossing it a whole
  // number of times per loop so the loop joins.
  ash: function(e, env) {
    const TAU = Math.PI * 2, z = e.zone, zw = z[2] - z[0], zh = z[3] - z[1], flakes = [];
    for (let i = 0; i < e.count + e.embers; i++) {
      const ember = i >= e.count;
      flakes.push({ ember: ember, x: z[0] + env.rng() * zw, y: env.rng() * zh, laps: ember ? -1 : (env.rng() > 0.7 ? 2 : 1),
        sway: (0.3 + env.rng() * 0.7) * e.sway, p: env.rng() * TAU, tw: env.rng() * TAU, size: env.rng() > 0.75 ? e.unit + 1 : e.unit });
    }
    return function(ctx, u) {
      flakes.forEach(function(f) {
        const y = z[1] + (((f.y + f.laps * zh * u) % zh) + zh) % zh, x = Math.round(f.x + f.sway * Math.sin(TAU * 2 * u + f.p));
        const edge = Math.min(1, (y - z[1]) / 40, (z[3] - y) / 40), tw = 0.6 + 0.4 * Math.sin(TAU * 3 * u + f.tw);
        ctx.globalCompositeOperation = f.ember ? 'lighter' : 'source-over';
        ctx.globalAlpha = Math.max(0, (f.ember ? e.emberStrength : e.strength) * edge * tw);
        ctx.fillStyle = f.ember ? e.emberColour : e.colour;
        ctx.fillRect(x, Math.round(y), f.size, f.size);
      });
    };
  },

  // For a backdrop that plays once, in the dark. The picture's own web of
  // light (the layer) hums faintly, then flares again and again; that light
  // is the only light, falling away from the source and the target, each
  // with its own weight. Then it is drawn back out of the target into the
  // source and goes out. Put it last in the effects list.
  unmake: function(e, env) {
    const W = env.W, H = env.H, Q = 4, web = env.images[e.layer];
    const mask = backdropMotionCanvas(Math.ceil(W / Q), Math.ceil(H / Q)), mk = mask.getContext('2d');
    const light = function(p, radius, level) {
      if (level <= 0.01) return;
      const g = mk.createRadialGradient(p[0] / Q, p[1] / Q, 0, p[0] / Q, p[1] / Q, radius / Q);
      const c = function(f) { const n = Math.round(255 * Math.min(1, level * f)); return 'rgb(' + n + ',' + n + ',' + n + ')'; };
      g.addColorStop(0, c(2)); g.addColorStop(0.3, c(1.1)); g.addColorStop(0.65, c(0.45)); g.addColorStop(1, '#000');
      mk.fillStyle = g; mk.fillRect(0, 0, mask.width, mask.height);
    };
    const glow = function(ctx, p, radius, alpha, inner) {
      if (alpha <= 0.01) return;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], radius);
      g.addColorStop(0, inner); g.addColorStop(0.3, e.colour); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = Math.min(1, alpha); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    return function(ctx, u, frame, ms) {
      const rng = backdropMotionRng(frame * 13 + 5), flicker = 0.7 + 0.3 * rng();
      let level = 0, hit = false;
      e.strikes.forEach(function(st) {
        if (ms < st[0]) return;
        level = Math.max(level, st[1] * Math.exp(-(ms - st[0]) / st[2]));
        if (ms - st[0] < 1000 / env.fps) hit = true;
      });
      const wake = Math.max(0, Math.min(1, (ms - e.wakeFrom) / (e.strikes[0][0] - e.wakeFrom)));
      const drain = ms > e.drainFrom ? Math.max(0, 1 - (ms - e.drainFrom) / (e.drainTo - e.drainFrom)) : 1;
      const hum = e.hum * wake * flicker * drain;
      const atTarget = (Math.max(level, hum) * (ms > e.drainFrom ? Math.pow(drain, 2) : 1)) * e.weights[0];
      const fed = ms > e.drainFrom ? Math.sin(Math.PI * Math.min(1, (ms - e.drainFrom) / (e.drainTo + 600 - e.drainFrom))) : 0;
      const atSource = Math.max(level, hum, fed * 0.6) * e.weights[1];
      if (level > 0.5) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(ctx.canvas, (frame % 2 ? 1 : -1) * e.shake * level, (frame % 3 ? -1 : 1) * e.shake * 0.6 * level); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, 0.55 * flicker + level); ctx.drawImage(web, 0, 0);
      if (level > 0.4) { ctx.globalAlpha = Math.min(1, level); ctx.drawImage(web, 0, 0); ctx.drawImage(web, 0, 0); }
      mk.globalCompositeOperation = 'source-over'; mk.fillStyle = '#000'; mk.fillRect(0, 0, mask.width, mask.height);
      mk.globalCompositeOperation = 'lighter';
      light(e.target, e.reach * e.spread[0] * (0.35 + 0.65 * Math.min(1, atTarget)), atTarget);
      light(e.source, e.reach * e.spread[1] * (0.35 + 0.65 * Math.min(1, atSource)), atSource);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mask, 0, 0, W, H); ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, e.target, e.reach * 0.45 * e.spread[0] * (0.3 + atTarget), atTarget * 0.45 * e.glare[0], e.core);
      glow(ctx, e.source, e.reach * 0.45 * e.spread[1] * (0.3 + atSource), atSource * 0.45 * e.glare[1], e.colour);
      if (hit) { ctx.globalAlpha = 0.08; ctx.fillStyle = e.core; ctx.fillRect(0, 0, W, H); }
    };
  },

  // Small crosses that flare and go, perLoop times each loop per point.
  glints: function(e, env) {
    const list = e.points.map(function(p) {
      const times = [];
      for (let i = 0; i < e.perLoop; i++) times.push(env.rng() * env.loopMs);
      return { x: p[0], y: p[1], times: times };
    });
    return function(ctx, u, frame, ms) {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9;
      list.forEach(function(g) {
        g.times.forEach(function(t0) {
          const a = ((ms - t0) % env.loopMs + env.loopMs) % env.loopMs;
          if (a > e.ms) return;
          const f = a / e.ms;
          backdropMotionCross(ctx, g.x, g.y, e.unit, e.core, e.arm, e.tip, f < 0.33 ? 1 : (f < 0.66 ? 2 : 1));
        });
      });
    };
  },

  // Lava bubbles: dot, dome, ring, pop.
  bubbles: function(e, env) {
    const list = e.points.map(function(p) { return { x: p[0], y: p[1], big: p[2] === 1, t0: env.rng() * env.loopMs }; });
    return function(ctx, u, frame, ms) {
      const U = e.unit;
      const px = function(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      list.forEach(function(b) {
        const a = ((ms - b.t0) % env.loopMs + env.loopMs) % env.loopMs;
        if (a > e.ms) return;
        const f = a / e.ms, x = b.x, y = b.y, w = b.big ? 2 : 1;
        if (f < 0.25) { px(x, y, U, U, e.mid); }
        else if (f < 0.5) { px(x - U, y, 3 * U, U, e.mid); px(x, y - U, U, U, e.hi); }
        else if (f < 0.75) { px(x - w * U, y, (2 * w + 1) * U, U, e.dark); px(x - w * U, y - U, U, U, e.mid); px(x + w * U, y - U, U, U, e.mid); px(x - (w - 1) * U, y - 2 * U, (2 * w - 1) * U, U, e.hi); }
        else { px(x - 2 * U, y - U, U, U, e.hi); px(x + 2 * U, y - U, U, U, e.hi); px(x, y - 3 * U, U, U, e.hi); px(x - U, y, 3 * U, U, e.dark); }
      });
    };
  },

  // Dim lights that swell and die, each point out of step with the last.
  pulses: function(e, env) {
    return function(ctx, u) {
      ctx.globalCompositeOperation = 'source-over';
      e.points.forEach(function(p, n) {
        const a = Math.pow(Math.max(0, Math.sin(Math.PI * 2 * (e.cycles * u + n * 0.37))), 6);
        if (a < 0.03) return;
        ctx.globalAlpha = a * 0.9;
        backdropMotionCross(ctx, p[0], p[1], e.unit, e.core, e.arm, '', 1);
      });
    };
  }
};

function backdropMotionDraw(entry, ms) {
  const frames = entry.frames, step = Math.floor(ms / (1000 / entry.def.fps));
  const frame = entry.def.once ? Math.min(frames - 1, step) : step % frames;
  if (frame === entry.lastFrame) return;
  entry.lastFrame = frame;
  const ctx = entry.ctx;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(entry.still, 0, 0);
  entry.draws.forEach(function(draw) { draw(ctx, frame / frames, frame, frame * (1000 / entry.def.fps)); });
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

function backdropMotionTick(now) {
  const M = BACKDROP_MOTION;
  M.raf = 0;
  let any = false;
  M.live.forEach(function(entry) {
    if (!entry.draws) return;
    any = true;
    if (entry.canvas.getClientRects().length > 0) backdropMotionDraw(entry, now - entry.t0);
  });
  if (any && !backdropMotionAutomated('motion')) M.raf = requestAnimationFrame(backdropMotionTick);
}

// Plays backdrop <name> on canvas. onReady() once the first frame is drawn;
// onFail() if the motion file or any picture it names is missing.
function backdropMotionStart(name, canvas, onReady, onFail) {
  const M = BACKDROP_MOTION;
  backdropMotionStop(canvas);
  const entry = { name: name, canvas: canvas, draws: null, lastFrame: -1 };
  M.live.push(entry);
  const alive = function() { return M.live.indexOf(entry) !== -1; };
  const fail = function() { if (alive()) { backdropMotionStop(canvas); if (onFail) onFail(); } };
  backdropMotionLoadDef(name, function(def) {
    if (!alive()) return;
    if (!def) { fail(); return; }
    const paths = [def.still];
    def.effects.forEach(function(e) { [e.layer, e.litLayer].forEach(function(p) { if (p && paths.indexOf(p) === -1) paths.push(p); }); });
    backdropMotionLoadImages(paths, function(ok) {
      if (!alive()) return;
      if (!ok) { fail(); return; }
      const still = M.images[def.still], W = still.naturalWidth, H = still.naturalHeight;
      canvas.width = W; canvas.height = H;
      entry.def = def; entry.still = still; entry.ctx = canvas.getContext('2d');
      entry.frames = Math.round(def.loopMs / 1000 * def.fps);
      const draws = [];
      def.effects.forEach(function(e, i) {
        const make = BACKDROP_MOTION_EFFECTS[e.type];
        if (make) draws.push(make(e, { W: W, H: H, N: entry.frames, fps: def.fps, loopMs: def.loopMs, still: still, images: M.images, rng: backdropMotionRng(11 + i) }));
      });
      entry.draws = draws; entry.t0 = performance.now();
      backdropMotionDraw(entry, 0);
      if (onReady) onReady();
      if (!M.raf && !backdropMotionAutomated('motion')) { M.raf = requestAnimationFrame(backdropMotionTick); }
    });
  });
}

function backdropMotionStop(canvas) {
  const M = BACKDROP_MOTION;
  M.live = M.live.filter(function(entry) { return entry.canvas !== canvas; });
}

// ---------- TITLE SCREEN ----------

// Shown once per page load, over everything; the run underneath has already
// started on the map, so Start only lifts the cover. The still shows first
// and the moving canvas takes over once its files are in.
function titleScreenOpen() {
  if (backdropMotionAutomated('title')) return;
  const screen = document.getElementById('titleScreen'), canvas = document.getElementById('titleCanvas'), img = document.getElementById('titleStillImg');
  screen.style.display = 'flex';
  img.onerror = function() { img.style.display = 'none'; };
  img.src = 'art/background_title.png?v=' + GAME_CONFIG.BUILD;
  backdropMotionStart('title', canvas, function() { canvas.style.display = 'block'; img.style.display = 'none'; }, function() { canvas.style.display = 'none'; });
}

function titleScreenClose() {
  document.getElementById('titleScreen').style.display = 'none';
  backdropMotionStop(document.getElementById('titleCanvas'));
}

// ---------- END SCREENS ----------

// Opened by the phase machine when the run is won or lost, over everything.
// A win shows the victory backdrop; a loss plays the defeat backdrop of the
// act it happened in, once. The word and the buttons wait until the picture
// has had its say; with no picture they show at once on black.
function endScreenOpen(outcome) {
  if (backdropMotionAutomated('endscreen')) return;
  const M = BACKDROP_MOTION, won = outcome === 'won';
  const screen = document.getElementById('endScreen'), canvas = document.getElementById('endCanvas');
  const reveal = function() { screen.classList.add('end-ready'); };
  document.getElementById('endWord').textContent = won ? '' : 'DEFEAT';
  screen.classList.remove('end-ready');
  canvas.style.display = 'none';
  screen.style.display = 'block';
  clearTimeout(M.endTimer);
  backdropMotionStart(won ? 'victory' : 'defeat' + gameState.run.actNumber, canvas, function() {
    canvas.style.display = 'block';
    M.endTimer = setTimeout(reveal, won ? 1500 : 6000);
  }, reveal);
}

function endScreenClose() {
  clearTimeout(BACKDROP_MOTION.endTimer);
  document.getElementById('endScreen').style.display = 'none';
  backdropMotionStop(document.getElementById('endCanvas'));
}
