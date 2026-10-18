/* signal-bg.js: "signal emerging from noise" full-screen animated background.
 *
 * A field of flickering pixel noise, scanlines and drifting hex/binary glyphs, with a
 * right-angled circuit network on top. Nodes fire at random; pulses run along the paths,
 * sometimes cascading, and the noise around each pulse briefly falls into an ordered
 * pattern (grid, bit sequence or waveform) before decaying back to noise.
 *
 * Usage: <script src="./signal-bg.js"></script> as the first thing in <body>.
 * Colours come from the CSS tokens in style.css (--ink, --white, --blue); the pulse
 * glow on the dark theme is --blue mixed with --white. It adds `signal-bg-on` and
 * `signal-bg--dark` / `signal-bg--light` to <html> so the page can restyle itself.
 */
(function () {
  'use strict';

  // ---- tunables ---------------------------------------------------------------
  var CONFIG = {
    theme: 'dark',              // 'dark': --ink field, light marks. 'light': --white field, dark marks
    opacity: 1,                 // master multiplier for everything drawn over the field

    gridSize: 48,               // CSS px between circuit grid lines; nodes sit on intersections
    nodeCount: 44,
    linksPerNode: 2,            // nearest neighbours each node is wired to
    fireInterval: [0.5, 2],     // seconds between spontaneous fires, random within the range
    cascadeChance: 0.45,        // chance an arriving pulse fires the next node onward
    cascadeDepth: 3,            // max hops in one cascade
    maxPulses: 40,
    pulseSpeed: 280,            // CSS px per second along the paths
    pulseTail: 80,              // CSS px
    pulseAlpha: 0.95,
    pathAlpha: 0.08,
    nodeAlpha: 0.22,

    noiseCell: 3,               // CSS px per noise "pixel"
    noiseDensity: 0.07,         // share of noise pixels lit
    noiseFlicker: 0.05,         // share of noise pixels re-rolled each frame
    noiseAlpha: 0.15,           // alpha of a lit noise pixel
    maxNoisePixels: 220000,     // noise cells are enlarged on huge screens to stay under this
    orderAlpha: 0.5,            // alpha of the ordered pattern at full calm
    calmRadius: 70,             // CSS px around a pulse head where noise turns ordered
    calmDecay: 1.2,             // per second; higher returns to noise faster

    scanlineAlpha: 0.035,       // static horizontal lines
    scanRollAlpha: 0.025,       // slow rolling band
    glyphCount: 36,
    glyphAlpha: 0.11,
    glyphSpeed: 9,              // CSS px per second, drifting upward
    glyphSize: 11,              // CSS px

    heroSelector: '#logo, .dict, .tagline, .lede',  // text to keep clear of nodes and quiet behind
    heroPad: 32,                // CSS px around the hero text
    heroDim: 0.25,              // noise and glyph strength behind the hero text
    heroFeather: 110,           // CSS px over which that quieting fades out

    maxDpr: 2,
    mobileBreakpoint: 720,      // below this width the overrides apply
    mobile: {
      gridSize: 40,
      nodeCount: 16,
      noiseCell: 4,
      noiseDensity: 0.045,
      noiseAlpha: 0.12,
      glyphCount: 12,
      calmRadius: 52,
      pulseTail: 60
    }
  };
  // -------------------------------------------------------------------------------

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  root.classList.add('signal-bg-on', 'signal-bg--' + CONFIG.theme);

  var canvas = document.createElement('canvas');
  canvas.className = 'signal-bg';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block';
  var ctx = canvas.getContext('2d');

  var C, W, H, dpr, colors, font;
  var layer, lctx;                                   // static: scanlines, paths, node pads
  var ncv, nctx, nimg, nbuf, nw, nh, cell;           // low-res noise
  var lit, calm, pat, mask;                          // mask: per-cell hero quieting, 0..1
  var nodes = [], edges = [], pulses = [], glyphs = [];
  var hero = null, nextFire = 0, last = 0, roll = 0, raf = 0;

  // ---- colour helpers --------------------------------------------------------------
  function token(name, fallback) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  function packed(c) { return (c[2] << 16) | (c[1] << 8) | c[0]; }   // little-endian ABGR, alpha added later

  function readColors() {
    var ink = hexToRgb(token('--ink', '#111111'));
    var white = hexToRgb(token('--white', '#ffffff'));
    var blue = hexToRgb(token('--blue', '#153894'));
    var dark = CONFIG.theme === 'dark';
    colors = {
      field: dark ? ink : white,
      mark: dark ? white : ink,                       // noise, paths, glyphs
      pulse: dark ? mix(blue, white, 0.5) : blue,     // glow derived from --blue
      head: dark ? white : blue
    };
    colors.markP = packed(colors.mark);
    colors.pulseP = packed(colors.pulse);
    font = token('--font-mono', 'monospace');
  }

  // ---- geometry ----------------------------------------------------------------------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  function heroRect() {
    var els = document.querySelectorAll(C.heroSelector), r = null;
    var range = document.createRange();
    for (var i = 0; i < els.length; i++) {
      range.selectNodeContents(els[i]);
      var b = range.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) }
            : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    }
    if (!r) return null;
    return { l: r.l - C.heroPad, t: r.t - C.heroPad, r: r.r + C.heroPad, b: r.b + C.heroPad };
  }
  function inHero(x, y) { return hero && x > hero.l && x < hero.r && y > hero.t && y < hero.b; }
  // strength multiplier at (x, y): heroDim inside the hero box, easing back to 1 across heroFeather
  function heroFactor(x, y) {
    if (!hero) return 1;
    var dx = Math.max(hero.l - x, 0, x - hero.r), dy = Math.max(hero.t - y, 0, y - hero.b);
    var f = Math.min(1, Math.sqrt(dx * dx + dy * dy) / C.heroFeather);
    f = f * f * (3 - 2 * f);
    return C.heroDim + (1 - C.heroDim) * f;
  }
  function buildMask() {
    if (!mask) return;
    for (var y = 0, i = 0; y < nh; y++) for (var x = 0; x < nw; x++, i++) mask[i] = heroFactor((x + 0.5) * cell, (y + 0.5) * cell);
  }
  function segHitsHero(x1, y1, x2, y2) {
    if (!hero) return false;
    return Math.max(x1, x2) > hero.l && Math.min(x1, x2) < hero.r &&
           Math.max(y1, y2) > hero.t && Math.min(y1, y2) < hero.b;
  }

  function buildNetwork() {
    nodes = []; edges = []; pulses = [];
    var g = C.gridSize, cols = Math.floor(W / g), rows = Math.floor(H / g), spots = [];
    for (var cx = 1; cx < cols; cx++) for (var cy = 1; cy < rows; cy++) {
      var x = cx * g, y = cy * g;
      if (!inHero(x, y)) spots.push([x, y]);
    }
    for (var i = spots.length - 1; i > 0; i--) {         // shuffle, take the first N
      var j = (Math.random() * (i + 1)) | 0, t = spots[i]; spots[i] = spots[j]; spots[j] = t;
    }
    spots.slice(0, C.nodeCount).forEach(function (s) { nodes.push({ x: s[0], y: s[1], flash: 0, edges: [] }); });

    var seen = {};
    nodes.forEach(function (a, ai) {
      var near = nodes.map(function (b, bi) { return { b: b, bi: bi, d: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) }; })
        .filter(function (o) { return o.bi !== ai; })
        .sort(function (p, q) { return p.d - q.d; })
        .slice(0, C.linksPerNode);
      near.forEach(function (o) {
        var key = Math.min(ai, o.bi) + ':' + Math.max(ai, o.bi), b = o.b;
        if (seen[key]) return;
        // right-angled path: try both elbows, keep one that stays out of the hero area
        var elbows = Math.random() < 0.5 ? [[b.x, a.y], [a.x, b.y]] : [[a.x, b.y], [b.x, a.y]];
        for (var k = 0; k < 2; k++) {
          var e = elbows[k];
          if (segHitsHero(a.x, a.y, e[0], e[1]) || segHitsHero(e[0], e[1], b.x, b.y)) continue;
          var l1 = Math.abs(e[0] - a.x) + Math.abs(e[1] - a.y), l2 = Math.abs(b.x - e[0]) + Math.abs(b.y - e[1]);
          var edge = { a: a, b: b, p: [[a.x, a.y], e, [b.x, b.y]], l1: l1, len: l1 + l2 };
          edges.push(edge); a.edges.push(edge); b.edges.push(edge);
          seen[key] = true;
          break;
        }
      });
    });
  }

  // point at distance d along an edge, travelling a->b (rev: b->a)
  function pointAt(e, d, rev) {
    if (rev) d = e.len - d;
    d = Math.max(0, Math.min(e.len, d));
    var p0 = e.p[0], p1 = e.p[1], p2 = e.p[2], t;
    if (d <= e.l1) { t = e.l1 ? d / e.l1 : 0; return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]; }
    var l2 = e.len - e.l1; t = l2 ? (d - e.l1) / l2 : 0;
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  }

  // ---- layers ------------------------------------------------------------------------
  function buildLayer() {
    layer = document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    lctx = layer.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    lctx.fillStyle = rgba(colors.mark, C.scanlineAlpha * C.opacity);
    for (var y = 0; y < H; y += 3) lctx.fillRect(0, y, W, 1);

    lctx.strokeStyle = rgba(colors.mark, C.pathAlpha * C.opacity);
    lctx.lineWidth = 1;
    lctx.beginPath();
    edges.forEach(function (e) {
      lctx.moveTo(e.p[0][0] + 0.5, e.p[0][1] + 0.5);
      lctx.lineTo(e.p[1][0] + 0.5, e.p[1][1] + 0.5);
      lctx.lineTo(e.p[2][0] + 0.5, e.p[2][1] + 0.5);
    });
    lctx.stroke();

    lctx.fillStyle = rgba(colors.mark, C.pathAlpha * 1.6 * C.opacity);     // vias at the elbows
    edges.forEach(function (e) { lctx.fillRect(e.p[1][0] - 1, e.p[1][1] - 1, 3, 3); });
    lctx.fillStyle = rgba(colors.mark, C.nodeAlpha * C.opacity);           // node pads
    nodes.forEach(function (n) { lctx.fillRect(n.x - 2, n.y - 2, 5, 5); });
  }

  function buildNoise() {
    cell = C.noiseCell;
    while (Math.ceil(W / cell) * Math.ceil(H / cell) > C.maxNoisePixels) cell++;
    nw = Math.ceil(W / cell); nh = Math.ceil(H / cell);
    ncv = document.createElement('canvas'); ncv.width = nw; ncv.height = nh;
    nctx = ncv.getContext('2d');
    nimg = nctx.createImageData(nw, nh);
    nbuf = new Uint32Array(nimg.data.buffer);
    lit = new Uint8Array(nw * nh); calm = new Float32Array(nw * nh); pat = new Uint8Array(nw * nh);
    mask = new Float32Array(nw * nh);
    buildMask();
    for (var i = 0; i < lit.length; i++) lit[i] = Math.random() < C.noiseDensity ? 1 : 0;
  }

  var GLYPHS = ['0x', '01', '10', 'FF', 'A3', '7E', '00', '1F', 'C0', '4B'];
  function glyphText() {
    if (Math.random() < 0.5) {
      var s = ''; for (var i = 0; i < 8; i++) s += Math.random() < 0.5 ? '0' : '1'; return s;
    }
    var n = 2 + ((Math.random() * 3) | 0), out = [];
    for (var k = 0; k < n; k++) out.push(Math.random() < 0.3 ? pick(GLYPHS) : ((Math.random() * 256) | 0).toString(16).toUpperCase().padStart(2, '0'));
    return out.join(' ');
  }
  function buildGlyphs() {
    glyphs = [];
    for (var i = 0; i < C.glyphCount; i++) glyphs.push({ x: rand(0, W), y: rand(0, H), t: glyphText(), v: rand(0.6, 1.4) });
  }

  // ---- behaviour -----------------------------------------------------------------------
  function fire(node, depth, via) {
    node.flash = 1;
    var p = (Math.random() * 3) | 0;
    node.edges.forEach(function (e) {
      if (e === via || pulses.length >= C.maxPulses) return;
      pulses.push({ e: e, rev: e.b === node, d: 0, depth: depth, pat: p, to: e.b === node ? e.a : e.b });
    });
  }

  // noise cells near (x, y) fall into ordered pattern p
  function stampCalm(x, y, p) {
    var r = C.calmRadius / cell, cx = x / cell, cy = y / cell;
    var x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(nw - 1, Math.ceil(cx + r));
    var y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(nh - 1, Math.ceil(cy + r));
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
      var dx = xx - cx, dy = yy - cy, q = 1 - (dx * dx + dy * dy) / (r * r);
      if (q <= 0) continue;
      var i = yy * nw + xx;
      if (q > calm[i]) { calm[i] = q; pat[i] = p; }
    }
  }

  // the ordered states: aligned grid, regular bit sequence, clean waveform
  function ordered(p, x, y) {
    if (p === 0) return x % 4 === 0 && y % 4 === 0;
    if (p === 1) return y % 3 === 0 && ((x >> 1) & 1) === 0;
    var w = (y + 2.5 * Math.sin(x * 0.32)) % 9;
    if (w < 0) w += 9;
    return w < 1;
  }

  function updateNoise(dt) {
    var n = lit.length, flips = (n * C.noiseFlicker) | 0, dens = C.noiseDensity;
    for (var f = 0; f < flips; f++) lit[(Math.random() * n) | 0] = Math.random() < dens ? 1 : 0;

    var decay = C.calmDecay * dt, noiseA = C.noiseAlpha * C.opacity, ordA = C.orderAlpha * C.opacity;
    var mP = colors.markP, pP = colors.pulseP;
    var i = 0;
    for (var y = 0; y < nh; y++) {
      for (var x = 0; x < nw; x++, i++) {
        var c = calm[i], a, col = mP;
        if (c > 0) { c -= decay; if (c < 0) c = 0; calm[i] = c; }
        if (c > 0.02) {
          if (ordered(pat[i], x, y)) { a = c * ordA; col = pP; }
          else a = lit[i] ? noiseA * (1 - c) : 0;
        } else a = lit[i] ? noiseA : 0;
        a *= mask[i];
        nbuf[i] = a > 0.004 ? (col | (((a * 255) | 0) << 24)) : 0;
      }
    }
    nctx.putImageData(nimg, 0, 0);
  }

  function strokeSpan(e, rev, d0, d1, color, width) {
    if (d1 <= d0) return;
    var elbow = rev ? e.len - e.l1 : e.l1, a = pointAt(e, d0, rev), b = pointAt(e, d1, rev);
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a[0] + 0.5, a[1] + 0.5);
    if (elbow > d0 && elbow < d1) { var m = e.p[1]; ctx.lineTo(m[0] + 0.5, m[1] + 0.5); }
    ctx.lineTo(b[0] + 0.5, b[1] + 0.5); ctx.stroke();
  }

  function step(dt) {
    if (dt > 0) {
      nextFire -= dt;
      if (nextFire <= 0 && nodes.length) { fire(pick(nodes), 0, null); nextFire = rand(C.fireInterval[0], C.fireInterval[1]); }
    }
    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      p.d += C.pulseSpeed * dt;
      var h = pointAt(p.e, p.d, p.rev);
      stampCalm(h[0], h[1], p.pat);
      if (p.d >= p.e.len) {
        pulses.splice(i, 1);
        p.to.flash = 1;
        if (p.depth < C.cascadeDepth && Math.random() < C.cascadeChance) fire(p.to, p.depth + 1, p.e);
      }
    }
    updateNoise(dt);
  }

  function render(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgba(colors.field, 1);
    ctx.fillRect(0, 0, W, H);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ncv, 0, 0, nw * cell, nh * cell);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (C.scanRollAlpha > 0) {                          // slow rolling band
      roll = (roll + dt * 40) % (H + 160);
      ctx.fillStyle = rgba(colors.mark, C.scanRollAlpha * C.opacity);
      ctx.fillRect(0, roll - 160, W, 160);
    }

    ctx.font = C.glyphSize + 'px ' + font;
    ctx.textBaseline = 'top';
    glyphs.forEach(function (g) {
      g.y -= C.glyphSpeed * g.v * dt;
      if (g.y < -20) { g.y = H + rand(0, 40); g.x = rand(0, W); g.t = glyphText(); }
      else if (Math.random() < dt * 0.15) g.t = glyphText();
      ctx.fillStyle = rgba(colors.mark, C.glyphAlpha * C.opacity * heroFactor(g.x, g.y));
      ctx.fillText(g.t, g.x, g.y);
    });

    nodes.forEach(function (n) {
      if (n.flash <= 0) return;
      var s = 5 + 8 * n.flash;
      ctx.fillStyle = rgba(colors.pulse, 0.35 * n.flash * C.opacity);
      ctx.fillRect(n.x - s / 2 + 0.5, n.y - s / 2 + 0.5, s, s);
      ctx.fillStyle = rgba(colors.head, n.flash * C.pulseAlpha * C.opacity);
      ctx.fillRect(n.x - 2, n.y - 2, 5, 5);
      n.flash = Math.max(0, n.flash - dt * 1.8);
    });

    ctx.lineCap = 'square';
    pulses.forEach(function (p) {
      var d = p.d, t = C.pulseTail, o = C.opacity;
      strokeSpan(p.e, p.rev, Math.max(0, d - t), d, rgba(colors.pulse, 0.16 * o), 4);   // soft glow
      for (var k = 0; k < 4; k++) {                                                     // tail, brightening to the head
        strokeSpan(p.e, p.rev, Math.max(0, d - t + (t / 4) * k), Math.max(0, d - t + (t / 4) * (k + 1)),
          rgba(colors.pulse, C.pulseAlpha * o * (k + 1) / 4), 1.5);
      }
      var h = pointAt(p.e, d, p.rev);
      ctx.fillStyle = rgba(colors.head, C.pulseAlpha * o);
      ctx.fillRect(h[0] - 1, h[1] - 1, 3, 3);
    });
  }

  // ---- lifecycle -----------------------------------------------------------------------
  function configure() {
    C = {};
    for (var k in CONFIG) C[k] = CONFIG[k];
    if (window.innerWidth < CONFIG.mobileBreakpoint) for (var m in CONFIG.mobile) C[m] = CONFIG.mobile[m];
  }

  function build() {
    configure();
    readColors();
    dpr = Math.min(window.devicePixelRatio || 1, C.maxDpr);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    hero = heroRect();
    buildNetwork();
    buildLayer();
    buildNoise();
    buildGlyphs();
    nextFire = rand(0.2, 0.8);

    if (reduced) {
      // static frame: two pulses caught mid-path, with the noise ordered around them
      for (var i = 0; i < 2 && nodes.length; i++) {
        var n = pick(nodes);
        fire(n, C.cascadeDepth, null);
      }
      pulses.forEach(function (p) { p.d = p.e.len * 0.6; });
      for (var j = 0; j < pulses.length; j++) {
        var p = pulses[j];
        for (var s = 0; s <= p.d; s += cell * 2) { var h = pointAt(p.e, s, p.rev); stampCalm(h[0], h[1], p.pat); }
      }
      updateNoise(0);
      render(0);
    }
  }

  function frame(t) {
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    step(dt);
    render(dt);
    raf = requestAnimationFrame(frame);
  }

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  }

  function start() {
    document.body.insertBefore(canvas, document.body.firstChild);
    build();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', function () { hero = heroRect(); buildMask(); }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
