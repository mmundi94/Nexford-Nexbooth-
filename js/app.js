/* Nexbooth: the Nexford holiday photo booth.
   Everything runs in the browser. Photos never leave the device. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const YEAR = new Date().getFullYear();
  const DATE_LABEL = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

  function seeded(seed) { // small repeatable random generator, so frames look the same every time
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ---------------------------------------------------------------------------
  // Artwork (SVG strings from assets.js, turned into same-origin blob URLs)
  // ---------------------------------------------------------------------------
  const ASSETS = window.NEXBOOTH_ASSETS || { alpacas: [], props: [] };
  const art = {};
  const svgUrl = (svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  ASSETS.alpacas.forEach((a) => (art[a.id] = { ...a, kind: 'alpaca', url: svgUrl(a.svg) }));
  ASSETS.props.forEach((a) => (art[a.id] = { ...a, kind: 'prop', url: svgUrl(a.svg) }));
  if (ASSETS.logo) art.logo = { id: 'logo', url: svgUrl(ASSETS.logo) };
  const imgCache = new Map();
  function getImg(id) {
    if (!imgCache.has(id)) imgCache.set(id, loadImage(art[id].url));
    return imgCache.get(id);
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const S = {
    stream: null,
    facing: 'user',
    source: 'none',          // 'camera' | 'image'
    mode: 'single',          // 'single' | 'strip'
    frame: 'lights',
    filter: 'natural',
    fx: { snow: true, bokeh: false, twinkle: false },
    stickers: [],
    sel: null,
    busy: false,
    sound: true,
    bubbleStyle: 0,
    shots: [],
    portrait: false,
    nextSide: 1,
  };

  const el = {
    welcome: $('#welcome'), booth: $('#booth'), stage: $('#stage'), video: $('#video'), still: $('#still'),
    fx: $('#fxCanvas'), frame: $('#frameCanvas'), stickers: $('#stickers'), countdown: $('#countdown'),
    flash: $('#flash'), hint: $('#stageHint'), shutter: $('#shutterBtn'), camError: $('#camError'),
    result: $('#result'), resultImg: $('#resultImg'), download: $('#downloadBtn'), share: $('#shareBtn'),
    gallery: $('#gallery'), stripProgress: $('#stripProgress'),
  };
  // color tint layer (used by some filters), sits right above the photo
  const tintLayer = document.createElement('div');
  tintLayer.className = 'layer';
  el.fx.before(tintLayer);

  // ---------------------------------------------------------------------------
  // Sound (tiny beeps made with WebAudio, no files needed)
  // ---------------------------------------------------------------------------
  let audio = null;
  function beep(freq = 880, dur = 0.09, type = 'sine', vol = 0.08) {
    if (!S.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* sound is optional */ }
  }
  function shutterSound() {
    if (!S.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const len = audio.sampleRate * 0.12, buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = audio.createBufferSource(), g = audio.createGain();
      g.gain.value = 0.25; src.buffer = buf; src.connect(g).connect(audio.destination); src.start();
    } catch (e) { /* optional */ }
  }

  // ---------------------------------------------------------------------------
  // Filters (same math for the live preview and the saved photo)
  // ---------------------------------------------------------------------------
  const FILTERS = [
    { id: 'natural', name: 'Natural', ops: [] },
    { id: 'warm', name: 'Warm glow', ops: [['sepia', 0.2], ['saturate', 1.3], ['brightness', 1.06]] },
    { id: 'gold', name: 'Nexford gold', ops: [['sepia', 0.38], ['saturate', 1.65], ['hue-rotate', -8], ['brightness', 1.05]] },
    { id: 'frosty', name: 'Frosty', ops: [['saturate', 0.8], ['brightness', 1.07]], tint: { color: '#7DB4FF', alpha: 0.38, blend: 'soft-light' } },
    { id: 'candle', name: 'Candlelight', ops: [['contrast', 1.05], ['brightness', 1.03]], tint: { color: '#FF9440', alpha: 0.32, blend: 'soft-light' } },
    { id: 'vintage', name: 'Vintage', ops: [['sepia', 0.45], ['contrast', 1.08], ['saturate', 0.9]] },
    { id: 'pop', name: 'Party pop', ops: [['saturate', 1.55], ['contrast', 1.12]] },
    { id: 'silent', name: 'Silent night', ops: [['grayscale', 1], ['contrast', 1.15], ['brightness', 1.04]] },
  ];
  const filterById = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];
  const cssFilter = (ops) => ops.map(([n, v]) => (n === 'hue-rotate' ? `hue-rotate(${v}deg)` : `${n}(${v})`)).join(' ') || 'none';

  // 3x4 color matrices from the CSS Filter Effects spec
  function opMatrix([name, a]) {
    const s = 1 - a;
    switch (name) {
      case 'grayscale': return [0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0,
        0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0,
        0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s, 0];
      case 'sepia': return [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0,
        0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0,
        0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0];
      case 'saturate': return [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0,
        0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0,
        0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0];
      case 'hue-rotate': {
        const r = (a * Math.PI) / 180, c = Math.cos(r), n = Math.sin(r);
        return [0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928, 0,
          0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283, 0,
          0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072, 0];
      }
      case 'brightness': return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
      case 'contrast': { const o = (0.5 - 0.5 * a) * 255; return [a, 0, 0, o, 0, a, 0, o, 0, 0, a, o]; }
      default: return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    }
  }
  function applyFilter(ctx, W, H, f) {
    if (f.ops.length) {
      const mats = f.ops.map(opMatrix);
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        for (let k = 0; k < mats.length; k++) {
          const m = mats[k];
          const nr = m[0] * r + m[1] * g + m[2] * b + m[3];
          const ng = m[4] * r + m[5] * g + m[6] * b + m[7];
          const nb = m[8] * r + m[9] * g + m[10] * b + m[11];
          r = nr < 0 ? 0 : nr > 255 ? 255 : nr;
          g = ng < 0 ? 0 : ng > 255 ? 255 : ng;
          b = nb < 0 ? 0 : nb > 255 ? 255 : nb;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
      ctx.putImageData(img, 0, 0);
    }
    if (f.tint) {
      ctx.save();
      ctx.globalCompositeOperation = f.tint.blend;
      ctx.globalAlpha = f.tint.alpha;
      ctx.fillStyle = f.tint.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  function setFilter(id) {
    S.filter = id;
    const f = filterById(id);
    el.video.style.filter = cssFilter(f.ops);
    el.still.style.filter = cssFilter(f.ops);
    tintLayer.style.background = f.tint ? f.tint.color : 'transparent';
    tintLayer.style.opacity = f.tint ? f.tint.alpha : 0;
    tintLayer.style.mixBlendMode = f.tint ? f.tint.blend : 'normal';
    $$('#filterGrid .choice').forEach((b) => b.classList.toggle('is-on', b.dataset.id === id));
  }

  // ---------------------------------------------------------------------------
  // Live effects: snow, fairy lights, twinkles
  // ---------------------------------------------------------------------------
  const rnd = seeded(2026);
  const snow = Array.from({ length: 140 }, () => ({ x: rnd(), y: rnd(), r: 0.3 + rnd() * 0.9, sp: 0.04 + rnd() * 0.06, ph: rnd() * 6.28 }));
  const BOKEH_COLORS = ['255,199,44', '226,59,59', '120,220,140', '255,150,80', '140,200,255'];
  const bokeh = Array.from({ length: 22 }, (_, i) => ({ x: rnd(), y: rnd(), r: 3 + rnd() * 6, c: BOKEH_COLORS[i % BOKEH_COLORS.length], ph: rnd() * 6.28, sp: 0.5 + rnd() }));
  const twinkles = Array.from({ length: 26 }, () => ({ x: rnd(), y: rnd(), r: 0.8 + rnd() * 1.6, ph: rnd() * 6.28, sp: 1 + rnd() * 2 }));
  let fxTime = 0, fxLast = 0, fxRunning = false;

  function stepFx(dt) {
    if (S.fx.snow) {
      for (const p of snow) {
        p.y += p.sp * p.r * dt;
        p.x += Math.sin(fxTime * 0.8 + p.ph) * 0.0006 * p.r;
        if (p.y > 1.03) { p.y = -0.03; p.x = Math.random(); }
        if (p.x > 1.02) p.x = -0.02; else if (p.x < -0.02) p.x = 1.02;
      }
    }
    for (const b of bokeh) { b.y -= 0.004 * dt * b.sp; if (b.y < -0.1) b.y = 1.1; }
  }
  function drawFx(ctx, W, H) {
    const u = Math.min(W, H) / 100;
    if (S.fx.bokeh) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const b of bokeh) {
        const a = 0.22 + 0.16 * Math.sin(fxTime * b.sp + b.ph);
        const x = b.x * W, y = b.y * H, r = b.r * u;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${b.c},${a + 0.15})`);
        g.addColorStop(0.7, `rgba(${b.c},${a})`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }
    if (S.fx.twinkle) {
      ctx.save();
      for (const t of twinkles) {
        const a = Math.max(0, Math.sin(fxTime * t.sp + t.ph));
        if (a < 0.05) continue;
        const x = t.x * W, y = t.y * H, r = t.r * u * (0.6 + 0.4 * a);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#FFF4C2';
        ctx.shadowColor = 'rgba(255,220,120,.9)'; ctx.shadowBlur = r * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 2);
        ctx.quadraticCurveTo(x, y, x + r * 2, y);
        ctx.quadraticCurveTo(x, y, x, y + r * 2);
        ctx.quadraticCurveTo(x, y, x - r * 2, y);
        ctx.quadraticCurveTo(x, y, x, y - r * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (S.fx.snow) {
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = u * 0.4;
      for (const p of snow) {
        ctx.globalAlpha = 0.45 + 0.5 * (p.r / 1.2);
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r * u * 0.85, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }
  }
  function fxLoop(ts) {
    const dt = fxLast ? Math.min((ts - fxLast) / 1000, 0.05) : 0.016;
    fxLast = ts; fxTime += dt;
    stepFx(dt);
    const c = el.fx, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    drawFx(ctx, c.width, c.height);
    if (S.fx.snow || S.fx.bokeh || S.fx.twinkle) requestAnimationFrame(fxLoop);
    else { fxRunning = false; ctx.clearRect(0, 0, c.width, c.height); }
  }
  function startFx() {
    if (fxRunning) return;
    if (!(S.fx.snow || S.fx.bokeh || S.fx.twinkle)) { el.fx.getContext('2d').clearRect(0, 0, el.fx.width, el.fx.height); return; }
    fxRunning = true; fxLast = 0;
    requestAnimationFrame(fxLoop);
  }

  // ---------------------------------------------------------------------------
  // Frames (drawn with code so they fit any photo size)
  // ---------------------------------------------------------------------------
  const BULBS = ['#FF4B5C', '#FFD23F', '#3EC1D3', '#7BD389', '#FF8C42', '#B983FF'];
  const HOLLY_LEAF = typeof Path2D !== 'undefined' ? new Path2D('M0,0 C10,-8 18,-6 26,-14 C26,-6 34,-2 36,4 C28,6 24,14 16,12 C14,6 6,6 0,0Z') : null;

  function drawBulb(ctx, x, y, u, color, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 2.6 * u, 0, 0, 2.6 * u, 6 * u);
    g.addColorStop(0, color + 'AA'); g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 2.6 * u, 6 * u, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1F4A2E'; roundRect(ctx, -0.75 * u, -0.2 * u, 1.5 * u, 1.3 * u, 0.25 * u); ctx.fill();
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.3 * u;
    ctx.beginPath(); ctx.ellipse(0, 2.7 * u, 1.45 * u, 2.1 * u, 0, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(-0.5 * u, 2.1 * u, 0.35 * u, 0.7 * u, 0, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawLightString(ctx, W, u, y0, sag, phase = 0) {
    const n = Math.max(6, Math.round(W / (13 * u)));
    const seg = W / n;
    ctx.save();
    ctx.strokeStyle = '#173A25'; ctx.lineWidth = 0.55 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-u, y0);
    for (let i = 0; i < n; i++) ctx.quadraticCurveTo(seg * (i + 0.5), y0 + sag * 2, seg * (i + 1), y0);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < n; i++) drawBulb(ctx, seg * (i + 0.5), y0 + sag, u, BULBS[(i + phase) % BULBS.length], (i % 2 ? 1 : -1) * 0.18);
  }
  function drawHolly(ctx, x, y, s, rot = 0) {
    if (!HOLLY_LEAF) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s / 40, s / 40);
    ctx.lineWidth = 2; ctx.strokeStyle = '#2A7550'; ctx.lineCap = 'round';
    for (const r of [-2.8, -0.35, 1.3]) {
      ctx.save(); ctx.rotate(r);
      ctx.fillStyle = '#3D9A6A'; ctx.fill(HOLLY_LEAF);
      ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(30, -2); ctx.stroke();
      ctx.restore();
    }
    for (const [bx, by] of [[-7, -4], [6, -6], [0, 6]]) {
      ctx.fillStyle = '#E2444A'; ctx.beginPath(); ctx.arc(bx, by, 8, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(bx - 3, by - 3, 2.2, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
  function drawFlake(ctx, x, y, r, color = '#fff', lw = 0.5) {
    ctx.save();
    ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -r);
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.25, -r * 0.8);
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.25, -r * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawBow(ctx, x, y, s, color = '#E2444A') {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s / 40, s / 40);
    ctx.fillStyle = color;
    const loop = (dir) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(dir * 22, -22, dir * 34, 2, 0, 0); ctx.fill(); };
    const tail = (dir) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dir * 14, 26); ctx.lineTo(dir * 6, 24); ctx.closePath(); ctx.fill(); };
    tail(-1); tail(1); loop(-1); loop(1);
    ctx.fillStyle = '#B92F37'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function borderPath(ctx, W, H, l, t, r, b, rad) {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    const x = l, y = t, w = W - l - r, h = H - t - b;
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x, y, x, y + h, rad); ctx.arcTo(x, y + h, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x + w, y, rad); ctx.arcTo(x + w, y, x, y, rad);
    ctx.closePath();
  }
  function drawCaption(ctx, W, H, u, line1, line2, align = 'left', logo) {
    ctx.save();
    ctx.font = `700 ${4 * u}px Fredoka, Nunito, sans-serif`;
    const w1 = ctx.measureText(line1).width;
    ctx.font = `800 ${2.4 * u}px Nunito, sans-serif`;
    const w2 = ctx.measureText(line2).width;
    const logoS = 10 * u, padX = 2.4 * u;
    const pw = logoS + padX * 2.2 + Math.max(w1, w2), ph = 12 * u;
    const x = align === 'left' ? 3 * u : W - 3 * u - pw, y = H - 3 * u - ph;
    ctx.fillStyle = 'rgba(8, 26, 20, .74)';
    roundRect(ctx, x, y, pw, ph, ph / 2); ctx.fill();
    if (logo) ctx.drawImage(logo, x + padX * 0.5, y + 0.6 * u, logoS + u, logoS + u);
    const tx = x + padX * 0.8 + logoS + u;
    ctx.fillStyle = '#FFC72C'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${4 * u}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(line1, tx, y + 5.6 * u);
    ctx.fillStyle = '#FFF8EC';
    ctx.font = `800 ${2.4 * u}px Nunito, sans-serif`;
    ctx.fillText(line2, tx, y + 9.2 * u);
    ctx.restore();
  }

  const FRAMES = [
    { id: 'none', name: 'No frame', draw() {} },
    {
      id: 'lights', name: 'Holiday lights',
      draw(ctx, W, H, im) {
        const u = Math.min(W, H) / 100;
        const g = ctx.createLinearGradient(0, 0, 0, 16 * u);
        g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 16 * u);
        drawLightString(ctx, W, u, 1.2 * u, 4.5 * u);
        drawCaption(ctx, W, H, u, 'Happy Holidays', `Team Nexford  ·  ${YEAR}`, 'left', im.logo);
      },
    },
    {
      id: 'garland', name: 'Pine garland',
      draw(ctx, W, H, im) {
        const u = Math.min(W, H) / 100;
        const r = seeded(7);
        const greens = ['#1E5E3B', '#2F8F5B', '#3FA36B', '#174A2E', '#26774A'];
        const sags = [[-2 * u, 2 * u, W * 0.25, 17 * u, W * 0.5, 3 * u], [W * 0.5, 3 * u, W * 0.75, 17 * u, W + 2 * u, 2 * u]];
        const q = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
        ctx.save(); ctx.lineCap = 'round';
        for (const [x0, y0, cx, cy, x1, y1] of sags) {
          const steps = Math.round(W / (1.3 * u) / 2);
          for (let i = 0; i <= steps; i++) {
            const t = i / steps, x = q(x0, cx, x1, t), y = q(y0, cy, y1, t);
            for (let k = 0; k < 7; k++) {
              const a = r() * 6.283, len = (2.8 + r() * 3) * u;
              ctx.strokeStyle = greens[(r() * greens.length) | 0];
              ctx.lineWidth = 0.75 * u;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
            }
          }
          // berries and little lights in the garland
          for (let i = 1; i < 10; i++) {
            const t = i / 10, x = q(x0, cx, x1, t) + (r() - 0.5) * 3 * u, y = q(y0, cy, y1, t) + (r() - 0.5) * 3 * u;
            ctx.fillStyle = i % 3 ? '#D8303B' : '#FFD23F';
            ctx.beginPath(); ctx.arc(x, y, 0.9 * u, 0, 6.283); ctx.fill();
          }
        }
        ctx.restore();
        // hanging ornaments
        const hang = (x, y, len, img, s) => {
          ctx.strokeStyle = '#C98F1C'; ctx.lineWidth = 0.35 * u;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
          if (img) ctx.drawImage(img, x - s / 2, y + len - s * 0.12, s, s * (img.naturalHeight / img.naturalWidth));
        };
        hang(W * 0.25, 10 * u, 5 * u, im.ornRed, 9 * u);
        hang(W * 0.75, 10 * u, 5 * u, im.ornRed, 9 * u);
        hang(W * 0.12, 6.5 * u, 3 * u, im.ornGold, 6 * u);
        hang(W * 0.38, 7 * u, 3 * u, im.ornGold, 6 * u);
        hang(W * 0.62, 7 * u, 3 * u, im.ornGold, 6 * u);
        hang(W * 0.88, 6.5 * u, 3 * u, im.ornGold, 6 * u);
        drawBow(ctx, W * 0.5, 3.5 * u, 7 * u);
        drawCaption(ctx, W, H, u, 'Merry & Bright', `From all of us at Nexford  ·  ${YEAR}`, 'right', im.logo);
      },
    },
    {
      id: 'snowy', name: 'Snowy day',
      draw(ctx, W, H) {
        const u = Math.min(W, H) / 100;
        const r = seeded(11);
        let g = ctx.createLinearGradient(0, 0, 0, 14 * u);
        g.addColorStop(0, 'rgba(235,245,255,.6)'); g.addColorStop(1, 'rgba(235,245,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 14 * u);
        g = ctx.createLinearGradient(0, 0, 6 * u, 0);
        g.addColorStop(0, 'rgba(235,245,255,.45)'); g.addColorStop(1, 'rgba(235,245,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 6 * u, H);
        g = ctx.createLinearGradient(W, 0, W - 6 * u, 0);
        g.addColorStop(0, 'rgba(235,245,255,.45)'); g.addColorStop(1, 'rgba(235,245,255,0)');
        ctx.fillStyle = g; ctx.fillRect(W - 6 * u, 0, 6 * u, H);
        // snow drift
        const pts = [];
        const n = 7;
        for (let i = 0; i <= n; i++) pts.push([(W / n) * i, H - (7 + r() * 5) * u]);
        ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const [px, py] = pts[i - 1], [x, y] = pts[i];
          ctx.quadraticCurveTo((px + x) / 2, Math.min(py, y) - 4 * u, x, y);
        }
        ctx.lineTo(W, H); ctx.closePath();
        ctx.save();
        ctx.shadowColor = 'rgba(30, 70, 120, .35)'; ctx.shadowBlur = 2 * u; ctx.shadowOffsetY = -0.4 * u;
        ctx.fillStyle = '#FFFFFF'; ctx.fill();
        ctx.restore();
        g = ctx.createLinearGradient(0, H - 12 * u, 0, H);
        g.addColorStop(0, 'rgba(190,215,240,0)'); g.addColorStop(1, 'rgba(190,215,240,.6)');
        ctx.fillStyle = g; ctx.fill();
        // flakes
        for (const [fx, fy, fr] of [[5, 6, 3], [12, 13, 1.8], [4, 20, 1.5], [95, 7, 3], [88, 14, 2], [96, 22, 1.6]]) {
          const x = fx < 50 ? fx * u : W - (100 - fx) * u;
          drawFlake(ctx, x, fy * u, fr * u, '#FFFFFF', 0.45 * u);
        }
        ctx.fillStyle = '#1F5FA0';
        ctx.font = `700 ${4.6 * u}px Fredoka, Nunito, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`Season's Greetings from Nexford`, W / 2, H - 2.8 * u);
        ctx.textAlign = 'start';
      },
    },
    {
      id: 'polaroid', name: 'Instant photo',
      draw(ctx, W, H, im) {
        const u = Math.min(W, H) / 100;
        const side = 3.6 * u, bottom = 17 * u;
        ctx.save();
        borderPath(ctx, W, H, side, side, side, bottom, 0.8 * u);
        ctx.fillStyle = '#FFFBF2'; ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 0.35 * u;
        ctx.strokeRect(side, side, W - side * 2, H - side - bottom);
        ctx.fillStyle = '#2B2B2B';
        const capMax = W - side * 2 - 42 * u;
        let fs = 8.4 * u;
        ctx.font = `700 ${fs}px Caveat, "Comic Sans MS", cursive`;
        const cw = ctx.measureText('Happy Holidays, Nexford!').width;
        if (cw > capMax) { fs *= capMax / cw; ctx.font = `700 ${fs}px Caveat, "Comic Sans MS", cursive`; }
        ctx.fillText('Happy Holidays, Nexford!', side + 1.5 * u, H - bottom / 2 + fs / 3);
        ctx.fillStyle = '#9A8C78';
        ctx.font = `800 ${2.6 * u}px Nunito, sans-serif`;
        ctx.textAlign = 'right';
        const lx = W - side - 1.5 * u;
        if (im.logo) ctx.drawImage(im.logo, lx - 11.5 * u, H - bottom + 0.8 * u, 11.5 * u, 11.5 * u);
        ctx.fillText(DATE_LABEL, lx - 13 * u, H - bottom / 2 + 1 * u);
        ctx.restore();
        drawHolly(ctx, side + 2 * u, side + 2 * u, 6 * u, 0.3);
      },
    },
    {
      id: 'candy', name: 'Candy cane',
      draw(ctx, W, H) {
        const u = Math.min(W, H) / 100;
        const t = 3.6 * u;
        ctx.save();
        borderPath(ctx, W, H, t, t, t, t, 2 * u);
        ctx.clip('evenodd');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#D8303B';
        const step = 4.2 * u;
        for (let x = -H; x < W + H; x += step) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + step / 2, 0); ctx.lineTo(x + step / 2 + H, H); ctx.lineTo(x + H, H); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(90,20,20,.45)'; ctx.lineWidth = 0.35 * u;
        roundRect(ctx, t, t, W - 2 * t, H - 2 * t, 2 * u); ctx.stroke();
        drawHolly(ctx, t + 2.5 * u, t + 2.5 * u, 7 * u, 0.3);
        drawHolly(ctx, W - t - 2.5 * u, t + 2.5 * u, 7 * u, -0.3);
        // ribbon banner
        const text = 'Merry & Bright';
        ctx.font = `700 ${4.4 * u}px Fredoka, Nunito, sans-serif`;
        const tw = ctx.measureText(text).width, bw = tw + 10 * u, bh = 8 * u, bx = (W - bw) / 2, by = H - t - bh - 1.5 * u;
        ctx.fillStyle = '#9C1C27';
        ctx.beginPath(); ctx.moveTo(bx - 3 * u, by + 1.5 * u); ctx.lineTo(bx + 2 * u, by + 1.5 * u); ctx.lineTo(bx + 2 * u, by + bh + 1.5 * u); ctx.lineTo(bx - 3 * u, by + bh + 1.5 * u); ctx.lineTo(bx - 1 * u, by + bh / 2 + 1.5 * u); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx + bw + 3 * u, by + 1.5 * u); ctx.lineTo(bx + bw - 2 * u, by + 1.5 * u); ctx.lineTo(bx + bw - 2 * u, by + bh + 1.5 * u); ctx.lineTo(bx + bw + 3 * u, by + bh + 1.5 * u); ctx.lineTo(bx + bw + 1 * u, by + bh / 2 + 1.5 * u); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#D8303B'; roundRect(ctx, bx, by, bw, bh, 1 * u); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
        ctx.fillText(text, W / 2, by + bh * 0.7);
        ctx.textAlign = 'start';
      },
    },
    {
      id: 'gold', name: 'Nexford gold',
      draw(ctx, W, H, im) {
        const u = Math.min(W, H) / 100;
        const t = 3 * u, bar = 11 * u;
        ctx.save();
        borderPath(ctx, W, H, t, t, t, bar, 2 * u);
        ctx.fillStyle = '#FFC72C'; ctx.fill('evenodd');
        ctx.restore();
        if (im.logo) ctx.drawImage(im.logo, t + 0.5 * u, H - bar - 0.4 * u, bar + 0.8 * u, bar + 0.8 * u);
        ctx.fillStyle = '#1A1405';
        ctx.font = `700 ${5.6 * u}px Fredoka, Nunito, sans-serif`;
        ctx.fillText('Nexbooth', t + bar + 2 * u, H - bar / 2 + 2 * u);
        ctx.textAlign = 'right';
        ctx.font = `800 ${2.9 * u}px Nunito, sans-serif`;
        ctx.fillText(`Happy Holidays from Nexford  ·  ${YEAR}`, W - t - 1.5 * u, H - bar / 2 + 1 * u);
        ctx.textAlign = 'start';
        drawHolly(ctx, t + 2.5 * u, t + 2.5 * u, 6.5 * u, 0.3);
        drawHolly(ctx, W - t - 2.5 * u, t + 2.5 * u, 6.5 * u, -0.3);
      },
    },
  ];
  const frameById = (id) => FRAMES.find((f) => f.id === id) || FRAMES[0];
  let frameImgs = {};
  async function loadFrameImages() {
    const [logo, ornRed, ornGold] = await Promise.all([art.logo ? getImg('logo') : null, getImg('ornament-red'), getImg('ornament-gold')]);
    frameImgs = { logo, ornRed, ornGold };
  }
  function drawFramePreview() {
    const c = el.frame, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    frameById(S.frame).draw(ctx, c.width, c.height, frameImgs);
  }
  function setFrame(id) {
    S.frame = id;
    drawFramePreview();
    $$('#frameGrid .choice').forEach((b) => b.classList.toggle('is-on', b.dataset.id === id));
  }

  // ---------------------------------------------------------------------------
  // Stage layout
  // ---------------------------------------------------------------------------
  function outSize() { return S.portrait ? [1200, 1600] : [1600, 1200]; }
  function layoutStage() {
    const narrow = window.innerWidth <= 760;
    S.portrait = narrow && window.innerHeight > window.innerWidth;
    el.stage.classList.toggle('portrait', S.portrait);
    const shell = el.stage.parentElement;
    const availW = shell.clientWidth - parseFloat(getComputedStyle(shell).paddingLeft) * 2;
    const ratio = S.portrait ? 3 / 4 : 4 / 3;
    const maxH = window.innerWidth > 1060 ? Math.max(window.innerHeight - 230, 320) : Infinity;
    const w = Math.min(availW, maxH * ratio);
    el.stage.style.width = `${Math.floor(w)}px`;
    const h = w / ratio, dpr = DPR();
    for (const c of [el.fx, el.frame]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    drawFramePreview();
    renderStickers();
  }

  // ---------------------------------------------------------------------------
  // Camera and photo source
  // ---------------------------------------------------------------------------
  function showBooth() {
    el.welcome.hidden = true;
    el.booth.hidden = false;
    layoutStage();
    startFx();
  }
  function camErrorMessage(err) {
    const name = err && err.name;
    if (!window.isSecureContext) return 'The camera only works on a secure (https) link. Open Nexbooth from its GitHub Pages address.';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Click the camera icon in your browser\'s address bar, allow access, and try again. You can also use a photo instead.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'We could not find a camera on this device. You can use a photo instead.';
    if (name === 'NotReadableError') return 'Your camera is busy in another app (for example, a video call). Close that app and try again.';
    return 'The camera could not start. You can use a photo instead.';
  }
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nocam'), { name: 'NotFoundError' });
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: S.facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    S.stream = stream;
    el.video.srcObject = stream;
    await el.video.play().catch(() => {});
    el.video.classList.toggle('mirror', S.facing === 'user');
    el.video.hidden = false;
    el.still.hidden = true;
    S.source = 'camera';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      $('#switchCamBtn').hidden = devices.filter((d) => d.kind === 'videoinput').length < 2;
    } catch (e) { /* ignore */ }
  }
  function stopCamera() {
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
  }
  async function useImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    stopCamera();
    if (el.still.dataset.url) URL.revokeObjectURL(el.still.dataset.url);
    const url = URL.createObjectURL(file);
    el.still.dataset.url = url;
    el.still.src = url;
    await el.still.decode().catch(() => {});
    el.still.hidden = false;
    el.video.hidden = true;
    S.source = 'image';
    showBooth();
    toast('Photo loaded. Now decorate it!');
  }
  function drawSource(ctx, W, H) {
    const src = S.source === 'camera' ? el.video : el.still;
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
    ctx.fillStyle = '#0B1F19'; ctx.fillRect(0, 0, W, H);
    if (!sw || !sh) return;
    const k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
    ctx.save();
    if (S.source === 'camera' && S.facing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Stickers
  // ---------------------------------------------------------------------------
  let uid = 0;
  const ICONS = {
    del: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    flip: '<svg viewBox="0 0 24 24"><path d="M12 3v18M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z"/></svg>',
    front: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>',
    rot: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  };

  async function addSticker({ src, img, w, x, y, anchorBottom = 0, name = '' }) {
    img = img || (await loadImage(src));
    const aspect = img.naturalHeight / img.naturalWidth || 1;
    const stageRatio = S.portrait ? 4 / 3 : 3 / 4; // stage height / width
    const hFrac = (w * aspect) / stageRatio;    // sticker height as a share of stage height
    if (anchorBottom) y = 1 - hFrac / 2 + anchorBottom;
    const st = { id: ++uid, src: img.src, img, w, x, y, rot: 0, flip: false, aspect, name };
    S.stickers.push(st);
    renderStickers();
    select(st);
    el.hint.classList.add('gone');
    return st;
  }
  function renderStickers() {
    const keep = new Set(S.stickers.map((s) => String(s.id)));
    $$('.sticker', el.stickers).forEach((n) => { if (!keep.has(n.dataset.id)) n.remove(); });
    S.stickers.forEach((st, i) => {
      let n = el.stickers.querySelector(`.sticker[data-id="${st.id}"]`);
      if (!n) {
        n = document.createElement('div');
        n.className = 'sticker';
        n.dataset.id = st.id;
        n.innerHTML = `<img alt="" draggable="false" src="${st.src}"><span class="box"></span>
          <button class="h h-del" data-act="del" aria-label="Remove">${ICONS.del}</button>
          <button class="h h-flip" data-act="flip" aria-label="Flip">${ICONS.flip}</button>
          <button class="h h-front" data-act="front" aria-label="Bring to front">${ICONS.front}</button>
          <button class="h h-rot" data-act="rot" aria-label="Resize and rotate">${ICONS.rot}</button>`;
        el.stickers.appendChild(n);
      }
      n.style.zIndex = i + 1;
      n.style.width = `${st.w * 100}%`;
      n.style.left = `${st.x * 100}%`;
      n.style.top = `${st.y * 100}%`;
      n.style.transform = `translate(-50%, -50%) rotate(${st.rot}deg)`;
      n.querySelector('img').style.transform = st.flip ? 'scaleX(-1)' : '';
      n.classList.toggle('is-sel', S.sel === st);
    });
  }
  function select(st) { S.sel = st; renderStickers(); }
  function removeSticker(st) {
    S.stickers = S.stickers.filter((s) => s !== st);
    if (S.sel === st) S.sel = null;
    renderStickers();
  }
  const stickerById = (id) => S.stickers.find((s) => String(s.id) === String(id));

  // pointer gestures: drag, pinch, corner handle
  const pointers = new Map();
  let gesture = null;
  el.stickers.addEventListener('pointerdown', (e) => {
    const node = e.target.closest('.sticker');
    if (!node) { select(null); return; }
    const st = stickerById(node.dataset.id);
    if (!st) return;
    e.preventDefault();
    const act = e.target.closest('.h') && e.target.closest('.h').dataset.act;
    if (act === 'del') { removeSticker(st); return; }
    if (act === 'flip') { st.flip = !st.flip; renderStickers(); return; }
    if (act === 'front') { S.stickers = S.stickers.filter((s) => s !== st).concat(st); renderStickers(); return; }
    select(st);
    const rect = el.stage.getBoundingClientRect();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (act === 'rot') {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      gesture = { type: 'rot', st, cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy), a0: Math.atan2(e.clientY - cy, e.clientX - cx), w0: st.w, r0: st.rot };
    } else if (pointers.size === 2 && gesture && gesture.st === st) {
      const [p1, p2] = [...pointers.values()];
      gesture = { type: 'pinch', st, d0: Math.hypot(p2.x - p1.x, p2.y - p1.y), a0: Math.atan2(p2.y - p1.y, p2.x - p1.x), w0: st.w, r0: st.rot };
    } else {
      gesture = { type: 'drag', st, sx: e.clientX, sy: e.clientY, x0: st.x, y0: st.y, rw: rect.width, rh: rect.height };
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture, st = g.st;
    if (g.type === 'drag') {
      st.x = clamp(g.x0 + (e.clientX - g.sx) / g.rw, -0.2, 1.2);
      st.y = clamp(g.y0 + (e.clientY - g.sy) / g.rh, -0.2, 1.2);
    } else if (g.type === 'rot') {
      const d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      const a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
      st.w = clamp(g.w0 * (d / Math.max(g.d0, 1)), 0.03, 1.6);
      st.rot = g.r0 + ((a - g.a0) * 180) / Math.PI;
    } else if (g.type === 'pinch' && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      st.w = clamp(g.w0 * (Math.hypot(p2.x - p1.x, p2.y - p1.y) / Math.max(g.d0, 1)), 0.03, 1.6);
      st.rot = g.r0 + ((Math.atan2(p2.y - p1.y, p2.x - p1.x) - g.a0) * 180) / Math.PI;
    }
    renderStickers();
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) gesture = null;
    else if (gesture && gesture.type === 'pinch') {
      const [p] = [...pointers.values()], rect = el.stage.getBoundingClientRect();
      gesture = { type: 'drag', st: gesture.st, sx: p.x, sy: p.y, x0: gesture.st.x, y0: gesture.st.y, rw: rect.width, rh: rect.height };
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  el.stickers.addEventListener('wheel', (e) => {
    const node = e.target.closest('.sticker');
    if (!node) return;
    e.preventDefault();
    const st = stickerById(node.dataset.id);
    st.w = clamp(st.w * Math.exp(-e.deltaY * 0.0015), 0.03, 1.6);
    select(st);
  }, { passive: false });

  async function drawStickers(ctx, W, H) {
    const stageW = el.stage.clientWidth || W;
    const k = W / stageW;
    for (const st of S.stickers) {
      const w = st.w * W, h = w * st.aspect;
      ctx.save();
      ctx.translate(st.x * W, st.y * H);
      ctx.rotate((st.rot * Math.PI) / 180);
      if (st.flip) ctx.scale(-1, 1);
      ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 10 * k; ctx.shadowOffsetY = 6 * k;
      ctx.drawImage(st.img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Speech bubbles
  // ---------------------------------------------------------------------------
  const BUBBLES = [
    { bg: '#FFFFFF', fg: '#2A1C0E', line: '#2A1C0E' },
    { bg: '#E23B3B', fg: '#FFFFFF', line: '#6E1016' },
    { bg: '#FFC72C', fg: '#2A1C00', line: '#6B4A00' },
    { bg: '#2F8F5B', fg: '#FFFFFF', line: '#0F3A24' },
  ];
  const PHRASES = ['Happy Holidays!', 'Merry Christmas!', 'Fleece Navidad!', 'Ho Ho Ho!', 'Merry Alpaca-mas!',
    'Season\'s Greetings!', 'Team Nexford', 'Alpaca my bags for the holidays!', 'Cheers to a great year!', 'Learning designers, assemble!'];

  async function makeBubble(text, style) {
    try { await document.fonts.load('700 64px Fredoka'); } catch (e) { /* fallback font */ }
    const fs = 64, lh = fs * 1.15, maxW = 600, padX = 48, padY = 34, tail = 46, lw = 8;
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = `700 ${fs}px Fredoka, Nunito, sans-serif`;
    const words = text.split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = tw + padX * 2, bh = lines.length * lh + padY * 2 - (lh - fs);
    c.width = Math.ceil(bw + lw * 2); c.height = Math.ceil(bh + tail + lw * 2);
    ctx.translate(lw, lw);
    const r = Math.min(46, bh / 2);
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(bw - r, 0); ctx.arcTo(bw, 0, bw, r, r);
    ctx.lineTo(bw, bh - r); ctx.arcTo(bw, bh, bw - r, bh, r);
    ctx.lineTo(bw * 0.36, bh); ctx.lineTo(bw * 0.2, bh + tail); ctx.lineTo(bw * 0.24, bh);
    ctx.lineTo(r, bh); ctx.arcTo(0, bh, 0, bh - r, r);
    ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r); ctx.closePath();
    ctx.fillStyle = style.bg; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = style.line; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = style.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${fs}px Fredoka, Nunito, sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, bw / 2, padY + fs * 0.82 + i * lh));
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return loadImage(URL.createObjectURL(blob));
  }
  async function addWords(text) {
    text = text.trim();
    if (!text) return;
    const img = await makeBubble(text, BUBBLES[S.bubbleStyle]);
    const w = clamp(0.12 + text.length * 0.012, 0.2, 0.42);
    addSticker({ img, w, x: 0.5 + (Math.random() - 0.5) * 0.2, y: 0.2, name: text });
  }

  // ---------------------------------------------------------------------------
  // Taking photos
  // ---------------------------------------------------------------------------
  async function composeShot(W, H, withFrame) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    drawSource(ctx, W, H);
    applyFilter(ctx, W, H, filterById(S.filter));
    drawFx(ctx, W, H);
    await drawStickers(ctx, W, H);
    if (withFrame) frameById(S.frame).draw(ctx, W, H, frameImgs);
    return c;
  }
  async function countdown(n) {
    for (let i = n; i > 0; i--) {
      el.countdown.innerHTML = `<span>${i}</span>`;
      beep(i === 1 ? 1175 : 880);
      await sleep(1000);
    }
    el.countdown.innerHTML = '';
  }
  function flash() {
    shutterSound();
    el.flash.classList.remove('go');
    void el.flash.offsetWidth;
    el.flash.classList.add('go');
  }
  function snowBackground(ctx, W, H, seed) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#174535'); g.addColorStop(1, '#0B1F19');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = seeded(seed);
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = 0.08 + r() * 0.12;
      drawFlake(ctx, r() * W, r() * H, 8 + r() * 18, '#FFFFFF', 2.5);
    }
    ctx.globalAlpha = 1;
  }
  async function composeStrip(panels) {
    const vertical = !S.portrait;
    const pw = vertical ? 1060 : 700, ph = vertical ? 795 : 933;
    const pad = 70, gap = vertical ? 34 : 40, header = 270, footer = 250;
    const W = vertical ? pw + pad * 2 : pw * 2 + gap + pad * 2;
    const H = vertical ? header + ph * 4 + gap * 3 + footer : header + ph * 2 + gap + footer;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    snowBackground(ctx, W, H, 5);
    drawLightString(ctx, W, 9, 6, 28, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFC72C';
    ctx.font = '700 118px Fredoka, Nunito, sans-serif';
    ctx.fillText('Nexbooth', W / 2, 185);
    ctx.fillStyle = '#FFF8EC';
    ctx.font = '800 40px Nunito, sans-serif';
    ctx.fillText('Happy Holidays, Team Nexford', W / 2, 240);
    panels.forEach((p, i) => {
      const col = vertical ? 0 : i % 2, row = vertical ? i : Math.floor(i / 2);
      const x = pad + col * (pw + gap), y = header + row * (ph + gap);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#FFFBF2'; roundRect(ctx, x - 10, y - 10, pw + 20, ph + 20, 22); ctx.fill();
      ctx.restore();
      ctx.save(); roundRect(ctx, x, y, pw, ph, 14); ctx.clip();
      ctx.drawImage(p, x, y, pw, ph);
      ctx.restore();
    });
    const fy = H - footer;
    if (frameImgs.logo) ctx.drawImage(frameImgs.logo, W / 2 - 90, fy + 18, 180, 180);
    drawHolly(ctx, W / 2 - 150, fy + 120, 52, 0.2);
    drawHolly(ctx, W / 2 + 150, fy + 120, 52, -0.2);
    ctx.fillStyle = '#BFD3C9';
    ctx.font = '800 32px Nunito, sans-serif';
    ctx.fillText(DATE_LABEL, W / 2, H - 26);
    ctx.textAlign = 'start';
    return c;
  }
  async function shoot() {
    if (S.busy || S.source === 'none') return;
    S.busy = true;
    el.shutter.disabled = true;
    select(null);
    el.stage.classList.add('capturing');
    const timer = parseInt($('#timerSelect').value, 10) || 0;
    try {
      let canvas;
      if (S.mode === 'single') {
        await countdown(timer);
        flash();
        const [W, H] = outSize();
        canvas = await composeShot(W, H, true);
      } else {
        const [pw, ph] = S.portrait ? [700, 933] : [1060, 795];
        const scale = 1.5; // shoot panels a bit larger, then scale down for sharpness
        const panels = [];
        el.stripProgress.innerHTML = '<i></i><i></i><i></i><i></i>';
        el.stripProgress.hidden = false;
        for (let k = 0; k < 4; k++) {
          await countdown(k === 0 ? timer : Math.min(timer || 3, 3));
          flash();
          panels.push(await composeShot(Math.round(pw * scale), Math.round(ph * scale), false));
          el.stripProgress.children[k].classList.add('done');
          await sleep(500);
        }
        el.stripProgress.hidden = true;
        canvas = await composeStrip(panels);
      }
      await finishShot(canvas);
    } catch (err) {
      console.error(err);
      toast('Something went wrong. Please try again.');
    } finally {
      el.countdown.innerHTML = '';
      el.stage.classList.remove('capturing');
      el.stripProgress.hidden = true;
      el.shutter.disabled = false;
      S.busy = false;
    }
  }
  async function finishShot(canvas) {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `nexbooth-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.jpg`;
    const shot = { blob, url: URL.createObjectURL(blob), name };
    S.shots.unshift(shot);
    renderGallery();
    openResult(shot);
  }
  function openResult(shot) {
    el.resultImg.src = shot.url;
    el.download.href = shot.url;
    el.download.download = shot.name;
    const file = new File([shot.blob], shot.name, { type: 'image/jpeg' });
    el.share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    el.share.onclick = () => navigator.share({ files: [file], title: 'My Nexbooth photo', text: 'Happy Holidays from Nexford!' }).catch(() => {});
    if (typeof el.result.showModal === 'function') el.result.showModal(); else el.result.setAttribute('open', '');
  }
  function renderGallery() {
    $('#galleryCount').textContent = S.shots.length ? `(${S.shots.length})` : '';
    el.gallery.innerHTML = '';
    if (!S.shots.length) { el.gallery.innerHTML = '<p class="gallery-empty">Photos you take will show up here.</p>'; return; }
    S.shots.forEach((shot, i) => {
      const b = document.createElement('button');
      b.title = 'Open photo';
      b.innerHTML = `<img src="${shot.url}" alt="Photo ${S.shots.length - i}">`;
      b.onclick = () => openResult(shot);
      el.gallery.appendChild(b);
    });
  }

  // ---------------------------------------------------------------------------
  // Build the panel
  // ---------------------------------------------------------------------------
  function buildPanel() {
    const ag = $('#alpacaGrid');
    ASSETS.alpacas.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.innerHTML = `<img src="${art[a.id].url}" alt=""><span>${a.name}</span>`;
      b.setAttribute('aria-label', `Add alpaca: ${a.name}`);
      b.onclick = async () => {
        const img = await getImg(a.id);
        const isPeek = a.id === 'alpaca-peek', isHead = a.id === 'alpaca-reindeer';
        const side = S.nextSide; S.nextSide *= -1;
        const w = (isHead ? 0.22 : isPeek ? 0.22 : 0.24) * (S.portrait ? 1.45 : 1);
        addSticker({ img, w, x: 0.5 + side * (S.portrait ? 0.22 : 0.3), y: isHead ? 0.3 : 0.6, anchorBottom: isHead ? 0 : isPeek ? 0.06 : -0.035, name: a.name });
      };
      ag.appendChild(b);
    });
    const PROP_SIZE = { 'santa-hat': 0.26, antlers: 0.28, 'red-nose': 0.06, glasses: 0.2, 'star-glasses': 0.22, tree: 0.18, snowman: 0.16, mistletoe: 0.14, 'candy-cane': 0.1 };
    const pg = $('#propGrid');
    ASSETS.props.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.title = a.name;
      b.innerHTML = `<img src="${art[a.id].url}" alt=""><span>${a.name}</span>`;
      b.setAttribute('aria-label', `Add prop: ${a.name}`);
      b.onclick = async () => {
        const img = await getImg(a.id);
        const w = (PROP_SIZE[a.id] || 0.14) * (S.portrait ? 1.4 : 1);
        addSticker({ img, w, x: 0.5 + (Math.random() - 0.5) * 0.1, y: a.id === 'mistletoe' ? 0.12 : 0.32, name: a.name });
      };
      pg.appendChild(b);
    });
    // words
    const bs = $('#bubbleStyles');
    BUBBLES.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'bstyle' + (i === 0 ? ' is-on' : '');
      b.style.background = s.bg;
      b.style.boxShadow = `inset 0 0 0 3px ${s.line}`;
      b.setAttribute('aria-label', `Bubble style ${i + 1}`);
      b.onclick = () => { S.bubbleStyle = i; $$('.bstyle').forEach((x, j) => x.classList.toggle('is-on', j === i)); };
      bs.appendChild(b);
    });
    const wl = $('#wordList');
    PHRASES.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'word'; b.textContent = p;
      b.onclick = () => addWords(p);
      wl.appendChild(b);
    });
    $('#wordForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#wordInput');
      addWords(input.value);
      input.value = '';
    });
    // frames (thumbnails drawn with the real frame code)
    const fg = $('#frameGrid');
    FRAMES.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'choice' + (f.id === S.frame ? ' is-on' : '');
      b.dataset.id = f.id;
      const c = document.createElement('canvas');
      c.width = 320; c.height = 240;
      b.appendChild(c);
      b.appendChild(Object.assign(document.createElement('span'), { textContent: f.name }));
      b.onclick = () => setFrame(f.id);
      fg.appendChild(b);
    });
    // filters (thumbnails use the welcome alpaca as a sample picture)
    const flg = $('#filterGrid');
    FILTERS.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'choice' + (f.id === S.filter ? ' is-on' : '');
      b.dataset.id = f.id;
      b.innerHTML = `<div class="thumb" style="position:relative;overflow:hidden">
          <div style="position:absolute;inset:0;background:linear-gradient(160deg,#2F7A5C,#C9A36B);filter:${cssFilter(f.ops)}"></div>
          <img src="${art['alpaca-cheer'] ? art['alpaca-cheer'].url : ''}" alt="" style="position:absolute;inset:6% 20%;width:60%;height:88%;object-fit:contain;filter:${cssFilter(f.ops)}">
          ${f.tint ? `<div style="position:absolute;inset:0;background:${f.tint.color};opacity:${f.tint.alpha};mix-blend-mode:${f.tint.blend}"></div>` : ''}
        </div><span>${f.name}</span>`;
      b.onclick = () => setFilter(f.id);
      flg.appendChild(b);
    });
    // effects
    const EFFECTS = [
      ['snow', 'Falling snow', 'Gentle snowflakes drift down'],
      ['bokeh', 'Fairy lights', 'Soft glowing holiday lights'],
      ['twinkle', 'Twinkles', 'Little stars that sparkle'],
    ];
    const ef = $('#effectList');
    EFFECTS.forEach(([id, name, desc]) => {
      const l = document.createElement('label');
      l.className = 'toggle';
      l.innerHTML = `<span><strong>${name}</strong><small>${desc}</small></span><input type="checkbox" ${S.fx[id] ? 'checked' : ''}><span class="switch"></span>`;
      l.querySelector('input').onchange = (e) => { S.fx[id] = e.target.checked; startFx(); };
      ef.appendChild(l);
    });
  }
  async function drawFrameThumbs() {
    const sample = await getImg('alpaca-wave');
    $$('#frameGrid .choice').forEach((b) => {
      const c = b.querySelector('canvas'), ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, '#3E7F64'); g.addColorStop(1, '#C9A36B');
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      const h = c.height * 0.8, w = h / (sample.naturalHeight / sample.naturalWidth);
      ctx.drawImage(sample, (c.width - w) / 2, c.height - h - 6, w, h);
      frameById(b.dataset.id).draw(ctx, c.width, c.height, frameImgs);
    });
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  function bind() {
    $('#startBtn').addEventListener('click', async () => {
      el.camError.hidden = true;
      const btn = $('#startBtn');
      btn.disabled = true;
      try {
        await startCamera();
        showBooth();
      } catch (err) {
        console.warn(err);
        el.camError.textContent = camErrorMessage(err);
        el.camError.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    $('#uploadInput').addEventListener('change', (e) => { useImageFile(e.target.files[0]); e.target.value = ''; });
    $('#switchCamBtn').addEventListener('click', async () => {
      S.facing = S.facing === 'user' ? 'environment' : 'user';
      try { await startCamera(); } catch (e) { toast('Could not switch the camera.'); }
    });
    $('#clearBtn').addEventListener('click', () => { S.stickers = []; S.sel = null; renderStickers(); toast('All stickers removed'); });
    el.shutter.addEventListener('click', shoot);
    $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      S.mode = b.dataset.mode;
      $$('.seg-btn').forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b); });
      toast(S.mode === 'strip' ? 'Strip mode: 4 photos in a row' : 'Single photo mode');
    }));
    $$('.tab').forEach((t) => t.addEventListener('click', () => {
      $$('.tab').forEach((x) => { x.classList.toggle('is-on', x === t); x.setAttribute('aria-selected', x === t); });
      $$('.tab-body').forEach((b) => (b.hidden = b.dataset.body !== t.dataset.tab));
    }));
    $('#resultClose').addEventListener('click', () => el.result.close());
    $('#againBtn').addEventListener('click', () => el.result.close());
    el.result.addEventListener('click', (e) => { if (e.target === el.result) el.result.close(); });
    $('#helpBtn').addEventListener('click', () => $('#help').showModal());
    $('#helpClose').addEventListener('click', () => $('#help').close());
    $('#help').addEventListener('click', (e) => { if (e.target.id === 'help') $('#help').close(); });
    $('#soundBtn').addEventListener('click', (e) => {
      S.sound = !S.sound;
      e.currentTarget.setAttribute('aria-pressed', S.sound);
      toast(S.sound ? 'Sound on' : 'Sound off');
    });
    window.addEventListener('keydown', (e) => {
      if (el.booth.hidden || el.result.open || $('#help').open) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); shoot(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); removeSticker(S.sel); }
      else if (e.key === 'Escape') select(null);
    });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!el.booth.hidden) layoutStage(); }, 120); });
    // drag a photo file onto the page
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) useImageFile(f); });
  }

  async function init() {
    if (art['alpaca-wave']) $('#welcomeAlpaca').src = art['alpaca-wave'].url;
    buildPanel();
    bind();
    setFilter(S.filter);
    try { await Promise.race([document.fonts.ready, sleep(2500)]); } catch (e) { /* ignore */ }
    try {
      await Promise.all(['700 40px Fredoka', '800 20px Nunito', '700 40px Caveat'].map((f) => document.fonts.load(f)));
    } catch (e) { /* fallback fonts */ }
    await loadFrameImages();
    drawFrameThumbs();
    if (!el.booth.hidden) drawFramePreview();
    // expose a tiny hook for automated testing
    window.__nexbooth = { S, shoot, addWords, composeShot, setFrame, setFilter };
  }
  init();
})();
