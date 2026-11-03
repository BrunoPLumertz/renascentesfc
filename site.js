(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smoothstep = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeIO = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- o agendador de scroll comum ----------
  const scrollers = new Set();
  let scrollRaf = null;
  function onPageScroll() {
    if (scrollRaf === null) scrollRaf = requestAnimationFrame(() => { scrollRaf = null; scrollers.forEach(fn => fn()); });
  }
  addEventListener('scroll', onPageScroll, { passive: true });
  addEventListener('resize', onPageScroll);
  function sectionProgress(el) {
    const r = el.getBoundingClientRect();
    return clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1);
  }
  function whileVisible(el, fn) {
    new IntersectionObserver(([e]) => { e.isIntersecting ? scrollers.add(fn) : scrollers.delete(fn); fn(); }).observe(el);
  }

  // ---------- navegação: fica sólida depois do topo ----------
  const nav = $('#nav'), hero = $('.hero');
  let navSolid = null;
  scrollers.add(() => {
    const s = scrollY > hero.offsetTop + hero.offsetHeight - innerHeight * .6;
    if (s !== navSolid) { navSolid = s; nav.classList.toggle('solid', s); }
  });

  // ---------- o topo: a câmera de imagens ----------
  const stage = $('.stage'), cam = $('.cam');
  const shotA = $('.shot-a'), shotB = $('.shot-b'), flare = $('.flare'), dustC = $('.dust'), cue = $('.cue');

  // divide os títulos das faixas em palavras e letras (leitores de tela leem a frase inteira)
  function split(el, seed) {
    const r = rng(seed);
    const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = el.textContent.replace(/\s+/g, ' ').trim();
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    const words = [];
    [...el.childNodes].forEach(n => {
      const em = n.nodeType === 1 && n.hasAttribute('data-em');
      n.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { vis.append(' '); return; }
        const w = document.createElement('span'); w.className = 'w';
        if (em) w.setAttribute('data-em-w', '');
        [...part].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.append(c); });
        vis.append(w); words.push(w);
      });
    });
    el.textContent = ''; el.append(sr, vis);
    const total = words.reduce((n, w) => n + w.children.length, 0);
    let ci = 0;
    words.forEach((w, wi) => {
      w.style.setProperty('--th', (wi / Math.max(1, words.length) * .42 + r() * .04).toFixed(3));
      [...w.children].forEach(c => {
        c.style.setProperty('--th', (ci / total * .5 + r() * .03).toFixed(3));
        c.style.setProperty('--jx', (16 + r() * 26).toFixed(1) + 'px');
        ci++;
      });
    });
  }
  $$('[data-split]').forEach((el, i) => split(el, 26 + i * 7));

  const bands = $$('.band').map((el, i, all) => {
    const [a, b] = el.dataset.band.split(',').map(Number);
    return { el, a, b, first: i === 0, last: i === all.length - 1, op: -1, k: -1, on: null, links: $$('a, button', el) };
  });
  const HERO_VH = 520;                      // intervalo de scroll do topo (620vh menos uma tela)
  const F = 17 / HERO_VH;                   // rampa de uns 17vh
  let loadK = 0;

  function updateCaptions(p) {
    bands.forEach(bd => {
      const { a, b, first, last } = bd;
      const f = Math.min(F, (b - a) / 3);
      const op = (first ? 1 : smoothstep(p, a, a + f)) * (last ? 1 : 1 - smoothstep(p, b - f, b));
      let k = clamp((p - a) / ((b - a) * .42), 0, 1);
      if (first) k = Math.max(k, loadK);
      if (Math.abs(op - bd.op) > .004 || ((op === 0 || op === 1) && op !== bd.op)) { bd.op = op; bd.el.style.opacity = op.toFixed(3); }
      if (Math.abs(k - bd.k) > .008 || ((k === 0 || k === 1) && k !== bd.k)) { bd.k = k; bd.el.style.setProperty('--k', k.toFixed(3)); }
      const on = op >= .5;
      if (on !== bd.on) {
        bd.on = on; bd.el.classList.toggle('on', on);
        bd.links.forEach(l => on ? l.removeAttribute('tabindex') : l.setAttribute('tabindex', '-1'));
      }
    });
    const c = p < .03;
    if (cue && c !== cue._on) { cue._on = c; cue.classList.toggle('gone', !c); }
  }

  const camCache = { a: '', b: '', ob: -1, fl: -1 };
  function updateCamera(p) {
    // A: a câmera avança pelo buraco do alambrado; na troca, o alambrado passa rente à lente
    const pa = clamp(p / .6, 0, 1), ta = .45 * pa + .55 * easeIO(pa);   // anda desde o começo, sem arrancar
    const tz = smoothstep(p, .44, .58);
    const a = `scale(${(1.04 + .5 * ta + 1.1 * tz * tz).toFixed(4)})`;
    // B: chega um pouco mais perto e recua até o campo aceso em repouso (1.02 no fim)
    const tb = easeOut(clamp((p - .47) / .53, 0, 1));
    const b = `scale(${(1.2 - .18 * tb).toFixed(4)})`;
    const ob = smoothstep(p, .49, .57);                                     // troca curta
    const fl = Math.pow(Math.max(0, 1 - Math.abs(p - .53) / .085), 1.3);    // os refletores acendem
    if (a !== camCache.a) { camCache.a = a; shotA.style.transform = a; }
    if (b !== camCache.b) { camCache.b = b; shotB.style.transform = b; }
    if (Math.abs(ob - camCache.ob) > .003 || ((ob === 0 || ob === 1) && ob !== camCache.ob)) { camCache.ob = ob; shotB.style.opacity = ob.toFixed(3); }
    if (Math.abs(fl - camCache.fl) > .003 || (fl === 0 && camCache.fl !== 0)) { camCache.fl = fl; flare.style.opacity = fl.toFixed(3); }
  }

  // os clarões nascem nas lâmpadas dos refletores, onde quer que a imagem em cobertura as coloque
  function placeLamps() {
    const W = stage.clientWidth, H = stage.clientHeight, s = Math.max(W / 1920, H / 1072), sb = 1.17;
    const map = (fx, fy) => [W / 2 + ((W - 1920 * s) / 2 + fx * 1920 * s - W / 2) * sb, H / 2 + ((H - 1072 * s) / 2 + fy * 1072 * s - H / 2) * sb];
    const [x1, y1] = map(.143, .178), [x2] = map(.857, .176);
    flare.style.setProperty('--lx1', x1.toFixed(0) + 'px');
    flare.style.setProperty('--lx2', x2.toFixed(0) + 'px');
    flare.style.setProperty('--ly', y1.toFixed(0) + 'px');
  }

  // a vida do mundo: vaga-lumes no mato antes da luz, poeira nos feixes depois
  const dctx = dustC.getContext('2d');
  let parts = [], dW = 0, dH = 0, dpr = 1, dustRaf = null, lastShown = 0, heroOnScreen = true;
  function sprite(rgb) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(.25, `rgba(${rgb},.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 32, 32); return c;
  }
  const FIREFLY = sprite('214,236,140'), MOTE = sprite('236,244,255');
  function dustSize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    dW = stage.clientWidth; dH = stage.clientHeight;
    dustC.width = Math.round(dW * dpr); dustC.height = Math.round(dH * dpr);
    const n = clamp(Math.round(dW * dH / 16000), 40, 110), r = rng(2026);
    parts = Array.from({ length: n }, () => ({ x: r(), y: .3 + r() * .7, z: .35 + r() * .65, ph: r() * 6.28, sp: .5 + r(), my: r() }));
  }
  function dustFrame(t) {
    dustRaf = null;
    const p = shown, lit = smoothstep(p, .5, .62), dz = shown - lastShown; lastShown = shown;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.clearRect(0, 0, dW, dH);
    for (const q of parts) {
      q.x += (q.x - .5) * dz * 2.2 * q.z + Math.sin(t * .00031 * q.sp + q.ph) * .00022;
      q.y += (q.y - .5) * dz * 2.2 * q.z + Math.cos(t * .00027 * q.sp + q.ph) * .00018 - .00016 * q.sp * lit;
      if (q.x < -.06 || q.x > 1.06 || q.y < -.06 || q.y > 1.06) {
        if (dz >= 0) { q.x = .5 + (q.my - .5) * .4; q.y = .5 + (q.z - .65) * .5; } else { q.x = q.my; q.y = 1.02; }
      }
      const blink = Math.pow(.5 + .5 * Math.sin(t * .0021 * q.sp + q.ph), 3);
      const aF = (1 - lit) * blink * .75 * q.z;
      const aM = lit * (.12 + .38 * q.z) * (q.y < .55 ? 1.25 : .7);
      const s = (5 + 9 * q.z), x = q.x * dW - s / 2, y = q.y * dH - s / 2;
      if (aF > .01) { dctx.globalAlpha = Math.min(1, aF); dctx.drawImage(FIREFLY, x, y, s, s); }
      if (aM > .01) { dctx.globalAlpha = Math.min(1, aM); dctx.drawImage(MOTE, x, y, s * .7, s * .7); }
    }
    dctx.globalAlpha = 1;
    dustSync();
  }
  function dustSync() {
    const run = scrubOn && heroOnScreen && !document.hidden;
    if (run && dustRaf === null) dustRaf = requestAnimationFrame(dustFrame);
    if (!run && dustRaf !== null) { cancelAnimationFrame(dustRaf); dustRaf = null; }
  }

  // interpolação do progresso exibido (o laço descansa quando converge)
  let target = 0, shown = 0, rafId = null, lastTick = 0, scrubOn = false, heroInit = false;
  function heroProgress() { return clamp(-hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight - innerHeight), 0, 1); }
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now)); lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - .16, dt / 16.667));
    if (Math.abs(target - shown) < .0005) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    updateCamera(shown);
    updateCaptions(shown);
  }
  function onScroll() {
    if (!scrubOn) return;
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }
  new IntersectionObserver(([e]) => { heroOnScreen = e.isIntersecting; onScroll(); dustSync(); }).observe(hero);
  document.addEventListener('visibilitychange', () => { document.body.classList.toggle('paused', document.hidden); dustSync(); });

  function rampLoad() {
    if (RM.matches) { loadK = 1; return; }
    const t0 = performance.now();
    const step = now => {
      loadK = easeOut(clamp((now - t0) / 1100, 0, 1));
      if (scrubOn) updateCaptions(shown);
      if (loadK < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function initHeroOnce() {
    if (heroInit) return; heroInit = true;
    const imgA = new Image();
    imgA.onload = () => {
      shotA.style.backgroundImage = "url('assets/hero-a.jpg')";
      cam.classList.add('ready');
      const imgB = new Image();
      imgB.onload = () => { shotB.style.backgroundImage = "url('assets/hero-b.jpg')"; };
      imgB.src = 'assets/hero-b.jpg';
    };
    imgA.onerror = () => cam.classList.add('failed');
    imgA.src = 'assets/hero-a.jpg';
    rampLoad();
  }

  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  function enableScrub() {
    if (scrubOn) return; scrubOn = true;
    initHeroOnce();
    dustSize(); placeLamps();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(b => { b.op = -1; b.k = -1; b.on = null; });
    camCache.a = camCache.b = ''; camCache.ob = camCache.fl = -1;
    target = shown = lastShown = heroProgress();
    updateCamera(shown); updateCaptions(shown);
    onScroll(); dustSync();
  }
  function disableScrub() {
    if (!scrubOn) return; scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    dustSync();
    [shotA, shotB, flare].forEach(el => { el.style.transform = ''; el.style.opacity = ''; });
    bands.forEach(b => { b.el.style.opacity = ''; b.el.style.removeProperty('--k'); b.links.forEach(l => l.removeAttribute('tabindex')); });
  }
  function applyHeroMode() { GATES.some(q => matchMedia(q).matches) ? disableScrub() : enableScrub(); }
  GATES.forEach(q => matchMedia(q).addEventListener('change', applyHeroMode));
  addEventListener('resize', () => { if (scrubOn) { dustSize(); placeLamps(); } });
  applyHeroMode();

  // ---------- entradas coreografadas ----------
  const revIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target; el.classList.add('in'); revIO.unobserve(el);
    setTimeout(() => el.classList.add('settled'), 1000 + $$('.r', el).length * 90);
  }), { threshold: .15, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => revIO.observe(el));

  // ---------- elementos vivos só na tela ----------
  const liveIO = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-live', e.isIntersecting && !RM.matches)));
  $$('.live').forEach(el => liveIO.observe(el));

  // ---------- B6: números que contam ----------
  function prepCount(el) {
    const final = el.textContent;
    const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = final;
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true'); vis.textContent = final;
    el.textContent = ''; el.append(sr, vis);
    vis.style.display = 'inline-block'; vis.style.minWidth = vis.getBoundingClientRect().width + 'px';
    const dec = +(el.dataset.decimals || 0);
    const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const show = v => { const s = (el.dataset.prefix || '') + fmt.format(v) + (el.dataset.suffix || ''); if (vis.textContent !== s) vis.textContent = s; };
    show(0);
    return show;
  }
  const counted = [];
  const countIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = 1400;
    const frame = now => {
      const k = RM.matches ? 1 : Math.min(1, (now - t0) / dur);
      el._show(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), { threshold: .6 });
  function armCounters() {
    $$('[data-count]').forEach(el => { if (el._show) return; el._show = prepCount(el); counted.push(el); countIO.observe(el); });
  }
  if (!RM.matches) document.fonts.ready.then(armCounters);

  // ---------- B3: imagem fixa que troca com o texto ----------
  $$('.sticky-swap').forEach(sec => {
    const steps = $$('.ss-step', sec), imgs = $$('.ss-media img', sec);
    let cur = -1;
    const show = i => {
      if (i === cur) return; cur = i;
      steps.forEach((s, j) => s.classList.toggle('on', j === i));
      imgs.forEach((m, j) => m.classList.toggle('on', j === i));
    };
    show(0);
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) show(steps.indexOf(e.target)); }), { rootMargin: '-50% 0px -50% 0px' });
    steps.forEach(s => io.observe(s));
  });

  // ---------- efeito 2: a camisa na frente do 2026 ----------
  $$('.behind').forEach(sec => {
    const word = $('.behind-word', sec), prod = $('.behind-product', sec);
    let last = -1;
    whileVisible(sec, () => {
      if (RM.matches) return;
      const p = sectionProgress(sec), k = p - .5;
      if (Math.abs(p - last) < .002) return; last = p;
      word.style.setProperty('--wy', (k * 18).toFixed(2) + 'vh');
      word.style.setProperty('--ws', (1 + Math.abs(k) * .08).toFixed(3));
      prod.style.setProperty('--py', (k * -10).toFixed(2) + 'vh');
    });
  });

  // ---------- a linha de cal: a página vira um campo sendo marcado ----------
  const pitch = $('.pitch'), svg = $('.cal'), NS = 'http://www.w3.org/2000/svg';
  let cal = [];
  function buildCal() {
    const W = pitch.clientWidth, H = pitch.offsetHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';
    const pr = pitch.getBoundingClientRect();
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height }; };
    const narrow = W <= 720;
    const wrapW = Math.min(1200, W - 2 * clamp(W * .05, 24, 72));
    const xl = narrow ? 8 : Math.max(12, (W - wrapW) / 2 - 32), xr = W - xl, mid = W / 2;
    const c = rect($('[data-cal=circle]'));
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, R = c.w / 2 + (narrow ? 20 : 34);
    const box = rect($('[data-cal=box]'));
    const yEnd = box.y + box.h, bx0 = box.x, bx1 = box.x + box.w, by = box.y;
    const ga = narrow ? 48 : 70, gw = box.w * (narrow ? .5 : .4);
    const ra = Math.min(box.w * .2, 190), acy = by + ra * .6, adx = ra * .8;
    const cr = narrow ? 14 : 26;
    const defs = [
      [`M${cx} ${cy - R} A${R} ${R} 0 0 0 ${cx} ${cy + R}`],
      [`M${cx} ${cy - R} A${R} ${R} 0 0 1 ${cx} ${cy + R}`],
      [`M${cx - R} ${cy} H${xl} V${yEnd} H${mid}`, true],
      [`M${cx + R} ${cy} H${xr} V${yEnd} H${mid}`, true],
      [`M${xl} ${yEnd - cr} A${cr} ${cr} 0 0 1 ${xl + cr} ${yEnd}`],
      [`M${xr} ${yEnd - cr} A${cr} ${cr} 0 0 0 ${xr - cr} ${yEnd}`],
      [`M${mid} ${acy - ra} A${ra} ${ra} 0 0 0 ${mid - adx} ${by}`],
      [`M${mid} ${acy - ra} A${ra} ${ra} 0 0 1 ${mid + adx} ${by}`],
      [`M${mid} ${by} H${bx0} V${yEnd}`],
      [`M${mid} ${by} H${bx1} V${yEnd}`],
      [`M${mid} ${yEnd - ga} H${mid - gw / 2} V${yEnd}`],
      [`M${mid} ${yEnd - ga} H${mid + gw / 2} V${yEnd}`]
    ];
    cal = defs.map(([d, withTip]) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d); svg.append(path);
      const len = path.getTotalLength(), n = Math.max(2, Math.ceil(len / 6));
      const L = new Float32Array(n + 1), T = new Float32Array(n + 1);
      let prev = null, t = 0;
      for (let i = 0; i <= n; i++) {
        const l = len * i / n, pt = path.getPointAtLength(l);
        if (!prev) t = pt.y;
        else t = Math.min(Math.max(t + Math.max(0, pt.y - prev.y) + Math.abs(pt.x - prev.x) * .35, pt.y), pt.y + 90);
        L[i] = l; T[i] = t; prev = pt;
      }
      path.style.strokeDasharray = `${len + 1} ${len + 1}`;
      path.style.strokeDashoffset = len;
      let tip = null;
      if (withTip) { tip = document.createElementNS(NS, 'circle'); tip.setAttribute('r', '3.5'); tip.setAttribute('class', 'tip'); svg.append(tip); }
      return { path, len, L, T, n, drawn: -1, tip, tipOn: false };
    });
    drawCal();
  }
  function drawCal() {
    if (!cal.length) return;
    const target = innerHeight * .72 - pitch.getBoundingClientRect().top;
    cal.forEach(cp => {
      let l;
      if (RM.matches) l = cp.len;
      else if (target <= cp.T[0]) l = 0;
      else if (target >= cp.T[cp.n]) l = cp.len;
      else {
        let lo = 0, hi = cp.n;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cp.T[m] <= target) lo = m; else hi = m; }
        const f = (target - cp.T[lo]) / Math.max(1e-6, cp.T[hi] - cp.T[lo]);
        l = cp.L[lo] + (cp.L[hi] - cp.L[lo]) * clamp(f, 0, 1);
      }
      if (Math.abs(l - cp.drawn) < .5 && !((l === cp.len || l === 0) && l !== cp.drawn)) return;
      cp.drawn = l;
      cp.path.style.strokeDashoffset = (cp.len - l).toFixed(1);
      cp.path.style.visibility = l < .5 ? 'hidden' : '';     // sem o pontinho da ponta redonda antes de começar
      if (cp.tip) {
        const on = l > 2 && l < cp.len - 2;
        if (on) { const pt = cp.path.getPointAtLength(l); cp.tip.setAttribute('cx', pt.x.toFixed(1)); cp.tip.setAttribute('cy', pt.y.toFixed(1)); }
        if (on !== cp.tipOn) { cp.tipOn = on; cp.tip.classList.toggle('on', on); }
      }
    });
  }
  let calTimer = null;
  const rebuild = () => { clearTimeout(calTimer); calTimer = setTimeout(buildCal, 120); };
  new ResizeObserver(rebuild).observe(pitch);
  document.fonts.ready.then(rebuild);
  addEventListener('load', rebuild);
  whileVisible(pitch, drawCal);

  // ---------- teu nome na camisa ----------
  const shirt = $('.shirt');
  if (shirt) {
    const stageS = $('.shirt-stage', shirt), imgs = $$('.shirt-img', shirt);
    const nameOut = $('.shirt-name span', shirt), numOut = $('.shirt-num', shirt), cap = $('figcaption', shirt);
    const nameIn = $('#f-nome'), numIn = $('#f-num'), form = $('.shirt-form');
    const clean = v => v.toUpperCase().replace(/[^A-ZÀ-Ý0-9 .'-]/g, '').replace(/\s{2,}/g, ' ').slice(0, 12);
    let kit = '1';
    const fit = () => {
      nameOut.style.setProperty('--fit', '1');
      const max = stageS.clientWidth * .4, w = nameOut.offsetWidth;
      nameOut.style.setProperty('--fit', (w > max ? max / w : 1).toFixed(3));
    };
    const render = () => {
      const name = clean(nameIn.value).trim() || 'TORCEDOR';
      const raw = numIn.value.replace(/\D/g, '').slice(0, 2);
      const num = String(clamp(parseInt(raw, 10) || 10, 1, 99));
      if (nameOut.textContent !== name) nameOut.textContent = name;
      if (numOut.textContent !== num) numOut.textContent = num;
      fit();
      cap.textContent = `Camisa ${kit} com o nome ${name} e o número ${num}.`;
    };
    nameIn.addEventListener('input', () => { const v = clean(nameIn.value); if (v !== nameIn.value) nameIn.value = v; render(); });
    numIn.addEventListener('input', () => { const v = numIn.value.replace(/\D/g, '').slice(0, 2); if (v !== numIn.value) numIn.value = v; render(); });
    form.addEventListener('change', e => {
      if (e.target.name !== 'kit') return;
      kit = e.target.value; shirt.dataset.kit = kit;
      imgs.forEach(im => im.classList.toggle('on', im.dataset.kit === kit));
      render();
    });
    form.addEventListener('submit', e => e.preventDefault());
    new ResizeObserver(fit).observe(stageS);
    document.fonts.ready.then(fit);
  }

  // ---------- movimento reduzido virado ao vivo ----------
  RM.addEventListener('change', () => {
    if (RM.matches) {
      counted.forEach(el => el._show && el._show(+el.dataset.count));
      $$('.live').forEach(el => el.classList.remove('is-live'));
      $$('.reveal').forEach(el => el.classList.add('in', 'settled'));
    } else {
      armCounters();
    }
    drawCal();
    onPageScroll();
  });
})();
