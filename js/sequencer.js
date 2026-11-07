(() => {
  'use strict';
  const root = document.getElementById('sequencer');
  if (!root) return;
  const tracks = [
    { name: 'KICK', label: 'Бочка', color: '#ff8052' },
    { name: 'SNARE', label: 'Малый барабан', color: '#d5e5a8' },
    { name: 'HI-HAT', label: 'Хай-хэт', color: '#a7c6df' },
    { name: 'BASS', label: 'Бас', color: '#c8ba9c' }
  ];
  const presets = {
    trap: { bpm: 140, steps: [[0, 6, 8, 14], [4, 12], [0, 2, 4, 6, 8, 10, 11, 12, 14, 15], [0, 6, 8, 14]] },
    house: { bpm: 124, steps: [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14], [0, 3, 4, 7, 8, 11, 12, 15]] },
    chill: { bpm: 82, steps: [[0, 7, 8, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [0, 7, 8, 10]] }
  };
  let pattern = presets.trap.steps.map(row => Array.from({ length: 16 }, (_, i) => row.includes(i)));
  let muted = [false, false, false, false];
  let currentPreset = 'trap';
  let bpm = 140;
  let volume = 0.65;
  let context, master, compressor, analyser, noiseBuffer;
  const trackGains = [];
  const sources = new Set();
  let playing = false;
  let starting = false;
  let timer = null;
  let frame = null;
  let nextTime = 0;
  let step = 0;
  let lastVisual = -1;
  const queue = [];
  const grid = document.getElementById('seq-grid');
  const numbers = document.getElementById('seq-numbers');
  const playButton = document.getElementById('seq-play');
  const playLabel = document.getElementById('play-label');
  const bpmInput = document.getElementById('seq-bpm');
  const volumeInput = document.getElementById('seq-volume');
  const status = document.getElementById('seq-status');
  numbers.innerHTML = Array.from({ length: 16 }, (_, i) => `<span data-beat="${i}">${PL.pad(i + 1)}</span>`).join('');
  tracks.forEach((track, row) => {
    const el = document.createElement('div');
    el.className = 'seq-row';
    el.style.setProperty('--track-color', track.color);
    el.innerHTML = `<button class="track-label" data-mute="${row}" aria-pressed="false" aria-label="Заглушить: ${track.label}" title="Включить / заглушить дорожку"><i></i>${track.name}${PL.icon('volume-off')}</button><div class="seq-steps">${pattern[row].map((on, col) => `<button class="seq-step" data-row="${row}" data-step="${col}" aria-pressed="${on}" aria-label="${track.label}, шаг ${col + 1}"></button>`).join('')}</div>`;
    grid.append(el);
  });
  const stepButtons = [...grid.querySelectorAll('.seq-step')];
  const beatNumbers = [...numbers.children];
  const rows = [...grid.querySelectorAll('.seq-row')];

  async function initAudio() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Этот браузер не поддерживает Web Audio. Попробуйте Chrome, Firefox или Safari.');
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = volume * 0.65;
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 15;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      master.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(context.destination);
      tracks.forEach((_, i) => {
        const gain = context.createGain();
        gain.gain.value = muted[i] ? 0 : 1;
        gain.connect(master);
        trackGains[i] = gain;
      });
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (context.state !== 'running') await context.resume();
    if (context.state !== 'running') throw new Error('Браузер не разрешил звук. Нажмите «Играть» ещё раз.');
  }
  function own(source, envelope, extras = []) {
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
      envelope.disconnect();
      extras.forEach(node => node.disconnect());
    };
  }
  function kick(time) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.13);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.95, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
    osc.connect(gain); gain.connect(trackGains[0]);
    own(osc, gain); osc.start(time); osc.stop(time + 0.4);
  }
  function snare(time) {
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 1300;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.48, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.17);
    noise.connect(filter); filter.connect(gain); gain.connect(trackGains[1]);
    own(noise, gain, [filter]); noise.start(time); noise.stop(time + 0.19);
    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = 'triangle'; body.frequency.setValueAtTime(185, time);
    bodyGain.gain.setValueAtTime(0.28, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    body.connect(bodyGain); bodyGain.connect(trackGains[1]);
    own(body, bodyGain); body.start(time); body.stop(time + 0.1);
  }
  function hat(time) {
    const noise = context.createBufferSource(); noise.buffer = noiseBuffer;
    const filter = context.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 7200;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.17, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
    noise.connect(filter); filter.connect(gain); gain.connect(trackGains[2]);
    own(noise, gain, [filter]); noise.start(time); noise.stop(time + 0.07);
  }
  function bass(time, col) {
    const osc = context.createOscillator(); osc.type = 'triangle';
    const note = [65.41, 65.41, 77.78, 58.27][Math.floor(col / 4)];
    osc.frequency.setValueAtTime(note * 1.4, time);
    osc.frequency.exponentialRampToValueAtTime(note, time + 0.045);
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 480;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.48, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
    osc.connect(filter); filter.connect(gain); gain.connect(trackGains[3]);
    own(osc, gain, [filter]); osc.start(time); osc.stop(time + 0.34);
  }
  const voices = [kick, snare, hat, bass];
  function scheduleStep(col, time) {
    pattern.forEach((row, i) => { if (row[col] && !muted[i]) voices[i](time, col); });
    queue.push({ col, time });
  }
  function scheduler() {
    if (!playing) return;
    // If a background tab was throttled, skip overdue notes instead of stacking them.
    if (nextTime < context.currentTime - 0.15) { nextTime = context.currentTime + 0.02; queue.length = 0; }
    while (nextTime < context.currentTime + 0.12) {
      scheduleStep(step, nextTime);
      nextTime += 60 / bpm / 4;
      step = (step + 1) % 16;
    }
  }
  function highlight(col) {
    if (lastVisual === col) return;
    if (lastVisual >= 0) {
      stepButtons.forEach((button, i) => { if (i % 16 === lastVisual) button.classList.remove('current'); });
      beatNumbers[lastVisual].classList.remove('current');
    }
    if (col >= 0) {
      stepButtons.forEach((button, i) => { if (i % 16 === col) button.classList.add('current'); });
      beatNumbers[col].classList.add('current');
    }
    lastVisual = col;
  }
  function draw() {
    if (!playing) return;
    while (queue.length && queue[0].time <= context.currentTime) highlight(queue.shift().col);
    frame = requestAnimationFrame(draw);
  }
  function updateTransport() {
    root.classList.toggle('playing', playing);
    playButton.innerHTML = `${PL.icon(playing ? 'pause' : 'play')}<span id="play-label">${playing ? 'Пауза' : 'Играть'}</span>`;
    playButton.setAttribute('aria-label', playing ? 'Остановить ритм' : 'Воспроизвести ритм');
    status.textContent = playing ? 'ИГРАЕТ ТВОЙ ГРУВ' : 'ГОТОВ К ИГРЕ';
  }
  function stop() {
    playing = false;
    clearInterval(timer); timer = null;
    cancelAnimationFrame(frame); frame = null;
    queue.length = 0;
    if (context && master) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, 0.008);
      for (const source of sources) { try { source.stop(context.currentTime + 0.025); } catch {} }
    }
    step = 0;
    highlight(-1);
    updateTransport();
  }
  async function play() {
    if (starting) return;
    if (playing) { stop(); return; }
    starting = true; playButton.disabled = true;
    try {
      await initAudio();
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(volume * 0.65, context.currentTime, 0.01);
      playing = true;
      nextTime = context.currentTime + 0.05;
      step = 0;
      scheduler();
      timer = setInterval(scheduler, 25);
      draw();
      updateTransport();
    } catch (err) { stop(); PL.toast(err.message || 'Не удалось включить звук.', 'error'); }
    finally { starting = false; playButton.disabled = false; }
  }
  function updatePattern() {
    stepButtons.forEach(button => button.setAttribute('aria-pressed', String(pattern[Number(button.dataset.row)][Number(button.dataset.step)])));
    document.querySelectorAll('[data-preset]').forEach(button => {
      const active = button.dataset.preset === currentPreset;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function loadPreset(name) {
    const preset = presets[name];
    if (!preset) return;
    currentPreset = name;
    pattern = preset.steps.map(row => Array.from({ length: 16 }, (_, i) => row.includes(i)));
    bpm = preset.bpm; bpmInput.value = bpm; document.getElementById('bpm-value').value = bpm;
    updatePattern();
  }
  grid.addEventListener('click', event => {
    const button = event.target.closest('.seq-step');
    if (button) {
      const row = Number(button.dataset.row), col = Number(button.dataset.step);
      pattern[row][col] = !pattern[row][col];
      button.setAttribute('aria-pressed', String(pattern[row][col]));
      currentPreset = null;
      document.querySelectorAll('[data-preset]').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-pressed', 'false'); });
      return;
    }
    const mute = event.target.closest('[data-mute]');
    if (mute) {
      const row = Number(mute.dataset.mute);
      muted[row] = !muted[row];
      mute.setAttribute('aria-pressed', String(muted[row]));
      mute.setAttribute('aria-label', `${muted[row] ? 'Включить' : 'Заглушить'}: ${tracks[row].label}`);
      rows[row].classList.toggle('muted', muted[row]);
      if (context) trackGains[row].gain.setTargetAtTime(muted[row] ? 0 : 1, context.currentTime, 0.01);
    }
  });
  grid.addEventListener('keydown', event => {
    const button = event.target.closest('.seq-step');
    if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    let row = Number(button.dataset.row), col = Number(button.dataset.step);
    if (event.key === 'ArrowLeft') col = (col + 15) % 16;
    if (event.key === 'ArrowRight') col = (col + 1) % 16;
    if (event.key === 'ArrowUp') row = (row + 3) % 4;
    if (event.key === 'ArrowDown') row = (row + 1) % 4;
    grid.querySelector(`[data-row="${row}"][data-step="${col}"]`).focus();
  });
  playButton.addEventListener('click', play);
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => loadPreset(button.dataset.preset)));
  document.getElementById('seq-reset').addEventListener('click', () => {
    loadPreset(currentPreset || 'trap');
    muted = [false, false, false, false];
    rows.forEach((row, i) => { row.classList.remove('muted'); const button = row.querySelector('[data-mute]'); button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `Заглушить: ${tracks[i].label}`); if (context) trackGains[i].gain.value = 1; });
    if (!playing) highlight(-1);
    PL.toast('Исходный ритм восстановлен.');
  });
  document.getElementById('seq-random').addEventListener('click', () => {
    const probabilities = [0.27, 0.17, 0.62, 0.22];
    pattern = probabilities.map((probability, row) => Array.from({ length: 16 }, (_, col) => row === 1 ? col === 4 || col === 12 : Math.random() < probability));
    pattern[0][0] = true; pattern[3][0] = true;
    currentPreset = null; updatePattern();
    PL.toast('Новый грув. Подвигай шаги под себя.');
  });
  bpmInput.addEventListener('input', () => { bpm = Number(bpmInput.value); document.getElementById('bpm-value').value = bpm; });
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value) / 100;
    document.getElementById('volume-value').value = `${Math.round(volume * 100)}%`;
    if (context && playing) master.gain.setTargetAtTime(volume * 0.65, context.currentTime, 0.015);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });
  window.addEventListener('pagehide', stop);
  window.PL.getAudioAnalyser = () => playing ? analyser : null;
})();
