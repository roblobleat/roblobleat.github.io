(() => {
  'use strict';
  async function loadLatest() {
    try {
      const data = await PL.api('/api/catalog');
      document.querySelectorAll('[data-plugin-count]').forEach(el => { el.textContent = PL.pad(data.stats.plugins); });
      if (!data.plugins.length) return;
      document.getElementById('latest-section').hidden = false;
      document.getElementById('home-catalog-stats').textContent = `${data.stats.plugins} РЕЛИЗОВ / ${data.stats.downloads} СКАЧИВАНИЙ`;
      const latest = [...data.plugins].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
      document.getElementById('latest-grid').innerHTML = latest.map(p => PL.pluginCard(p)).join('');
    } catch { /* The landing page and sequencer remain usable if the catalog is offline. */ }
  }
  loadLatest();

  const canvas = document.getElementById('hero-wave');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, frame = null, visible = true, lastDraw = 0;
  let bins;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }
  function draw(time) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#c6e49b12'; ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 8; y < height; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    const analyser = window.PL.getAudioAnalyser?.();
    if (analyser) {
      if (!bins || bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
    }
    const count = 68;
    const gap = width / count;
    const t = reduced.matches ? 0 : time * 0.001;
    ctx.fillStyle = '#c6e49b';
    for (let i = 0; i < count; i++) {
      const x = i / (count - 1);
      const envelope = Math.pow(Math.sin(x * Math.PI), 0.65);
      const wave = Math.abs(Math.sin(i * 0.39 + t * 1.6) * Math.cos(i * 0.17 - t * 0.7));
      const idle = 3 + wave * envelope * height * 0.73;
      const value = analyser ? Math.max(2, (bins[Math.floor(i / count * bins.length)] / 255) * height * 0.9) : idle;
      ctx.globalAlpha = 0.55 + 0.45 * envelope;
      ctx.fillRect(i * gap + 1, (height - value) / 2, Math.max(1, gap * 0.43), value);
    }
    ctx.globalAlpha = 1;
  }
  function animate(time) {
    if (!visible || document.hidden || reduced.matches) { frame = null; return; }
    if (time - lastDraw > 40) { draw(time); lastDraw = time; }
    frame = requestAnimationFrame(animate);
  }
  function start() { if (!frame && visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(animate); }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) start(); }, { threshold: 0 });
  intersectionObserver.observe(canvas);
  document.addEventListener('visibilitychange', start);
  reduced.addEventListener('change', () => { draw(performance.now()); start(); });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = null; });
  window.addEventListener('pageshow', start);
  resize(); start();
})();
