// PRISM · Advanced fitness tracking
// State, logic, charts, UI, AI trainer all in one

const APP = {
  state: {},
  charts: {},
  init() {
    this.loadState();
    this.bindEvents();
    this.renderAll();
    this.updateTime();
    setInterval(() => this.updateTime(), 5000);
    this.checkInjectURL();
  },

  checkInjectURL() {
    const params = new URLSearchParams(location.search);
    const inject = params.get('inject');
    if (!inject) return;
    try {
      const json = decodeURIComponent(escape(atob(inject.replace(/-/g, '+').replace(/_/g, '/'))));
      const data = JSON.parse(json);
      this.applyClaudeData(data);
      this.toast('✓ Logged from link');
      // Clean URL so reloads don't re-inject
      history.replaceState({}, '', location.pathname);
      if (data.summary) {
        const resp = document.getElementById('ai-response');
        if (resp) {
          resp.className = 'ai-response show';
          resp.innerHTML = `<div style="font-weight:600;margin-bottom:4px">✓ Injected</div><div style="color:var(--ink-dim)">${this.escapeHtml(data.summary)}</div>`;
        }
      }
    } catch (e) {
      this.toast('Inject failed: ' + e.message);
    }
  },

  defaultState: {
    user: {
      name: 'Amos Le Blanc',
      height: 186, // cm
      age: 35,
      birthday: '1990-06-08',
      startWeight: 223, // lbs
      goalBF: 15,
      startBF: 27.5,
      fastStart: '14:00',
    },
    planStart: new Date().toISOString().split('T')[0],
    planDays: 60,
    claudeApiKey: '',
    claudeModel: 'claude-sonnet-4-6',
    logs: {},
    meals: {},
    workouts: {},
  },

  loadState() {
    const saved = localStorage.getItem('prism');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state = {
          ...JSON.parse(JSON.stringify(this.defaultState)),
          ...parsed,
          user: {...this.defaultState.user, ...(parsed.user || {})},
        };
      } catch (e) {
        this.state = JSON.parse(JSON.stringify(this.defaultState));
      }
    } else {
      this.state = JSON.parse(JSON.stringify(this.defaultState));
    }
  },

  saveState() {
    localStorage.setItem('prism', JSON.stringify(this.state));
    this.renderAll();
  },

  bindEvents() {
    // Tabs
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Settings drawer
    document.getElementById('btn-settings').addEventListener('click', () => {
      document.getElementById('drawer').classList.add('open');
      this.loadSettings();
    });
    document.getElementById('drawer-close').addEventListener('click', () => {
      document.getElementById('drawer').classList.remove('open');
    });
    document.getElementById('s-save').addEventListener('click', () => this.saveSettings());
    document.getElementById('s-export').addEventListener('click', () => this.exportData());
    document.getElementById('s-import').addEventListener('change', (e) => this.importData(e));
    document.getElementById('s-reset').addEventListener('click', () => {
      if (confirm('Reset all data to seed profile?')) {
        localStorage.clear();
        this.state = JSON.parse(JSON.stringify(this.defaultState));
        this.saveState();
        location.reload();
      }
    });

    // Daily log
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('log-picker').value = today;
    document.getElementById('log-save').addEventListener('click', () => this.saveLog());
    document.getElementById('log-prev').addEventListener('click', () => this.moveLogDate(-1));
    document.getElementById('log-next').addEventListener('click', () => this.moveLogDate(1));

    // Meal logging
    document.getElementById('meal-add').addEventListener('click', () => this.addMeal());
    // Workout logging
    document.getElementById('w-add').addEventListener('click', () => this.addWorkout());

    // Body model slider
    document.getElementById('bm-slider').addEventListener('input', (e) => {
      this.updateBodyModel(parseInt(e.target.value));
    });

    // Trainer chat
    document.getElementById('chat-send').addEventListener('click', () => this.sendChat());
    document.getElementById('chat-in').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });

    // Claude natural-language logger (text + photo)
    this._pendingImages = [];
    document.getElementById('ai-send').addEventListener('click', () => this.askClaude());
    document.getElementById('ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.askClaude();
    });
    document.getElementById('ai-photo').addEventListener('change', (e) => this.attachAIPhoto(e));

    // Drawer overlay
    document.getElementById('drawer').addEventListener('click', (e) => {
      if (e.target.id === 'drawer') document.getElementById('drawer').classList.remove('open');
    });
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`view-${tabName}`).classList.add('active');
    // Init charts / visuals if needed
    setTimeout(() => {
      if (tabName === 'weight') this.initWeightCharts();
      if (tabName === 'exercise') this.initExerciseCharts();
      if (tabName === 'diet') this.initDietCharts();
      if (tabName === 'metrics') this.initMetricsCharts();
      if (tabName === 'plan') this.initPlanChart();
      if (tabName === 'body') this.renderMorphStrip();
    }, 50);
  },

  updateTime() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const planStart = new Date(this.state.planStart);
    const daysSince = Math.floor((now - planStart) / 86400000);
    document.getElementById('chip-day').textContent = `Day ${Math.max(0, daysSince)}`;

    // Fasting window
    const [fh, fm] = this.state.user.fastStart.split(':').map(Number);
    const fastStart = new Date(now);
    fastStart.setHours(fh, fm, 0);
    if (now < fastStart) fastStart.setDate(fastStart.getDate() - 1);
    const fastEnd = new Date(fastStart);
    fastEnd.setDate(fastEnd.getDate() + 1);
    fastEnd.setHours(fh, fm, 0);

    const fastingMs = now - fastStart;
    const totalFastMs = fastEnd - fastStart;
    const fastingHours = Math.floor(fastingMs / 3600000);
    const fastingMins = Math.floor((fastingMs % 3600000) / 60000);
    const inWindow = fastingMs > 0 && fastingMs < totalFastMs;

    document.getElementById('chip-fast').textContent = inWindow
      ? `fasting · ${fastingHours}h ${fastingMins}m`
      : `fasted · ${fastingHours}h ${fastingMins}m`;

    this.updateFastingRing(fastingMs / totalFastMs);
    this.updateDailyUI(today);
  },

  updateFastingRing(percent) {
    const ring = document.getElementById('fasting-ring');
    if (ring) {
      const p = Math.round(percent * 100);
      ring.style.setProperty('--p', p);
      ring.textContent = `${p}%`;
    }
    const elapsed = document.getElementById('fast-elapsed');
    const status = document.getElementById('fast-status');
    if (elapsed && status) {
      const now = new Date();
      const [fh, fm] = this.state.user.fastStart.split(':').map(Number);
      const fastStart = new Date(now);
      fastStart.setHours(fh, fm, 0);
      if (now < fastStart) fastStart.setDate(fastStart.getDate() - 1);
      const ms = now - fastStart;
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      elapsed.textContent = `${h}h ${m}m`;
      status.textContent = percent > 0 && percent < 1 ? 'In window' : 'Fasted';
    }
  },

  updateDailyUI(today) {
    const log = this.state.logs[today] || {};
    // Fallback to latest logged weight, else starting profile
    const latest = this.getLatestLog();
    const w = log.weight || latest?.weight || this.state.user.startWeight;
    const bf = log.bf || latest?.bf || this.state.user.startBF;
    const isLive = !!log.weight;

    document.getElementById('d-weight').textContent = w.toFixed(1);
    const prev = this.getPrevLog(today);
    const prevW = prev?.weight || this.state.user.startWeight;
    const delta = w - prevW;
    const deltaStr = delta === 0
      ? (isLive ? '±0.0 lbs · logged today' : `start · ${new Date(this.state.planStart).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`)
      : delta > 0 ? `+${delta.toFixed(1)} lbs` : `${delta.toFixed(1)} lbs`;
    document.getElementById('d-delta').textContent = deltaStr;

    const lean = w * (1 - bf / 100);
    document.getElementById('d-bf').textContent = bf.toFixed(1) + '%';
    document.getElementById('d-lean').textContent = lean.toFixed(1) + ' lbs';
    // BMI: convert 186cm = 73.23in; BMI = 703 * lbs / in²
    const heightIn = this.state.user.height / 2.54;
    document.getElementById('d-bmi').textContent = (703 * w / (heightIn * heightIn)).toFixed(1);

    const goalW = lean / (1 - this.state.user.goalBF / 100);
    const toGo = w - goalW;
    document.getElementById('d-togoal').textContent = toGo > 0 ? `${toGo.toFixed(1)} lbs` : 'Goal reached!';

    this.renderBodyHero(w, bf);

    // Calories today
    const meals = (this.state.meals[today] || []);
    const workouts = (this.state.workouts[today] || []);
    const calIn = meals.reduce((s, m) => s + (m.kcal || 0), 0);
    const calOut = workouts.reduce((s, w) => s + (w.kcal || 0), 0);
    const tdee = this.estimateTDEE();
    const calOutTotal = calOut + (tdee - 2000);
    const calNet = calIn - calOutTotal;

    document.getElementById('cal-in').textContent = calIn;
    document.getElementById('cal-out').textContent = Math.round(calOutTotal);
    document.getElementById('cal-net').textContent = Math.round(calNet);
    document.getElementById('bar-in').style.width = Math.min(100, (calIn / 3500) * 100) + '%';
    document.getElementById('bar-out').style.width = Math.min(100, (calOutTotal / 3500) * 100) + '%';
    const netPct = (calNet + 3500) / 7000 * 100;
    document.getElementById('bar-net').style.width = Math.max(0, Math.min(100, netPct)) + '%';

    // Macros
    const p = meals.reduce((s, m) => s + (m.p || 0), 0);
    const c = meals.reduce((s, m) => s + (m.c || 0), 0);
    const f = meals.reduce((s, m) => s + (m.f || 0), 0);
    const macrosHtml = `
      <div class="macro"><span class="l">P</span><div class="bar"><div class="bar-fill p" style="width:${Math.min(100, (p / 200) * 100)}%"></div></div><span class="v">${p}g</span></div>
      <div class="macro"><span class="l">C</span><div class="bar"><div class="bar-fill c" style="width:${Math.min(100, (c / 300) * 100)}%"></div></div><span class="v">${c}g</span></div>
      <div class="macro"><span class="l">F</span><div class="bar"><div class="bar-fill f" style="width:${Math.min(100, (f / 100) * 100)}%"></div></div><span class="v">${f}g</span></div>
    `;
    document.getElementById('macros').innerHTML = macrosHtml;

    // Today's list
    const todayList = `
      <div class="today-row">
        <span class="lbl">Weight</span>
        <span class="val">${w ? w.toFixed(1) + ' lbs' : 'Log it'}</span>
        ${w ? '<span class="pill ok">✓</span>' : ''}
      </div>
      <div class="today-row">
        <span class="lbl">Meals (${meals.length})</span>
        <span class="val">${calIn} kcal</span>
        ${meals.length > 0 ? '<span class="pill ok">✓</span>' : '<span class="pill warn">Pending</span>'}
      </div>
      <div class="today-row">
        <span class="lbl">Exercise (${workouts.length})</span>
        <span class="val">${workouts.reduce((s, w) => s + w.mins, 0)} min</span>
        ${workouts.length > 0 ? '<span class="pill ok">✓</span>' : '<span class="pill warn">Pending</span>'}
      </div>
      <div class="today-row">
        <span class="lbl">Sleep</span>
        <span class="val">${log.sleep ? log.sleep.toFixed(1) + ' h' : 'Log it'}</span>
        ${log.sleep && log.sleep >= 7 ? '<span class="pill ok">✓</span>' : ''}
      </div>
      <div class="today-row">
        <span class="lbl">Water</span>
        <span class="val">${log.water || 0} oz</span>
        ${log.water && log.water >= 80 ? '<span class="pill ok">✓</span>' : ''}
      </div>
    `;
    document.getElementById('today-list').innerHTML = todayList;

    // Coach note
    this.updateCoachNote(today, log);

    // Recovery
    document.getElementById('r-sleep').textContent = log.sleep ? log.sleep.toFixed(1) + 'h' : '—';
    document.getElementById('r-rhr').textContent = log.rhr ? log.rhr + ' bpm' : '—';
    document.getElementById('r-hrv').textContent = log.hrv ? log.hrv + ' ms' : '—';
    document.getElementById('r-spo2').textContent = log.spo2 ? log.spo2.toFixed(1) + '%' : '—';
    document.getElementById('r-stress').textContent = log.stress ? log.stress + '/100' : '—';
    document.getElementById('r-bb').textContent = log.bb ? log.bb + '%' : '—';
  },

  updateCoachNote(today, log) {
    const elem = document.getElementById('coach-note');
    if (!log.weight) {
      elem.textContent = 'Log your weight to activate coaching insights.';
      return;
    }

    const notes = [];
    if (log.sleep && log.sleep < 6) notes.push('😴 Sleep was short—prioritize rest.');
    if (log.stress && log.stress > 70) notes.push('😰 High stress detected—consider yoga or breathing.');
    if (log.energy && log.energy < 2) notes.push('⚡ Low energy—take it easy or skip hard training.');
    if (log.sore && log.sore > 3) notes.push('💪 Muscle soreness high—mobility work recommended.');
    if (log.hrv && log.hrv < 30) notes.push('🫀 HRV low—recovery needed.');

    const meals = (this.state.meals[today] || []);
    const workouts = (this.state.workouts[today] || []);
    const calIn = meals.reduce((s, m) => s + (m.kcal || 0), 0);
    const tdee = this.estimateTDEE();

    if (calIn === 0 && workouts.length === 0) {
      notes.push('Rest day noted. Continue your pattern.');
    } else if (workouts.length === 0 && calIn > tdee * 0.8) {
      notes.push('Good nutrition intake. Training will amplify results.');
    } else if (workouts.length > 0) {
      notes.push(`✓ Trained ${workouts.length} session(s). Keep momentum.`);
    }

    elem.textContent = notes.length ? notes.join(' ') : "✨ All systems nominal. You're on track.";
  },

  estimateTDEE() {
    const u = this.state.user;
    const bmr = 10 * 101.2 + 6.25 * u.height - 5 * u.age + 5;
    return Math.round(bmr * 1.4); // Moderate activity
  },

  renderBodyHero(weight, bf) {
    if (window.THREE) {
      this.init3DBody('body-hero', weight, bf);
    } else {
      document.getElementById('body-hero').innerHTML = this.createBodySVG(weight, bf, 120);
    }
  },

  init3DBody(containerId, weight, bf) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;

    // If Three isn't loaded yet, retry on the ready event
    if (!window.THREE || !window.MarchingCubes) {
      const retry = () => this.init3DBody(containerId, weight, bf);
      window.addEventListener('three-ready', retry, {once: true});
      return;
    }

    // Cleanup previous
    if (container._three) {
      container._three.cancelled = true;
      try { container._three.renderer.dispose(); } catch(e) {}
      if (container._three.ro) container._three.ro.disconnect();
      container.innerHTML = '';
    }

    const THREE = window.THREE;
    const MarchingCubes = window.MarchingCubes;
    const W = Math.max(200, container.clientWidth || 300);
    const H = Math.max(320, container.clientHeight || 400);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
    camera.position.set(0, 0, 3.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace || 3001;
    container.appendChild(renderer.domElement);

    // Studio lighting
    scene.add(new THREE.AmbientLight(0x1a1f2e, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-3, 4, 3.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9aafcf, 0.55);
    fill.position.set(3, 1, 0.5);
    scene.add(fill);
    // Rainbow rim
    const rimL = new THREE.PointLight(0xc04dff, 2.2, 8);
    rimL.position.set(-2, 1.5, -2);
    scene.add(rimL);
    const rimR = new THREE.PointLight(0x00d4ff, 2.2, 8);
    rimR.position.set(2, 1.5, -2);
    scene.add(rimR);
    const rimBot = new THREE.PointLight(0xff2d6f, 0.8, 5);
    rimBot.position.set(0, -1.8, 1);
    scene.add(rimBot);

    // Matte mannequin material (matches reference — soft blue-gray)
    const mat = new THREE.MeshPhongMaterial({
      color: 0xbccad8,
      specular: 0x555f70,
      shininess: 30,
      flatShading: false,
    });

    // Metaballs via MarchingCubes — scalar field evaluated to smooth mesh
    const resolution = 56;
    const mc = new MarchingCubes(resolution, mat, true, true, 80000);
    mc.isolation = 80;
    mc.scale.setScalar(1.0);
    mc.position.set(0, 0, 0);

    const fatN = Math.max(0, Math.min(1, (bf - 10) / 25));
    const leanN = 1 - fatN;

    // addBall coords: 0..1 space, strength ≈ 0..1, subtract ≈ 8..20
    // Helper converts world-space coords (centered) to 0..1
    const ab = (x, y, z, strength, subtract = 12) => {
      mc.addBall(0.5 + x, 0.5 + y, 0.5 + z, strength, subtract);
    };

    // Anatomical metaball layout.
    // X = horizontal (±), Y = vertical, Z = depth (+ toward camera)
    // Coordinates in -0.5..+0.5 range centered at origin.

    // --- HEAD ---
    ab(0, 0.40, 0, 0.16);              // cranium
    ab(0, 0.34, 0.02, 0.12);           // jaw chamfer
    ab(0, 0.28, 0, 0.07);              // neck top

    // --- TRAPS / SHOULDERS ---
    ab(-0.08, 0.245, 0, 0.10);
    ab(0.08, 0.245, 0, 0.10);
    ab(-0.16, 0.22, 0, 0.13);          // deltoid L
    ab(0.16, 0.22, 0, 0.13);           // deltoid R

    // --- PECS ---
    ab(-0.07, 0.16, 0.06, 0.14);
    ab(0.07, 0.16, 0.06, 0.14);
    ab(-0.07, 0.12, 0.05, 0.10);       // pec lower fullness
    ab(0.07, 0.12, 0.05, 0.10);

    // --- RIB CAGE / UPPER TORSO ---
    ab(-0.07, 0.07, 0.03, 0.11);
    ab(0.07, 0.07, 0.03, 0.11);
    ab(-0.12, 0.02, 0, 0.09);          // serratus
    ab(0.12, 0.02, 0, 0.09);

    // --- ABS (6-pack appearance via placement; visible at low BF) ---
    const absBulge = 0.05 + leanN * 0.04;
    ab(-0.04, 0.02, 0.04 + leanN * 0.02, absBulge);
    ab(0.04, 0.02, 0.04 + leanN * 0.02, absBulge);
    ab(-0.04, -0.02, 0.04 + leanN * 0.02, absBulge);
    ab(0.04, -0.02, 0.04 + leanN * 0.02, absBulge);
    ab(-0.04, -0.06, 0.04 + leanN * 0.02, absBulge);
    ab(0.04, -0.06, 0.04 + leanN * 0.02, absBulge);

    // --- WAIST (narrow at low BF, full at high BF) ---
    const waistR = 0.08 + fatN * 0.08;
    ab(0, -0.08, 0, waistR);
    // Belly high-BF bulge
    if (fatN > 0.2) {
      ab(0, -0.06, 0.08 + fatN * 0.05, 0.11 + fatN * 0.1);
      ab(0, -0.10, 0.08 + fatN * 0.05, 0.10 + fatN * 0.08);
    }

    // --- HIPS ---
    ab(-0.10, -0.14, 0, 0.12);
    ab(0.10, -0.14, 0, 0.12);
    ab(0, -0.15, -0.06, 0.11);         // glutes

    // --- ARMS ---
    // Deltoid-to-bicep
    ab(-0.22, 0.16, 0, 0.11);
    ab(0.22, 0.16, 0, 0.11);
    // Biceps (with peak at low BF)
    const bicep = 0.08 + leanN * 0.03;
    ab(-0.26, 0.08, 0.02, bicep);
    ab(0.26, 0.08, 0.02, bicep);
    ab(-0.27, 0.02, 0, 0.08);          // triceps back
    ab(0.27, 0.02, 0, 0.08);
    // Elbows
    ab(-0.28, -0.05, 0, 0.07);
    ab(0.28, -0.05, 0, 0.07);
    // Forearms
    ab(-0.30, -0.12, 0, 0.075);
    ab(0.30, -0.12, 0, 0.075);
    ab(-0.30, -0.18, 0, 0.06);
    ab(0.30, -0.18, 0, 0.06);
    // Hands (fists)
    ab(-0.31, -0.24, 0, 0.06);
    ab(0.31, -0.24, 0, 0.06);

    // --- LEGS ---
    // Upper thigh (massive near hip)
    const thigh = 0.12 + fatN * 0.025;
    ab(-0.08, -0.22, 0, thigh);
    ab(0.08, -0.22, 0, thigh);
    // Quad bulges (low BF shows definition)
    const quad = 0.08 + leanN * 0.02;
    ab(-0.08, -0.28, 0.04, quad);
    ab(0.08, -0.28, 0.04, quad);
    // Mid thigh
    ab(-0.08, -0.34, 0, 0.095);
    ab(0.08, -0.34, 0, 0.095);
    // Knees
    ab(-0.08, -0.40, 0.01, 0.08);
    ab(0.08, -0.40, 0.01, 0.08);
    // Calves (bulges back)
    const calf = 0.085 + leanN * 0.015;
    ab(-0.08, -0.45, -0.02, calf);
    ab(0.08, -0.45, -0.02, calf);
    // Lower leg
    ab(-0.08, -0.49, 0, 0.065);
    ab(0.08, -0.49, 0, 0.065);

    // Generate the mesh
    mc.update();
    scene.add(mc);

    // Rotation group
    const body = new THREE.Group();
    body.add(mc);
    scene.add(body);

    const state = {cancelled: false, renderer, scene, container};
    container._three = state;

    const clock = new THREE.Clock();
    const animate = () => {
      if (state.cancelled) return;
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      body.rotation.y = Math.sin(t * 0.2) * 0.35; // slow sway
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(320, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);
    state.ro = ro;
  },

  createBodySVG(weight, bf, _size, tag) {
    // Minimalist elegant silhouette — no face, no hair, no cartoon detail.
    // Body morphs via silhouette shape; BF% drives waist/belly fullness.
    // Soft gradient shading gives 3D feel. Single form, premium look.
    const uid = tag || ('b' + Math.random().toString(36).slice(2, 8));
    const W = 300, H = 640;
    const cx = W / 2;

    // Normalize BF to 0..1 (10% ripped -> 35% obese)
    const fatN = Math.max(0, Math.min(1, (bf - 10) / 25));
    const leanN = 1 - fatN;
    const wN = Math.max(0, Math.min(1, (weight - 160) / 100));
    const scale = 1 + (wN - 0.5) * 0.04;

    // Proportional measurements (8-head canon)
    const shoulderW = 162 + leanN * 8;
    const chestW = 128 + fatN * 18;
    const waistW = 86 + fatN * 70;
    const hipW = 116 + fatN * 22;
    const thighW = 54 + fatN * 16;
    const calfW = 40 + fatN * 6;
    const armUpW = 32 + fatN * 8 + leanN * 6;
    const neckW = 38 + fatN * 4;

    // Vertical anchors
    const headR = 38;
    const headTop = 38;
    const chinY = headTop + headR * 2 - 2;
    const neckY = chinY;
    const shoulderY = neckY + 28;
    const pecY = shoulderY + 30;
    const pecBottomY = pecY + 42;
    const ribY = pecBottomY + 20;
    const waistY = ribY + 52;
    const hipY = waistY + 46;
    const crotchY = hipY + 14;
    const thighMidY = crotchY + 76;
    const kneeY = crotchY + 150;
    const calfMidY = kneeY + 50;
    const ankleY = kneeY + 110;

    const half = (w) => w / 2;
    const legGap = 8;

    // Main silhouette: single closed path from head through torso, legs
    // (arms are separate for cleaner silhouette)
    const silhouette = `
      M ${cx} ${headTop}
      C ${cx + headR} ${headTop}, ${cx + headR + 2} ${headTop + headR}, ${cx + headR} ${headTop + headR * 1.4}
      C ${cx + headR - 4} ${chinY - 6}, ${cx + 18} ${chinY - 2}, ${cx + neckW/2} ${neckY + 4}
      C ${cx + neckW/2 + 10} ${neckY + 14}, ${cx + half(shoulderW) - 20} ${shoulderY - 6}, ${cx + half(shoulderW)} ${shoulderY}
      C ${cx + half(chestW) + 10} ${pecY - 4}, ${cx + half(chestW) + 4} ${pecY + 12}, ${cx + half(chestW)} ${pecBottomY}
      C ${cx + half(chestW) - 2} ${ribY + 4}, ${cx + half(waistW) + 8} ${ribY + 18}, ${cx + half(waistW)} ${waistY}
      C ${cx + half(waistW) + 2} ${waistY + 14}, ${cx + half(hipW) + 4} ${hipY - 18}, ${cx + half(hipW)} ${hipY}
      C ${cx + half(hipW)} ${hipY + 10}, ${cx + half(hipW) - 4} ${crotchY - 4}, ${cx + legGap + thighW} ${crotchY}
      C ${cx + legGap + thighW + 4} ${thighMidY - 10}, ${cx + legGap + thighW} ${thighMidY + 10}, ${cx + legGap + thighW - 4} ${kneeY - 4}
      C ${cx + legGap + calfW + 4} ${calfMidY - 6}, ${cx + legGap + calfW} ${calfMidY + 16}, ${cx + legGap + calfW - 2} ${ankleY - 4}
      Q ${cx + legGap + calfW + 4} ${ankleY + 8}, ${cx + legGap + 4} ${ankleY + 8}
      Q ${cx + legGap} ${ankleY - 6}, ${cx + legGap + 4} ${calfMidY + 8}
      Q ${cx + legGap + 8} ${kneeY + 4}, ${cx + legGap} ${kneeY - 4}
      L ${cx + legGap - 2} ${hipY + 12}
      L ${cx - legGap + 2} ${hipY + 12}
      L ${cx - legGap} ${kneeY - 4}
      Q ${cx - legGap - 8} ${kneeY + 4}, ${cx - legGap - 4} ${calfMidY + 8}
      Q ${cx - legGap} ${ankleY - 6}, ${cx - legGap - 4} ${ankleY + 8}
      Q ${cx - legGap - calfW - 4} ${ankleY + 8}, ${cx - legGap - calfW + 2} ${ankleY - 4}
      C ${cx - legGap - calfW} ${calfMidY + 16}, ${cx - legGap - calfW - 4} ${calfMidY - 6}, ${cx - legGap - thighW + 4} ${kneeY - 4}
      C ${cx - legGap - thighW} ${thighMidY + 10}, ${cx - legGap - thighW - 4} ${thighMidY - 10}, ${cx - legGap - thighW} ${crotchY}
      C ${cx - half(hipW) + 4} ${crotchY - 4}, ${cx - half(hipW)} ${hipY + 10}, ${cx - half(hipW)} ${hipY}
      C ${cx - half(hipW) - 4} ${hipY - 18}, ${cx - half(waistW) - 2} ${waistY + 14}, ${cx - half(waistW)} ${waistY}
      C ${cx - half(waistW) - 8} ${ribY + 18}, ${cx - half(chestW) + 2} ${ribY + 4}, ${cx - half(chestW)} ${pecBottomY}
      C ${cx - half(chestW) - 4} ${pecY + 12}, ${cx - half(chestW) - 10} ${pecY - 4}, ${cx - half(shoulderW)} ${shoulderY}
      C ${cx - half(shoulderW) + 20} ${shoulderY - 6}, ${cx - neckW/2 - 10} ${neckY + 14}, ${cx - neckW/2} ${neckY + 4}
      C ${cx - 18} ${chinY - 2}, ${cx - headR + 4} ${chinY - 6}, ${cx - headR} ${headTop + headR * 1.4}
      C ${cx - headR - 2} ${headTop + headR}, ${cx - headR} ${headTop}, ${cx} ${headTop}
      Z`;

    // Arms (separate paths — natural gap between arm and torso at hip)
    const armL = `
      M ${cx - half(shoulderW) + 4} ${shoulderY + 2}
      C ${cx - half(shoulderW) - 10} ${pecY + 12}, ${cx - half(shoulderW) - armUpW + 4} ${pecBottomY + 16}, ${cx - half(shoulderW) - armUpW + 8} ${ribY + 12}
      C ${cx - half(shoulderW) - armUpW + 2} ${waistY + 4}, ${cx - half(shoulderW) - armUpW + 6} ${waistY + 18}, ${cx - half(shoulderW) - armUpW + 12} ${hipY - 4}
      C ${cx - half(shoulderW) - armUpW + 4} ${hipY + 10}, ${cx - half(shoulderW) - armUpW + 8} ${hipY + 24}, ${cx - half(shoulderW) - armUpW + 16} ${hipY + 32}
      Q ${cx - half(shoulderW) - armUpW + 6} ${hipY + 40}, ${cx - half(shoulderW) - armUpW + 20} ${hipY + 40}
      Q ${cx - half(shoulderW) + 6} ${hipY + 26}, ${cx - half(shoulderW) + 14} ${ribY + 8}
      C ${cx - half(shoulderW) + 24} ${pecBottomY - 4}, ${cx - half(shoulderW) + 22} ${pecY}, ${cx - half(shoulderW) + 16} ${shoulderY + 6}
      Z`;
    const armR = `
      M ${cx + half(shoulderW) - 4} ${shoulderY + 2}
      C ${cx + half(shoulderW) + 10} ${pecY + 12}, ${cx + half(shoulderW) + armUpW - 4} ${pecBottomY + 16}, ${cx + half(shoulderW) + armUpW - 8} ${ribY + 12}
      C ${cx + half(shoulderW) + armUpW - 2} ${waistY + 4}, ${cx + half(shoulderW) + armUpW - 6} ${waistY + 18}, ${cx + half(shoulderW) + armUpW - 12} ${hipY - 4}
      C ${cx + half(shoulderW) + armUpW - 4} ${hipY + 10}, ${cx + half(shoulderW) + armUpW - 8} ${hipY + 24}, ${cx + half(shoulderW) + armUpW - 16} ${hipY + 32}
      Q ${cx + half(shoulderW) + armUpW - 6} ${hipY + 40}, ${cx + half(shoulderW) + armUpW - 20} ${hipY + 40}
      Q ${cx + half(shoulderW) - 6} ${hipY + 26}, ${cx + half(shoulderW) - 14} ${ribY + 8}
      C ${cx + half(shoulderW) - 24} ${pecBottomY - 4}, ${cx + half(shoulderW) - 22} ${pecY}, ${cx + half(shoulderW) - 16} ${shoulderY + 6}
      Z`;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">
      <defs>
        <linearGradient id="body-${uid}" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0%" stop-color="#2a1838"/>
          <stop offset="35%" stop-color="#54385c"/>
          <stop offset="65%" stop-color="#8a6a8c"/>
          <stop offset="100%" stop-color="#c7a8c4"/>
        </linearGradient>
        <linearGradient id="rim-${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(192,77,255,.45)"/>
          <stop offset="50%" stop-color="rgba(255,255,255,0)"/>
          <stop offset="100%" stop-color="rgba(0,212,255,.45)"/>
        </linearGradient>
        <radialGradient id="hi-${uid}" cx="0.3" cy="0.2" r="0.7">
          <stop offset="0%" stop-color="rgba(255,255,255,.25)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
        <filter id="aura-${uid}" x="-30%" y="-10%" width="160%" height="120%">
          <feGaussianBlur stdDeviation="10"/>
        </filter>
      </defs>

      <g transform="translate(${cx},${H/2}) scale(${scale}) translate(${-cx},${-H/2})">
        <!-- Ambient rainbow aura -->
        <ellipse cx="${cx}" cy="${H * 0.52}" rx="${110 + fatN * 20}" ry="${H * 0.46}" fill="url(#rim-${uid})" filter="url(#aura-${uid})" opacity="0.5"/>

        <!-- Ground shadow -->
        <ellipse cx="${cx}" cy="${ankleY + 14}" rx="${58 + fatN * 14}" ry="5" fill="rgba(0,0,0,.5)"/>

        <!-- Back arm (right, behind) -->
        <path d="${armR}" fill="url(#body-${uid})" opacity="0.9"/>

        <!-- Main body silhouette -->
        <path d="${silhouette}" fill="url(#body-${uid})"/>

        <!-- Soft center shadow (anatomical ridge) at low BF -->
        ${leanN > 0.35 ? `
          <path d="M ${cx} ${pecY + 8} Q ${cx - 1} ${waistY}, ${cx} ${hipY - 6}"
            stroke="rgba(0,0,0,${leanN * 0.25})" stroke-width="1.5" fill="none"/>
        ` : ''}

        <!-- Belly volumetric shade at high BF -->
        ${fatN > 0.25 ? `
          <ellipse cx="${cx}" cy="${waistY + 16}" rx="${half(waistW) - 14}" ry="${22 + fatN * 16}"
            fill="rgba(0,0,0,.12)"/>
        ` : ''}

        <!-- Soft top-light highlight -->
        <path d="${silhouette}" fill="url(#hi-${uid})"/>

        <!-- Front arm (left) -->
        <path d="${armL}" fill="url(#body-${uid})"/>
        <path d="${armL}" fill="url(#hi-${uid})" opacity="0.8"/>

        <!-- Subtle rim light from rainbow sides -->
        <path d="${silhouette}" fill="none" stroke="url(#rim-${uid})" stroke-width="1.5" opacity="0.8"/>
      </g>
    </svg>`;
  },

  getPrevLog(dateStr) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    const key = date.toISOString().split('T')[0];
    return this.state.logs[key];
  },

  getLatestLog() {
    const keys = Object.keys(this.state.logs)
      .filter(k => this.state.logs[k]?.weight)
      .sort();
    if (!keys.length) return null;
    return this.state.logs[keys[keys.length - 1]];
  },

  moveLogDate(days) {
    const picker = document.getElementById('log-picker');
    const date = new Date(picker.value);
    date.setDate(date.getDate() + days);
    picker.value = date.toISOString().split('T')[0];
    this.loadLogUI();
  },

  loadLogUI() {
    const date = document.getElementById('log-picker').value;
    const log = this.state.logs[date] || {};
    const d = new Date(date);
    document.getElementById('log-date').textContent = d.toLocaleDateString('en-US', {month:'short', day:'numeric'});

    document.getElementById('in-weight').value = log.weight || '';
    document.getElementById('in-bf').value = log.bf || '';
    document.getElementById('in-waist').value = log.waist || '';
    document.getElementById('in-rhr').value = log.rhr || '';
    document.getElementById('in-hrv').value = log.hrv || '';
    document.getElementById('in-spo2').value = log.spo2 || '';
    document.getElementById('in-sleep').value = log.sleep || '';
    document.getElementById('in-sleep-score').value = log.sleepScore || '';
    document.getElementById('in-stress').value = log.stress || '';
    document.getElementById('in-bb').value = log.bb || '';
    document.getElementById('in-vo2').value = log.vo2 || '';
    document.getElementById('in-steps').value = log.steps || '';
    document.getElementById('in-akcal').value = log.akcal || '';
    document.getElementById('in-rkcal').value = log.rkcal || '';
    document.getElementById('in-water').value = log.water || '';
    document.getElementById('in-mood').value = log.mood || '';
    document.getElementById('in-energy').value = log.energy || '';
    document.getElementById('in-sore').value = log.sore || '';
    document.getElementById('in-notes').value = log.notes || '';

    this.renderMealGrid(date);
    this.renderWorkoutList(date);
  },

  saveLog() {
    const date = document.getElementById('log-picker').value;
    const log = {
      weight: parseFloat(document.getElementById('in-weight').value) || null,
      bf: parseFloat(document.getElementById('in-bf').value) || null,
      waist: parseFloat(document.getElementById('in-waist').value) || null,
      rhr: parseInt(document.getElementById('in-rhr').value) || null,
      hrv: parseInt(document.getElementById('in-hrv').value) || null,
      spo2: parseFloat(document.getElementById('in-spo2').value) || null,
      sleep: parseFloat(document.getElementById('in-sleep').value) || null,
      sleepScore: parseInt(document.getElementById('in-sleep-score').value) || null,
      stress: parseInt(document.getElementById('in-stress').value) || null,
      bb: parseInt(document.getElementById('in-bb').value) || null,
      vo2: parseFloat(document.getElementById('in-vo2').value) || null,
      steps: parseInt(document.getElementById('in-steps').value) || null,
      akcal: parseInt(document.getElementById('in-akcal').value) || null,
      rkcal: parseInt(document.getElementById('in-rkcal').value) || null,
      water: parseInt(document.getElementById('in-water').value) || null,
      mood: parseInt(document.getElementById('in-mood').value) || null,
      energy: parseInt(document.getElementById('in-energy').value) || null,
      sore: parseInt(document.getElementById('in-sore').value) || null,
      notes: document.getElementById('in-notes').value || '',
    };
    this.state.logs[date] = log;
    this.saveState();
    this.toast('Day saved ✓');
    this.updateDailyUI(date);
  },

  renderMealGrid(date) {
    const meals = this.state.meals[date] || [];
    const html = meals.map((m, i) => `
      <div class="meal">
        <div class="name">${m.name}</div>
        <div class="macs">${m.kcal}kcal | P${m.p}g C${m.c}g F${m.f}g</div>
        <button class="del" onclick="APP.removeMeal('${date}', ${i})">✕</button>
      </div>
    `).join('');
    document.getElementById('meal-grid').innerHTML = html;
  },

  addMeal() {
    const date = document.getElementById('log-picker').value;
    const name = document.getElementById('meal-name').value;
    const kcal = parseInt(document.getElementById('meal-kcal').value) || 0;
    const p = parseInt(document.getElementById('meal-p').value) || 0;
    const c = parseInt(document.getElementById('meal-c').value) || 0;
    const f = parseInt(document.getElementById('meal-f').value) || 0;
    const slot = document.getElementById('meal-slot').value;

    if (!name || !kcal) return this.toast('Enter name & kcal');
    if (!this.state.meals[date]) this.state.meals[date] = [];
    this.state.meals[date].push({name, kcal, p, c, f, slot, time: new Date().toLocaleTimeString()});
    this.saveState();
    document.getElementById('meal-name').value = '';
    document.getElementById('meal-kcal').value = '';
    document.getElementById('meal-p').value = '';
    document.getElementById('meal-c').value = '';
    document.getElementById('meal-f').value = '';
    this.renderMealGrid(date);
    this.updateDailyUI(date);
  },

  removeMeal(date, idx) {
    this.state.meals[date].splice(idx, 1);
    this.saveState();
    this.renderMealGrid(date);
  },

  renderWorkoutList(date) {
    const workouts = this.state.workouts[date] || [];
    const html = workouts.map((w, i) => `
      <div class="workout">
        <div class="name">${w.type}</div>
        <div class="stats">${w.mins}min | HR ${w.avghr}/${w.maxhr} | ${w.kcal}kcal</div>
        <button class="del" onclick="APP.removeWorkout('${date}', ${i})">✕</button>
      </div>
    `).join('');
    document.getElementById('workout-list').innerHTML = html;
  },

  addWorkout() {
    const date = document.getElementById('log-picker').value;
    const type = document.getElementById('w-type').value;
    const mins = parseInt(document.getElementById('w-mins').value) || 0;
    const avghr = parseInt(document.getElementById('w-avghr').value) || 0;
    const maxhr = parseInt(document.getElementById('w-maxhr').value) || 0;
    const kcal = parseInt(document.getElementById('w-kcal').value) || 0;
    const load = parseInt(document.getElementById('w-load').value) || 0;
    const notes = document.getElementById('w-notes').value;

    if (!mins) return this.toast('Enter duration');
    if (!this.state.workouts[date]) this.state.workouts[date] = [];
    this.state.workouts[date].push({type, mins, avghr, maxhr, kcal, load, notes, time: new Date().toLocaleTimeString()});
    this.saveState();
    document.getElementById('w-type').value = 'Zone 2 cardio';
    document.getElementById('w-mins').value = '';
    document.getElementById('w-avghr').value = '';
    document.getElementById('w-maxhr').value = '';
    document.getElementById('w-kcal').value = '';
    document.getElementById('w-load').value = '';
    document.getElementById('w-notes').value = '';
    this.renderWorkoutList(date);
    this.updateDailyUI(date);
  },

  removeWorkout(date, idx) {
    this.state.workouts[date].splice(idx, 1);
    this.saveState();
    this.renderWorkoutList(date);
  },

  // Charts
  initWeightCharts() {
    const data = this.getWeightData(60);
    const ctx = document.getElementById('chart-weight-lg');
    if (!ctx) return;
    if (this.charts.weightLg) this.charts.weightLg.destroy();
    this.charts.weightLg = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Weight (lbs)',
            data: data.weights,
            borderColor: '#ff2d6f',
            backgroundColor: 'rgba(255, 45, 111, 0.1)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#ff2d6f',
          },
          {
            label: 'BF% (goal)',
            data: data.bfs,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.05)',
            yAxisID: 'y1',
            tension: 0.35,
            pointRadius: 2,
            pointBackgroundColor: '#00d4ff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        animation: {duration: 400},
        plugins: {legend: {display: true, position: 'top', labels: {color: '#c9bff0', boxWidth: 12}}},
        scales: {
          y: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
          y1: {position: 'right', ticks: {color: '#8c83b8'}, grid: {display: false}},
          x: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
        },
      },
    });

    const ctxBF = document.getElementById('chart-bf');
    if (ctxBF) {
      if (this.charts.bf) this.charts.bf.destroy();
      // Inject a goal line of 15% BF
      this.charts.bf = new Chart(ctxBF, {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [
            {
              label: 'Body fat %',
              data: data.bfs.map(x => x ?? null),
              borderColor: '#00d4ff',
              backgroundColor: 'rgba(0, 212, 255, 0.15)',
              fill: true,
              tension: 0.35,
              spanGaps: true,
              pointRadius: 3,
              pointBackgroundColor: '#00d4ff',
            },
            {
              label: 'Goal',
              data: data.labels.map(() => this.state.user.goalBF),
              borderColor: 'rgba(51,255,153,.6)',
              borderDash: [4,4],
              pointRadius: 0,
            },
          ],
        },
        options: this.chartOpts(true),
      });
    }

    // Waist chart
    const ctxW = document.getElementById('chart-waist');
    if (ctxW) {
      if (this.charts.waist) this.charts.waist.destroy();
      const waists = Object.keys(this.state.logs).sort()
        .map(k => ({label: k.slice(5), v: this.state.logs[k].waist}))
        .filter(x => x.v);
      this.charts.waist = new Chart(ctxW, {
        type: 'line',
        data: {
          labels: waists.length ? waists.map(x => x.label) : ['—'],
          datasets: [{
            label: 'Waist (in)',
            data: waists.length ? waists.map(x => x.v) : [42],
            borderColor: '#ffd400',
            backgroundColor: 'rgba(255, 212, 0, 0.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          }],
        },
        options: this.chartOpts(),
      });
    }

    // Weight history table
    const tbody = document.querySelector('#tbl-weights tbody');
    if (tbody) {
      const keys = Object.keys(this.state.logs).filter(k => this.state.logs[k].weight).sort().reverse();
      const rows = keys.map((k, i) => {
        const l = this.state.logs[k];
        const prev = keys[i+1] ? this.state.logs[keys[i+1]].weight : null;
        const wk = keys[i+7] ? this.state.logs[keys[i+7]].weight : null;
        const d1 = prev ? (l.weight - prev).toFixed(1) : '—';
        const d7 = wk ? (l.weight - wk).toFixed(1) : '—';
        const lean = l.bf ? (l.weight * (1 - l.bf/100)).toFixed(1) : '—';
        return `<tr><td>${k}</td><td>${l.weight.toFixed(1)}</td><td>${d1}</td><td>${d7}</td><td>${l.bf ? l.bf.toFixed(1)+'%' : '—'}</td><td>${lean}</td><td>${l.waist ? l.waist.toFixed(1) : '—'}</td></tr>`;
      });
      tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7" style="text-align:center;color:var(--ink-mute)">No weigh-ins yet. Log your first via Daily Log tab.</td></tr>';
    }
  },

  getWeightData(days) {
    const labels = [];
    const weights = [];
    const bfs = [];
    const projected = [];
    const start = new Date(this.state.planStart);
    const startW = this.state.user.startWeight;
    const startBF = this.state.user.startBF;
    const goalBF = this.state.user.goalBF;
    const leanMass = startW * (1 - startBF / 100);
    const goalW = leanMass / (1 - goalBF / 100);
    const totalDays = Math.max(1, (startW - goalW) / 0.5);

    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const log = this.state.logs[key];
      labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
      weights.push(log?.weight || null);
      bfs.push(log?.bf || null);
      const projW = Math.max(goalW, startW - (startW - goalW) * Math.min(1, i / totalDays));
      projected.push(+projW.toFixed(1));
    }
    return {labels, weights, bfs, projected};
  },

  initExerciseCharts() {
    const ctx = document.getElementById('chart-load');
    if (!ctx) return;
    if (this.charts.load) this.charts.load.destroy();
    const {labels, load} = this.getLoadData(60);
    this.charts.load = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Training load',
          data: load,
          backgroundColor: load.map((_,i) => `hsl(${(i*8)%360}, 80%, 60%)`),
          borderRadius: 4,
        }],
      },
      options: this.chartOpts(),
    });
    this.renderZones();
  },

  getLoadData(days) {
    const labels = [], load = [];
    const start = new Date(this.state.planStart);
    for (let i = 0; i <= days; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const ws = this.state.workouts[key] || [];
      labels.push(d.toLocaleDateString('en-US', {month:'short', day:'numeric'}));
      load.push(ws.reduce((s,w) => s + (w.load || w.mins || 0), 0));
    }
    return {labels, load};
  },

  renderZones() {
    const zones = [0,0,0,0,0]; // Z1–Z5
    Object.values(this.state.workouts).flat().forEach(w => {
      const hr = w.avghr || 0;
      const maxHr = 220 - this.state.user.age;
      const pct = hr / maxHr;
      let z = 0;
      if (pct < 0.6) z = 0;
      else if (pct < 0.7) z = 1;
      else if (pct < 0.8) z = 2;
      else if (pct < 0.9) z = 3;
      else z = 4;
      zones[z] += (w.mins || 0);
    });
    const total = Math.max(1, zones.reduce((a,b)=>a+b,0));
    const el = document.getElementById('zones');
    if (el) {
      el.innerHTML = ['Z1','Z2','Z3','Z4','Z5'].map((n, i) => `
        <div class="zone">
          <span class="l">${n}</span>
          <div class="bar"><div class="bar-fill z${i+1}" style="width:${(zones[i]/total)*100}%"></div></div>
          <span class="v">${zones[i]}m</span>
        </div>
      `).join('');
    }
    const tbody = document.querySelector('#tbl-workouts tbody');
    if (tbody) {
      const rows = [];
      Object.keys(this.state.workouts).sort().reverse().forEach(date => {
        this.state.workouts[date].forEach(w => {
          rows.push(`<tr><td>${date}</td><td>${w.type}</td><td>${w.mins}</td><td>${w.avghr||'-'}</td><td>${w.maxhr||'-'}</td><td>${w.kcal||'-'}</td><td>${w.load||'-'}</td><td>${w.notes||''}</td></tr>`);
        });
      });
      tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8" style="text-align:center;color:var(--ink-mute)">No workouts logged yet.</td></tr>';
    }
  },

  initDietCharts() {
    const ctx = document.getElementById('chart-cals');
    if (!ctx) return;
    if (this.charts.cals) this.charts.cals.destroy();
    const {labels, ins, outs} = this.getCalData(14);
    this.charts.cals = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {label:'In', data: ins, backgroundColor:'rgba(255,122,26,.8)', borderRadius:4},
          {label:'Out', data: outs.map(x => -x), backgroundColor:'rgba(0,212,255,.8)', borderRadius:4},
        ],
      },
      options: {...this.chartOpts(true), scales: {...this.chartOpts().scales, x:{...this.chartOpts().scales.x, stacked:true}, y:{...this.chartOpts().scales.y, stacked:true}}},
    });

    // Macros chart
    const mx = document.getElementById('chart-macros');
    if (mx) {
      if (this.charts.macrosChart) this.charts.macrosChart.destroy();
      const md = this.getMacroData(14);
      this.charts.macrosChart = new Chart(mx, {
        type: 'line',
        data: {labels: md.labels, datasets: [
          {label:'P', data: md.p, borderColor:'#ff2d6f', tension:.35, fill:false},
          {label:'C', data: md.c, borderColor:'#ffd400', tension:.35, fill:false},
          {label:'F', data: md.f, borderColor:'#00d4ff', tension:.35, fill:false},
        ]},
        options: this.chartOpts(true),
      });
    }

    // Fasting grid
    const fg = document.getElementById('fast-grid');
    if (fg) {
      const html = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const meals = this.state.meals[key] || [];
        const ok = meals.length === 0 || !meals.some(m => {
          const [h] = (m.time||'00:00').split(':').map(Number);
          return h < 14;
        });
        html.push(`<div class="f ${ok && (meals.length > 0 || i === 0) ? 'ok' : i < 7 && meals.length === 0 ? '' : 'miss'}" title="${key}"></div>`);
      }
      fg.innerHTML = html.join('');
    }

    // Meal table
    const tbody = document.querySelector('#tbl-meals tbody');
    if (tbody) {
      const rows = [];
      Object.keys(this.state.meals).sort().reverse().forEach(date => {
        this.state.meals[date].forEach(m => {
          rows.push(`<tr><td>${date}</td><td>${m.slot||'-'}</td><td>${m.name}</td><td>${m.kcal}</td><td>${m.p||0}</td><td>${m.c||0}</td><td>${m.f||0}</td></tr>`);
        });
      });
      tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="7" style="text-align:center;color:var(--ink-mute)">No meals logged yet.</td></tr>';
    }

    const avgEl = document.getElementById('diet-avg');
    if (avgEl) {
      const total = ins.reduce((a,b)=>a+b,0);
      const avg = total / Math.max(1, ins.filter(x=>x>0).length || 14);
      avgEl.textContent = `avg ${Math.round(avg)} kcal/day`;
    }
    const targetEl = document.getElementById('diet-targets');
    if (targetEl) {
      const tdee = this.estimateTDEE();
      targetEl.textContent = `TDEE ~${tdee} · deficit ${tdee - 1900} kcal`;
    }
  },

  getCalData(days) {
    const labels = [], ins = [], outs = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const meals = this.state.meals[key] || [];
      const workouts = this.state.workouts[key] || [];
      labels.push(d.toLocaleDateString('en-US', {month:'short', day:'numeric'}));
      ins.push(meals.reduce((s,m)=>s+(m.kcal||0),0));
      outs.push(workouts.reduce((s,w)=>s+(w.kcal||0),0) + (this.estimateTDEE() - 2000));
    }
    return {labels, ins, outs};
  },

  getMacroData(days) {
    const labels=[], p=[], c=[], f=[];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const meals = this.state.meals[key] || [];
      labels.push(d.toLocaleDateString('en-US', {month:'short', day:'numeric'}));
      p.push(meals.reduce((s,m)=>s+(m.p||0),0));
      c.push(meals.reduce((s,m)=>s+(m.c||0),0));
      f.push(meals.reduce((s,m)=>s+(m.f||0),0));
    }
    return {labels, p, c, f};
  },

  initMetricsCharts() {
    const metrics = [
      {id:'chart-rhr', field:'rhr', color:'#ff2d6f'},
      {id:'chart-hrv', field:'hrv', color:'#00d4ff'},
      {id:'chart-sleep', field:'sleep', color:'#6a5dff'},
      {id:'chart-steps', field:'steps', color:'#33ff99'},
      {id:'chart-vo2', field:'vo2', color:'#ffd400'},
    ];
    metrics.forEach(m => {
      const ctx = document.getElementById(m.id);
      if (!ctx) return;
      if (this.charts[m.id]) this.charts[m.id].destroy();
      const d = this.getMetricData(m.field, 30);
      this.charts[m.id] = new Chart(ctx, {
        type: 'line',
        data: {labels: d.labels, datasets: [{
          label: m.field, data: d.values, borderColor: m.color,
          backgroundColor: m.color + '33', fill: true, tension: .35, pointRadius: 2, spanGaps: true,
        }]},
        options: this.chartOpts(),
      });
    });
    // Stress vs body battery (dual axis)
    const sx = document.getElementById('chart-stress');
    if (sx) {
      if (this.charts.stress) this.charts.stress.destroy();
      const ds = this.getMetricData('stress', 30);
      const dbb = this.getMetricData('bb', 30);
      this.charts.stress = new Chart(sx, {
        type: 'line',
        data: {labels: ds.labels, datasets: [
          {label:'Stress', data: ds.values, borderColor:'#ff7a1a', tension:.35, spanGaps:true},
          {label:'Body Battery', data: dbb.values, borderColor:'#33ff99', tension:.35, spanGaps:true},
        ]},
        options: this.chartOpts(true),
      });
    }
  },

  getMetricData(field, days) {
    const labels=[], values=[];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const log = this.state.logs[key];
      labels.push(d.toLocaleDateString('en-US', {month:'short', day:'numeric'}));
      values.push(log?.[field] || null);
    }
    return {labels, values};
  },

  chartOpts(showLegend) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      animation: {duration: 400},
      plugins: {legend: {display: !!showLegend, labels:{color:'#c9bff0', boxWidth:12, font:{size:11}}}},
      scales: {
        y: {ticks:{color:'#8c83b8'}, grid:{color:'rgba(255,255,255,.05)'}},
        x: {ticks:{color:'#8c83b8', maxTicksLimit: 8}, grid:{color:'rgba(255,255,255,.05)'}},
      },
    };
  },

  initPlanChart() {
    const ctx = document.getElementById('chart-plan');
    if (!ctx) return;
    if (this.charts.plan) this.charts.plan.destroy();
    const proj = this.getProjection(180);
    const actuals = proj.labels.map((_, i) => {
      const d = new Date(this.state.planStart);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      return this.state.logs[key]?.weight || null;
    });
    this.charts.plan = new Chart(ctx, {
      type: 'line',
      data: {
        labels: proj.labels,
        datasets: [
          {label:'Projected', data: proj.weights, borderColor:'#ff7a1a', backgroundColor:'rgba(255,122,26,.1)', fill:true, tension:.4, pointRadius:0, borderDash:[6,4]},
          {label:'Actual', data: actuals, borderColor:'#ff2d6f', backgroundColor:'rgba(255,45,111,.15)', tension:.35, pointRadius:3, spanGaps:true},
        ],
      },
      options: this.chartOpts(true),
    });

    const sum = document.getElementById('plan-summary');
    if (sum) {
      const final = proj.weights[proj.weights.length - 1];
      const start = this.state.user.startWeight;
      const days = Math.ceil((start - final) / 0.5);
      sum.textContent = `${start.toFixed(0)} → ${final.toFixed(0)} lbs · ETA ~${days}d`;
    }

    // Calendar
    const cal = document.getElementById('cal');
    if (cal) {
      const html = [];
      const today = new Date().toISOString().split('T')[0];
      for (let i = 0; i < this.state.planDays; i++) {
        const d = new Date(this.state.planStart);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        const log = this.state.logs[key];
        const isToday = key === today;
        html.push(`<div class="d ${log?.weight ? 'done' : ''} ${isToday ? 'today' : ''}" title="${key}">${i+1}<small>${log?.weight ? log.weight.toFixed(0) : ''}</small></div>`);
      }
      cal.innerHTML = html.join('');
    }
  },

  renderMorphStrip() {
    const strip = document.getElementById('morph-strip');
    if (!strip) return;
    const steps = [0, 10, 20, 30, 45, 60, 120];
    const proj = this.getProjection(180);
    const startBF = this.state.user.startBF;
    const goalBF = this.state.user.goalBF;
    strip.innerHTML = steps.map(day => {
      const idx = Math.min(proj.weights.length - 1, day);
      const w = proj.weights[idx];
      // Interpolate BF linearly toward goal
      const total = Math.max(1, (this.state.user.startWeight - proj.weights[proj.weights.length-1]) / 0.5);
      const bf = startBF - (startBF - goalBF) * Math.min(1, day / total);
      return `<div class="slot"><div style="flex:1;display:flex;align-items:center;justify-content:center;max-height:160px">${this.createBodySVG(w, bf, 80, 'm'+day)}</div><small>DAY ${day}</small><b>${w.toFixed(0)}lb · ${bf.toFixed(0)}%</b></div>`;
    }).join('');
  },

  getProjection(days) {
    const labels = [];
    const weights = [];
    const start = new Date(this.state.planStart);
    const startW = this.state.user.startWeight;
    const ratePerDay = 0.5; // 0.5 lb/day aggressive loss

    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const log = this.state.logs[key];
      labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));

      if (log?.weight) {
        weights.push(log.weight);
      } else {
        const projected = startW - (ratePerDay * i);
        const goalW = (startW * (1 - this.state.user.startBF / 100)) / (1 - this.state.user.goalBF / 100);
        weights.push(Math.max(goalW, projected));
      }
    }
    return {labels, weights};
  },

  updateBodyModel(day) {
    const proj = this.getProjection(180);
    const projW = proj.weights[Math.min(day, proj.weights.length - 1)] || proj.weights[proj.weights.length - 1];
    const startBF = this.state.user.startBF;
    const leanMass = this.state.user.startWeight * (1 - startBF / 100);
    const projBF = Math.max(this.state.user.goalBF, 10 + (startBF - 10) * Math.pow((this.state.user.goalBF - startBF) / (startBF - 10), day / 120));

    document.getElementById('bm-proj-day').textContent = day;
    document.getElementById('bm-proj-w').textContent = projW.toFixed(1) + ' lbs';
    document.getElementById('bm-proj-bf').textContent = projBF.toFixed(1) + '%';
    document.getElementById('bm-proj-lean').textContent = leanMass.toFixed(1) + ' lbs';

    const waist = 36 - (this.state.user.startWeight - projW) * 0.12;
    document.getElementById('bm-proj-waist').textContent = waist.toFixed(1) + ' in';

    if (window.THREE) this.init3DBody('body-proj', projW, projBF);
    else document.getElementById('body-proj').innerHTML = this.createBodySVG(projW, projBF, 120);
  },

  renderAll() {
    this.updateDailyUI(new Date().toISOString().split('T')[0]);

    // Load settings drawer
    const u = this.state.user;
    document.getElementById('chip-user').textContent = u.name;

    // Body models — fall back to starting profile
    const todayKey = new Date().toISOString().split('T')[0];
    const log = this.state.logs[todayKey] || {};
    const latest = this.getLatestLog();
    const curW = log.weight || latest?.weight || this.state.user.startWeight;
    const curBF = log.bf || latest?.bf || this.state.user.startBF;
    const curWaist = log.waist || latest?.waist || 42;

    const curLean = curW * (1 - curBF / 100);
    document.getElementById('bm-cur-w').textContent = curW.toFixed(1) + ' lbs';
    document.getElementById('bm-cur-bf').textContent = curBF.toFixed(1) + '%';
    document.getElementById('bm-cur-lean').textContent = curLean.toFixed(1) + ' lbs';
    document.getElementById('bm-cur-waist').textContent = curWaist.toFixed(1) + ' in';
    if (window.THREE) this.init3DBody('body-current', curW, curBF);
    else document.getElementById('body-current').innerHTML = this.createBodySVG(curW, curBF, 120);

    const goalLean = curLean;
    const goalW = goalLean / (1 - this.state.user.goalBF / 100);
    document.getElementById('bm-goal-w').textContent = goalW.toFixed(1) + ' lbs';
    document.getElementById('bm-goal-lean').textContent = goalLean.toFixed(1) + ' lbs';
    if (window.THREE) this.init3DBody('body-goal', goalW, this.state.user.goalBF);
    else document.getElementById('body-goal').innerHTML = this.createBodySVG(goalW, this.state.user.goalBF, 120);

    // Projected body (default day 30)
    this.updateBodyModel(30);

    // Goal ETA
    const currentW = curW;
    const daysToGo = Math.ceil((currentW - goalW) / 0.5);
    const eta = new Date(this.state.planStart);
    eta.setDate(eta.getDate() + daysToGo);
    document.getElementById('bm-goal-eta').textContent = eta.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

    // Streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (this.state.logs[key]?.weight) streak++;
      else break;
    }
    document.getElementById('streak').textContent = streak + ' days';

    // Log UI
    this.loadLogUI();

    // Trainer UI
    this.updateTrainerUI();

    // Charts on dashboard
    this.initDashboardChart();

    // Milestones
    this.renderMilestones();
  },

  initDashboardChart() {
    const data = this.getWeightData(60);
    const ctx = document.getElementById('chart-weight');
    if (!ctx) return;
    if (this.charts.dashboard) this.charts.dashboard.destroy();
    this.charts.dashboard = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Actual',
            data: data.weights,
            borderColor: '#ff2d6f',
            backgroundColor: 'rgba(255, 45, 111, 0.15)',
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            spanGaps: true,
          },
          {
            label: 'Projected',
            data: data.projected,
            borderColor: 'rgba(106, 93, 255, 0.8)',
            borderDash: [6, 4],
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 100,
        animation: {duration: 400},
        plugins: {legend: {display: true, position: 'top', labels: {color: '#c9bff0', boxWidth: 12, font: {size: 11}}}},
        scales: {
          y: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
          x: {ticks: {color: '#8c83b8', maxTicksLimit: 10}, grid: {color: 'rgba(255,255,255,.05)'}},
        },
      },
    });
    // Update proj-label
    const el = document.getElementById('proj-label');
    if (el) {
      const proj = data.projected[data.projected.length - 1];
      el.textContent = `day 60 target · ${proj.toFixed(1)} lbs`;
    }
  },

  updateTrainerUI() {
    const today = new Date().toISOString().split('T')[0];
    const log = this.state.logs[today] || {};

    // Readiness
    let readiness = 75;
    if (log.sleep && log.sleep >= 8) readiness += 10;
    if (log.sleep && log.sleep < 6) readiness -= 20;
    if (log.hrv && log.hrv < 30) readiness -= 15;
    if (log.stress && log.stress > 70) readiness -= 10;
    if (log.sore && log.sore > 3) readiness -= 15;
    readiness = Math.max(20, Math.min(100, readiness));

    document.getElementById('readiness').innerHTML = `
      <div class="readiness">
        <div class="score" data-v="${readiness}"></div>
        <div style="text-align:center">
          <div style="font-weight:700; font-size:16px">${readiness}% Ready</div>
          <div style="color:var(--ink-dim); font-size:12px">${readiness > 80 ? 'Go hard!' : readiness > 60 ? 'Good to go' : readiness > 40 ? 'Moderate' : 'Recovery focus'}</div>
        </div>
      </div>
    `;

    // Prescription
    const rx = document.getElementById('rx-today');
    const presc = readiness > 80 ? '<h4>STRENGTH + CONDITIONING</h4><ul><li>Push/pull heavy (3x3)</li><li>10min conditioning</li><li>High intensity OK</li></ul>'
                : readiness > 60 ? '<h4>MIXED MODALITY</h4><ul><li>Strength baseline</li><li>30min zone 2</li><li>Mobility finish</li></ul>'
                : readiness > 40 ? '<h4>LIGHT CARDIO</h4><ul><li>30-45min easy</li><li>Mobility emphasis</li><li>No maximal effort</li></ul>'
                : '<h4>RECOVERY</h4><ul><li>Walk/yoga only</li><li>Focus on sleep</li><li>Hydrate well</li></ul>';

    rx.innerHTML = `<div class="rx">
      <div class="block">${presc}</div>
      <div class="block"><h4>NUTRITION TARGET</h4><ul><li>Protein: 160-180g</li><li>Carbs: 180-220g</li><li>Fats: 50-70g</li><li>Hydration: 100oz+</li></ul></div>
    </div>`;

    // Week plan
    const week = [];
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    for (let i = 0; i < 7; i++) {
      const dayKey = d.toISOString().split('T')[0];
      const isDone = !!this.state.logs[dayKey]?.weight;
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i];
      const isToday = dayKey === today;
      week.push(`
        <div class="day ${isToday ? 'today' : ''} ${isDone ? 'done' : ''}">
          <h5>${dayName}</h5>
          <p>${isDone ? '✓ Logged' : '○ Pending'}</p>
        </div>
      `);
      d.setDate(d.getDate() + 1);
    }
    document.getElementById('week-plan').innerHTML = week.join('');
  },

  renderMilestones() {
    const currentW = this.state.logs[new Date().toISOString().split('T')[0]]?.weight || this.state.user.startWeight;
    const leanMass = currentW * (1 - (this.state.logs[new Date().toISOString().split('T')[0]]?.bf || this.state.user.startBF) / 100);
    const milestones = [
      {day: 7, weight: this.state.user.startWeight - 3.5, label: '3.5 lbs'},
      {day: 14, weight: this.state.user.startWeight - 7, label: '1 week into'},
      {day: 30, weight: this.state.user.startWeight - 15, label: '15 lbs'},
      {day: 60, weight: this.state.user.startWeight - 30, label: '30 lbs'},
      {day: 120, weight: (leanMass / (1 - 0.15)), label: '15% BF goal'},
    ];

    const html = milestones.map((m, i) => {
      const hitIt = currentW <= m.weight;
      return `
        <div class="ms">
          <div class="day">Day ${m.day}</div>
          <div>${m.label}</div>
          <div class="hit ${hitIt ? '' : 'miss'}">${hitIt ? '✓' : '—'}</div>
        </div>
      `;
    }).join('');
    document.getElementById('milestones').innerHTML = html;
  },

  async attachAIPhoto(event) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      // Resize in-browser to keep token cost sane (max ~1024 long edge)
      const dataUrl = await this.resizeImage(file, 1024);
      this._pendingImages.push({dataUrl, media_type: 'image/jpeg'});
    }
    this.renderAIThumbs();
    event.target.value = '';
  },

  resizeImage(file, maxEdge) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = url;
    });
  },

  renderAIThumbs() {
    const el = document.getElementById('ai-thumbs');
    if (!el) return;
    el.innerHTML = this._pendingImages.map((img, i) =>
      `<div class="ai-thumb" style="background-image:url('${img.dataUrl}')">
        <button onclick="APP.removeAIPhoto(${i})">×</button>
      </div>`
    ).join('');
  },

  removeAIPhoto(idx) {
    this._pendingImages.splice(idx, 1);
    this.renderAIThumbs();
  },

  async askClaude() {
    const input = document.getElementById('ai-input');
    const response = document.getElementById('ai-response');
    const button = document.getElementById('ai-send');
    const message = input.value.trim();
    const images = this._pendingImages || [];
    if (!message && !images.length) return;

    const apiKey = this.state.claudeApiKey;
    if (!apiKey) {
      response.className = 'ai-response show';
      response.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">⚠ Claude API key needed</div>
        <div style="color:var(--ink-dim);margin-bottom:10px">Get one in 60 seconds — it's free to create, ~$0.003 per log entry.</div>
        <div class="row gap wrap">
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" class="btn" style="text-decoration:none">Get API key →</a>
          <button class="btn ghost" onclick="APP.openSettingsForKey()">Paste key into settings</button>
        </div>
      `;
      return;
    }

    response.className = 'ai-response show loading';
    response.textContent = 'Claude is parsing your entry…';
    button.disabled = true;

    try {
      const today = new Date().toISOString().split('T')[0];
      const u = this.state.user;
      const model = this.state.claudeModel || 'claude-sonnet-4-6';

      const systemPrompt = `You are an elite fitness data parser for PRISM, a weight-loss command center.

USER PROFILE:
- Name: ${u.name}
- Height: ${u.height} cm (6'1")
- Starting weight: ${u.startWeight} lbs
- Current goal: ${u.goalBF}% body fat
- Intermittent fasting window: eats only after ${u.fastStart}
- Training: 1-2 hours, 4-6 days per week

TODAY: ${today}

Parse the user's natural-language update into structured fitness data. Extract everything they mention:
- Biometrics: weight, body fat %, waist, resting HR, HRV, SpO2, sleep hours, sleep score, stress, body battery, VO2 max, steps, active/resting calories, water oz
- Meals: name, estimated kcal, protein g, carbs g, fat g, slot (Break-fast 2pm / Snack / Dinner / Post-workout)
- Workouts: type, minutes, avg HR, max HR, calories burned, training load, notes
- Subjective: mood 1-5, energy 1-5, soreness 1-5
- General notes

ESTIMATION RULES (use domain knowledge if exact numbers not given):
- 2 eggs + toast ≈ 350 kcal, 20P/30C/15F
- grilled chicken (6oz) + rice (1 cup) ≈ 500 kcal, 45P/50C/8F
- 30min run at moderate pace for 220 lb person ≈ 340 kcal
- 45min weights ≈ 280 kcal
- 60min zone 2 cardio ≈ 500 kcal
- Training load = roughly (avg HR / 100) × minutes × intensity factor

If PHOTOS are attached, analyze them visually:
- Meal photos: identify the food, estimate portion size by visual volume, compute kcal + macros, add as a meal entry (single meal if one plate; multiple meals if clearly separate dishes)
- Workout photos / watch screenshots: read displayed metrics (duration, avg/max HR, calories, training load) and log as a workout
- Scale photos: read the weight (and BF% if shown)
- Body photos: estimate visible BF% if asked

Default date is today unless user specifies otherwise. Return ALL extracted data via the log_day tool. Include a warm, concise 1-2 sentence coach response in the "summary" field that notes what you saw in any images.`;

      const tools = [{
        name: 'log_day',
        description: 'Log parsed fitness data for a specific day',
        input_schema: {
          type: 'object',
          properties: {
            date: {type: 'string', description: 'ISO date YYYY-MM-DD'},
            weight: {type: 'number', description: 'Body weight in pounds'},
            bf: {type: 'number', description: 'Body fat percentage'},
            waist: {type: 'number', description: 'Waist circumference in inches'},
            sleep: {type: 'number', description: 'Hours slept'},
            sleepScore: {type: 'number', description: 'Sleep score 0-100'},
            rhr: {type: 'integer', description: 'Resting heart rate bpm'},
            hrv: {type: 'integer', description: 'HRV in ms'},
            spo2: {type: 'number', description: 'SpO2 percentage'},
            stress: {type: 'integer', description: 'Stress 0-100'},
            bb: {type: 'integer', description: 'Body battery 0-100'},
            vo2: {type: 'number', description: 'VO2 max'},
            steps: {type: 'integer', description: 'Step count'},
            akcal: {type: 'integer', description: 'Active calories burned'},
            rkcal: {type: 'integer', description: 'Resting calories'},
            water: {type: 'integer', description: 'Water ounces'},
            mood: {type: 'integer', description: '1-5'},
            energy: {type: 'integer', description: '1-5'},
            sore: {type: 'integer', description: '1-5'},
            notes: {type: 'string'},
            meals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {type: 'string'},
                  kcal: {type: 'integer'},
                  p: {type: 'integer', description: 'protein g'},
                  c: {type: 'integer', description: 'carbs g'},
                  f: {type: 'integer', description: 'fat g'},
                  slot: {type: 'string'}
                },
                required: ['name', 'kcal']
              }
            },
            workouts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {type: 'string'},
                  mins: {type: 'integer'},
                  avghr: {type: 'integer'},
                  maxhr: {type: 'integer'},
                  kcal: {type: 'integer'},
                  load: {type: 'integer'},
                  notes: {type: 'string'}
                },
                required: ['type', 'mins']
              }
            },
            summary: {type: 'string', description: 'Brief coach response to display to user (1-2 sentences)'}
          },
          required: ['summary']
        }
      }];

      // Build user content — text + any attached images
      const userContent = [];
      for (const img of images) {
        const b64 = img.dataUrl.split(',')[1];
        userContent.push({
          type: 'image',
          source: {type: 'base64', media_type: 'image/jpeg', data: b64},
        });
      }
      userContent.push({type: 'text', text: message || 'Log what you see in the image(s).'});

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system: [{type: 'text', text: systemPrompt, cache_control: {type: 'ephemeral'}}],
          tools,
          tool_choice: {type: 'tool', name: 'log_day'},
          messages: [{role: 'user', content: userContent}],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({error: {message: res.statusText}}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const toolUse = data.content.find(c => c.type === 'tool_use');
      if (!toolUse) throw new Error('Claude did not return structured data');

      const parsed = toolUse.input;
      this.applyClaudeData(parsed);

      const fields = [];
      if (parsed.weight) fields.push(`weight ${parsed.weight}lb`);
      if (parsed.bf) fields.push(`BF ${parsed.bf}%`);
      if (parsed.meals?.length) fields.push(`${parsed.meals.length} meal(s) · ${parsed.meals.reduce((s,m)=>s+m.kcal,0)}kcal`);
      if (parsed.workouts?.length) fields.push(`${parsed.workouts.length} workout(s) · ${parsed.workouts.reduce((s,w)=>s+w.mins,0)}min`);
      if (parsed.sleep) fields.push(`${parsed.sleep}h sleep`);

      response.className = 'ai-response show';
      response.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px">✓ Logged: ${fields.join(' · ') || 'data saved'}</div>
        <div style="color:var(--ink-dim)">${this.escapeHtml(parsed.summary)}</div>
      `;
      input.value = '';
      this._pendingImages = [];
      this.renderAIThumbs();
    } catch (e) {
      response.className = 'ai-response show';
      response.innerHTML = `⚠ ${this.escapeHtml(e.message)}`;
    } finally {
      button.disabled = false;
    }
  },

  applyClaudeData(data) {
    const date = data.date || new Date().toISOString().split('T')[0];
    if (!this.state.logs[date]) this.state.logs[date] = {};
    const log = this.state.logs[date];

    ['weight', 'bf', 'waist', 'sleep', 'sleepScore', 'rhr', 'hrv', 'spo2',
     'stress', 'bb', 'vo2', 'steps', 'akcal', 'rkcal', 'water',
     'mood', 'energy', 'sore', 'notes'].forEach(k => {
      if (data[k] !== undefined && data[k] !== null) log[k] = data[k];
    });

    if (Array.isArray(data.meals) && data.meals.length) {
      if (!this.state.meals[date]) this.state.meals[date] = [];
      data.meals.forEach(m => {
        this.state.meals[date].push({
          name: m.name, kcal: m.kcal || 0, p: m.p || 0, c: m.c || 0, f: m.f || 0,
          slot: m.slot || 'Break-fast 2pm',
          time: new Date().toLocaleTimeString(),
        });
      });
    }

    if (Array.isArray(data.workouts) && data.workouts.length) {
      if (!this.state.workouts[date]) this.state.workouts[date] = [];
      data.workouts.forEach(w => {
        this.state.workouts[date].push({
          type: w.type, mins: w.mins || 0,
          avghr: w.avghr || 0, maxhr: w.maxhr || 0,
          kcal: w.kcal || 0, load: w.load || 0,
          notes: w.notes || '',
          time: new Date().toLocaleTimeString(),
        });
      });
    }

    this.saveState();
  },

  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  },

  sendChat() {
    const input = document.getElementById('chat-in');
    const msg = input.value.trim();
    if (!msg) return;

    const chat = document.getElementById('chat');
    chat.innerHTML += `<div class="msg user">${msg}</div>`;
    input.value = '';

    // Mock AI response
    const responses = [
      'Keep up that fasting window. Consistency wins.',
      'Your metrics show strong recovery capacity. Push harder when ready.',
      'Sleep is your secret weapon. Prioritize 8 hours.',
      'Recomposition > weight. How\'s strength trending?',
      'Try adding a second training session on high readiness days.',
      'Your deficit is optimal. Don\'t push harder; be patient.',
    ];
    const reply = responses[Math.floor(Math.random() * responses.length)];
    setTimeout(() => {
      chat.innerHTML += `<div class="msg bot">${reply}</div>`;
      chat.scrollTop = chat.scrollHeight;
    }, 400);
  },

  openSettingsForKey() {
    document.getElementById('drawer').classList.add('open');
    this.loadSettings();
    setTimeout(() => {
      const el = document.getElementById('s-claude-key');
      if (el) { el.focus(); el.scrollIntoView({behavior: 'smooth', block: 'center'}); }
    }, 100);
  },

  loadSettings() {
    const u = this.state.user;
    document.getElementById('s-name').value = u.name;
    document.getElementById('s-height').value = u.height;
    document.getElementById('s-start').value = u.startWeight;
    document.getElementById('s-age').value = u.age;
    document.getElementById('s-bday').value = u.birthday;
    document.getElementById('s-goalbf').value = u.goalBF;
    document.getElementById('s-startbf').value = u.startBF;
    document.getElementById('s-faststart').value = u.fastStart;
    document.getElementById('s-plan-start').value = this.state.planStart;
    document.getElementById('s-plan-days').value = this.state.planDays;
    document.getElementById('s-claude-key').value = this.state.claudeApiKey || '';
    document.getElementById('s-claude-model').value = this.state.claudeModel || 'claude-sonnet-4-6';
  },

  saveSettings() {
    this.state.user.name = document.getElementById('s-name').value;
    this.state.user.height = parseInt(document.getElementById('s-height').value);
    this.state.user.startWeight = parseFloat(document.getElementById('s-start').value);
    this.state.user.age = parseInt(document.getElementById('s-age').value);
    this.state.user.birthday = document.getElementById('s-bday').value;
    this.state.user.goalBF = parseFloat(document.getElementById('s-goalbf').value);
    this.state.user.startBF = parseFloat(document.getElementById('s-startbf').value);
    this.state.user.fastStart = document.getElementById('s-faststart').value;
    this.state.planStart = document.getElementById('s-plan-start').value;
    this.state.planDays = parseInt(document.getElementById('s-plan-days').value);
    this.state.claudeApiKey = document.getElementById('s-claude-key').value.trim();
    this.state.claudeModel = document.getElementById('s-claude-model').value;
    this.saveState();
    document.getElementById('drawer').classList.remove('open');
    this.toast('Settings saved ✓');
  },

  exportData() {
    const json = JSON.stringify(this.state, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prism-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    this.toast('Exported ✓');
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        this.state = data;
        this.saveState();
        this.toast('Imported ✓');
        location.reload();
      } catch (err) {
        this.toast('Import failed');
      }
    };
    reader.readAsText(file);
  },

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  },
};

document.addEventListener('DOMContentLoaded', () => APP.init());
