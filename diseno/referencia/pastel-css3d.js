// PROTOTIPO del mockup, en CSS 3D. NO es el código de producción.
// En producción se reimplementa con react-three-fiber (luz, sombras, materiales y bordes redondeados),
// pero conservando este comportamiento por etapas, que es lo que importa:
//   data-etapa: pan → relleno → cobertura → decoracion → final
//   pan: solo el pan (vainilla, chocolate, choco_vainilla en dos capas, choco_pinguino, red_velvet), con matiz por tipo (tres_leches, envinado)
//   relleno: franja al centro de cada piso; dos sabores = mitad y mitad; con queso o flan = capa de crema alrededor
//   cobertura: crema pastelera en el color elegido + borde inferior de perlas
//   decoracion: flores, chispas o patrón con duya; mensaje y oblea sobre la tapa (forma, tamaño y posición)
//   final: pastel completo, cámara intermedia y la vela con la flama de la marca (solo aquí)
// Ver docs/libro-de-marca.md ("Diseña tu pastel") y mockup/capturas/ para cada etapa.
class Prototipo {
  construirPastel(root) {
    const cake = root.querySelector('.cake3d'); if (!cake || cake.childElementCount) return null;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const at = (k, d) => root.getAttribute(k) || d;
    const num = (k, d) => parseFloat(at(k, String(d)));
    const NIV = { pan: 0, relleno: 1, cobertura: 2, decoracion: 3, final: 4 };
    const N = NIV[at('data-etapa', 'final')] === undefined ? 4 : NIV[at('data-etapa', 'final')];
    const mezcla = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const rgb = (c) => 'rgb(' + c.join(',') + ')';
    const luz = (par, k) => mezcla(par[1], par[0], k);
    const COB = { blanco: [[255,251,251],[224,206,190]], amarillo: [[250,228,150],[206,174,92]], azulfuerte: [[74,112,186],[42,70,134]], azulclaro: [[176,208,236],[124,160,198]], verde: [[166,206,152],[112,158,100]], naranja: [[246,176,108],[200,124,64]], cafe: [[156,110,80],[106,72,48]], turquesa: [[110,202,198],[64,150,148]], rojo: [[212,76,72],[158,44,42]], rosa: [[246,184,202],[204,132,156]], lila: [[204,186,228],[152,132,182]] };
    const PAN = { vainilla: [[240,206,138],[196,150,84]], chocolate: [[128,84,56],[82,50,32]], choco_pinguino: [[96,60,42],[58,36,24]], red_velvet: [[184,54,58],[122,30,36]] };
    const tipo = at('data-tipo', ''), panK = at('data-pan', 'vainilla');
    const tinte = (par) => tipo === 'envinado' ? par.map((c) => mezcla(c, [126, 40, 58], 0.2)) : tipo === 'tres_leches' ? par.map((c) => mezcla(c, [255, 246, 226], 0.12)) : par;
    const panArriba = tinte(panK === 'choco_vainilla' ? PAN.vainilla : (PAN[panK] || PAN.vainilla));
    const panAbajo = tinte(panK === 'choco_vainilla' ? PAN.chocolate : (PAN[panK] || PAN.vainilla));
    const REL = { durazno: [246,176,84], fresa: [226,84,104], zarzamora: [112,44,90], cajeta: [188,118,48], galleta: [206,168,118], chocolate: [92,56,38], choco_vainilla: [150,104,70], capuchino: [170,122,86], fresa_yogurt: [240,164,178], nuez: [176,138,96], helado: [110,70,50], red_velvet: [250,246,238] };
    const BASEREL = { queso: [250,244,226], flan: [242,200,96] };
    const sabores = at('data-relleno', '').split('|').filter(Boolean).map((s) => REL[s] || REL.durazno);
    const baseRel = BASEREL[at('data-relleno-base', '')] || null;
    const cob = COB[at('data-cobertura', 'blanco')] || COB.blanco;
    const deco = at('data-deco', 'ninguna'), forma = at('data-forma', 'redondo');
    const CHISPAS = 'radial-gradient(circle,#f9c1c1 2px,transparent 2.6px) 0 0/16px 16px,radial-gradient(circle,#d24d47 2px,transparent 2.6px) 8px 8px/16px 16px,radial-gradient(circle,#6ecac6 1.6px,transparent 2.2px) 4px 11px/16px 16px';
    const pisos = Math.max(1, Math.min(5, parseInt(at('data-pisos', '2'), 10)));
    const DIM = [{ r: 150, h: 104 }, { r: 118, h: 90 }, { r: 90, h: 80 }, { r: 66, h: 70 }, { r: 46, h: 62 }];
    let alto = 0; const tiers = DIM.slice(0, pisos).map((d) => { const t = Object.assign({ base: -alto }, d); alto += d.h; return t; });
    const ajuste = Math.min(1, 300 / alto), tope = tiers[tiers.length - 1];
    const faces = [], groups = [];
    const lado = (g, a, w, h, dist, extra) => { const f = document.createElement('div'); f.className = 'face';
      Object.assign(f.style, { width: w + 'px', height: h + 'px', marginLeft: -w / 2 + 'px', marginTop: -h / 2 + 'px', transform: 'rotateY(' + a + 'deg) translateZ(' + dist + 'px)' });
      g.appendChild(f); faces.push(Object.assign({ el: f, a: a }, extra)); };
    const cyl = (g, r, h, n, extra) => { const w = 2 * Math.PI * r / n + 1.4; for (let i = 0; i < n; i++) lado(g, i * 360 / n, w, h, r, Object.assign({ mitad: i < n / 2 ? 0 : 1 }, extra)); };
    const dims = (t) => forma === 'rect' ? [t.r * 2.1, t.r * 1.4] : [2 * t.r, 2 * t.r];
    const caja = (g, t, extra) => { const [W, D] = dims(t); [[0, W, D / 2], [90, D, W / 2], [180, W, D / 2], [270, D, W / 2]].forEach(([a, w, d], i) => lado(g, a, w + 1, t.h, d, Object.assign({ mitad: i < 2 ? 0 : 1 }, extra))); };
    const tapa = (g, W, D, y, fondo, redondo) => { const c = document.createElement('div'); c.className = 'cap';
      Object.assign(c.style, { width: W + 'px', height: D + 'px', marginLeft: -W / 2 + 'px', marginTop: -D / 2 + 'px', background: fondo, borderRadius: redondo ? '50%' : '6px', transform: 'translateY(' + y + 'px) rotateX(90deg)' }); g.appendChild(c); };
    const STAND = [[252,248,241],[214,196,184]];
    const stand = document.createElement('div'); cake.appendChild(stand); tapa(stand, 392, 392, 0, '#fffbfb', true);
    const plato = document.createElement('div'); stand.appendChild(plato); plato.style.transform = 'translateY(5px)'; cyl(plato, 196, 10, 48, { col: STAND });
    const col = document.createElement('div'); stand.appendChild(col); col.style.transform = 'translateY(40px)'; cyl(col, 26, 70, 18, { col: STAND });
    const pie = document.createElement('div'); stand.appendChild(pie); pie.style.transform = 'translateY(78px)'; cyl(pie, 74, 8, 30, { col: STAND }); tapa(pie, 148, 148, -4, '#f6eee5', true);
    const fila = (g, t, y, desfase) => {
      if (forma === 'rect') { const [W, D] = dims(t);
        [[0, W, D / 2], [90, D, W / 2], [180, W, D / 2], [270, D, W / 2]].forEach(([a, L, dist]) => { const n = Math.max(2, Math.round(L / 22));
          for (let i = 0; i < n; i++) { const b = document.createElement('div'); b.className = 'bead'; b.style.transform = 'rotateY(' + a + 'deg) translateX(' + (-L / 2 + (i + 0.5) * L / n) + 'px) translateZ(' + (dist + 3) + 'px) translateY(' + y + 'px)'; g.appendChild(b); } });
        return; }
      const n = Math.round(2 * Math.PI * t.r / 22);
      for (let i = 0; i < n; i++) { const b = document.createElement('div'); b.className = 'bead'; b.style.transform = 'rotateY(' + (i + desfase) * 360 / n + 'deg) translateZ(' + (t.r + 3) + 'px) translateY(' + y + 'px)'; g.appendChild(b); } };
    tiers.forEach((t) => { const g = document.createElement('div'); cake.appendChild(g); groups.push({ g: g, t: t });
      if (forma === 'rect') caja(g, t, { kind: 'piso' }); else cyl(g, t.r, t.h, 36, { kind: 'piso' });
      const [W, D] = dims(t);
      const fondo = N >= 2 ? ((deco === 'chispas' && N >= 3) ? CHISPAS + ',' + rgb(cob[0]) : rgb(cob[0])) : rgb(mezcla(panArriba[1], panArriba[0], 0.55));
      tapa(g, W, D, -t.h / 2, fondo, forma !== 'rect');
      if (N >= 2) { fila(g, t, t.h / 2 - 4, 0.5);
        if (N >= 3 && deco !== 'ninguna') fila(g, t, -t.h / 2, 0);
        if (N >= 3 && deco === 'duya') fila(g, t, 0, 0.25); }
      if (N >= 3 && deco === 'flores' && t === tope) { const n = forma === 'rect' ? 6 : 8;
        for (let i = 0; i < n; i++) { const f = document.createElement('div'); f.className = 'flor'; const rr = forma === 'rect' ? t.r * 0.62 : t.r * 0.74;
          f.style.transform = 'rotateY(' + i * 360 / n + 'deg) translateZ(' + rr + 'px) translateY(' + (-t.h / 2 - 9) + 'px)'; g.appendChild(f); } } });
    const msg = N >= 3 ? root.getAttribute('data-mensaje') : null, obl = N >= 3 ? root.getAttribute('data-oblea') : null;
    if (obl) { const r = tope.r, e = num('data-oblea-escala', 1), circ = obl === 'circulo'; const w = (circ ? r * 1.2 : r * 1.0) * e, h = circ ? w : w * 1.29; const o = document.createElement('div');
      Object.assign(o.style, { width: w + 'px', height: h + 'px', marginLeft: -w / 2 + 'px', marginTop: -h / 2 + 'px', borderRadius: circ ? '50%' : '6px', background: 'repeating-linear-gradient(135deg,#f9c1c1 0 14px,#ffdfdf 14px 28px)', boxShadow: 'inset 0 0 0 3px #fffbfb', backfaceVisibility: 'hidden',
        transform: 'translateY(' + (-tope.h / 2 - 1) + 'px) translateX(' + num('data-oblea-x', 0) * r + 'px) translateZ(' + num('data-oblea-y', 0) * r + 'px) rotateX(90deg)' }); groups[groups.length - 1].g.appendChild(o); }
    if (msg) { const r = tope.r, e = num('data-mensaje-escala', 1), w = r * 1.7; const m = document.createElement('div'); m.textContent = msg;
      Object.assign(m.style, { width: w + 'px', marginLeft: -w / 2 + 'px', marginTop: '-24px', textAlign: 'center', font: '600 ' + (22 * e) + 'px/1.1 Fraunces, Georgia, serif', color: '#664243', backfaceVisibility: 'hidden',
        transform: 'translateY(' + (-tope.h / 2 - 3) + 'px) translateX(' + num('data-mensaje-x', 0) * r + 'px) translateZ(' + num('data-mensaje-y', 0) * r + 'px) rotateX(90deg)' }); groups[groups.length - 1].g.appendChild(m); }
    const vela = document.createElement('div'); cake.appendChild(vela); if (N < 4) vela.style.display = 'none';
    const cuerpo = document.createElement('div'); Object.assign(cuerpo.style, { width: '14px', height: '54px', marginLeft: '-7px', marginTop: '-54px', borderRadius: '3px', background: 'repeating-linear-gradient(160deg,#fffbfb 0 7px,#f9c1c1 7px 14px)' }); vela.appendChild(cuerpo);
    const flama = document.createElement('div'); flama.className = 'flama'; flama.style.top = '-60px'; vela.appendChild(flama);
    const velaZ = (msg || obl) ? -tope.r * 0.55 : 0;
    let ry = forma === 'rect' ? -38 : -28 + Math.random() * 40, px = 0, py = 0, tx = 0, ty = 0, drag = null, last = performance.now(), raf = 0, visible = true;
    const onMove = (e) => { const r = root.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2; if (drag !== null) { ry += (e.clientX - drag) * 0.5; drag = e.clientX; } };
    const onDown = (e) => { drag = e.clientX; if (root.setPointerCapture) root.setPointerCapture(e.pointerId); };
    const onUp = () => { drag = null; }; const onLeave = () => { tx = 0; ty = 0; };
    root.addEventListener('pointermove', onMove); root.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp); root.addEventListener('pointercancel', onUp); root.addEventListener('pointerleave', onLeave);
    root.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { ry += e.key === 'ArrowLeft' ? -15 : 15; e.preventDefault(); } });
    const vista = at('data-vista', '');
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduce && drag === null) ry += 7 * dt;
      px += (tx - px) * 0.08; py += (ty - py) * 0.08;
      const s = (Math.min(1, root.clientWidth / 560, root.clientHeight / 600) || 0.6) * ajuste;
      const rx = (vista === 'arriba' ? -46 : vista === 'medio' ? -30 : -16) + py * 5, yaw = ry + px * 16;
      cake.style.transform = 'scale(' + s + ') rotateX(' + rx + 'deg) rotateY(' + yaw + 'deg)';
      groups.forEach((o) => { o.g.style.transform = 'translateY(' + (o.t.base - o.t.h / 2 - 2) + 'px)'; });
      vela.style.transform = 'translateY(' + (tope.base - tope.h - 2) + 'px) translateZ(' + velaZ + 'px) rotateY(' + (-yaw) + 'deg)';
      for (const f of faces) { const k = Math.pow(0.5 + 0.5 * Math.cos((f.a + yaw + 40) * Math.PI / 180), 1.15);
        if (f.kind !== 'piso') { f.el.style.background = rgb(luz(f.col, k)); continue; }
        if (N >= 2) { const c = rgb(luz(cob, k)); f.el.style.background = (deco === 'chispas' && N >= 3) ? CHISPAS + ',' + c : c; continue; }
        const pa = rgb(luz(panArriba, k)), pb = rgb(luz(panAbajo, k)), cor = rgb(mezcla(luz(panArriba, k), [70, 40, 20], 0.18));
        if (N === 0 || !sabores.length) { f.el.style.background = 'linear-gradient(' + cor + ' 0 5%,' + pa + ' 5% 50%,' + pb + ' 50% 96%,' + cor + ' 96%)'; continue; }
        const sb = rgb(mezcla(sabores[Math.min(f.mitad, sabores.length - 1)], [40, 20, 10], (1 - k) * 0.35));
        if (baseRel) { const bq = rgb(mezcla(baseRel, [60, 40, 20], (1 - k) * 0.3));
          f.el.style.background = 'linear-gradient(' + cor + ' 0 5%,' + pa + ' 5% 36%,' + bq + ' 36% 43%,' + sb + ' 43% 57%,' + bq + ' 57% 64%,' + pb + ' 64% 96%,' + cor + ' 96%)'; }
        else f.el.style.background = 'linear-gradient(' + cor + ' 0 5%,' + pa + ' 5% 42%,' + sb + ' 42% 58%,' + pb + ' 58% 96%,' + cor + ' 96%)'; }
    };
    const tick = (now) => { draw(now); raf = visible ? requestAnimationFrame(tick) : 0; };
    let io = null;
    if ('IntersectionObserver' in window) { io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }); io.observe(root); }
    draw(performance.now()); raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (io) io.disconnect(); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp); root.removeEventListener('pointerleave', onLeave); };
  }

}
