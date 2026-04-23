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
    logs: {}, // yyyy-mm-dd -> {weight, bf, waist, rhr, hrv, spo2, sleep, sleepScore, stress, bb, vo2, steps, akcal, rkcal, water, mood, energy, sore, notes}
    meals: {}, // yyyy-mm-dd -> [{name, kcal, p, c, f, slot, time}]
    workouts: {}, // yyyy-mm-dd -> [{type, mins, avghr, maxhr, kcal, load, notes, time}]
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
    // Init charts if needed
    setTimeout(() => {
      if (tabName === 'weight') this.initWeightCharts();
      if (tabName === 'exercise') this.initExerciseCharts();
      if (tabName === 'diet') this.initDietCharts();
      if (tabName === 'metrics') this.initMetricsCharts();
      if (tabName === 'plan') this.initPlanChart();
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
    const svg = this.createBodySVG(weight, bf, 120);
    document.getElementById('body-hero').innerHTML = svg;
  },

  createBodySVG(weight, bf, size) {
    const scale = 1 - bf / 100;
    const width = 120, height = 140;
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 8px 20px rgba(192,77,255,.3))">
      <defs>
        <linearGradient id="body-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(192,77,255,.9)"/>
          <stop offset="100%" stop-color="rgba(0,212,255,.8)"/>
        </linearGradient>
      </defs>
      <ellipse cx="${width/2}" cy="28" rx="${12*scale}" ry="14" fill="url(#body-grad)" opacity="0.9"/>
      <path d="M ${width/2-8} 42 L ${width/2-16*scale} 80 L ${width/2-6} 135 L ${width/2+6} 135 L ${width/2+16*scale} 80 L ${width/2+8} 42 Z" fill="url(#body-grad)" opacity="0.85"/>
      <circle cx="${width/2-14*scale}" cy="55" r="6" fill="rgba(255,212,0,.6)"/>
      <circle cx="${width/2+14*scale}" cy="55" r="6" fill="rgba(255,212,0,.6)"/>
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
        plugins: {legend: {display: true, position: 'top', labels: {color: '#c9bff0', boxWidth: 12}}},
        scales: {
          y: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
          y1: {position: 'right', ticks: {color: '#8c83b8'}, grid: {display: false}},
          x: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
        },
      },
    });

    const ctxBF = document.getElementById('chart-bf');
    if (ctxBF && this.state.logs[Object.keys(this.state.logs)[0]]?.bf) {
      if (this.charts.bf) this.charts.bf.destroy();
      this.charts.bf = new Chart(ctxBF, {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [{
            label: 'Body Fat %',
            data: data.bfs,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#00d4ff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {legend: {display: false}},
          scales: {
            y: {min: 10, max: 35, ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
            x: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
          },
        },
      });
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
    // Load on demand
  },

  initDietCharts() {
    // Load on demand
  },

  initMetricsCharts() {
    // Load on demand
  },

  initPlanChart() {
    const ctx = document.getElementById('chart-plan');
    if (!ctx || this.charts.plan) return;
    const proj = this.getProjection(180);
    this.charts.plan = new Chart(ctx, {
      type: 'line',
      data: {
        labels: proj.labels,
        datasets: [{
          label: 'Projected weight',
          data: proj.weights,
          borderColor: '#ff7a1a',
          backgroundColor: 'rgba(255, 122, 26, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {legend: {display: false}},
        scales: {
          y: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
          x: {ticks: {color: '#8c83b8'}, grid: {color: 'rgba(255,255,255,.05)'}},
        },
      },
    });
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

    document.getElementById('body-proj').innerHTML = this.createBodySVG(projW, projBF, 120);
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
    document.getElementById('body-current').innerHTML = this.createBodySVG(curW, curBF, 120);

    const goalLean = curLean;
    const goalW = goalLean / (1 - this.state.user.goalBF / 100);
    document.getElementById('bm-goal-w').textContent = goalW.toFixed(1) + ' lbs';
    document.getElementById('bm-goal-lean').textContent = goalLean.toFixed(1) + ' lbs';
    document.getElementById('body-goal').innerHTML = this.createBodySVG(goalW, this.state.user.goalBF, 120);

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
