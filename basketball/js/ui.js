// UI: DOM overlay for the score, the shot meter, shot feedback and the
// possession flow. It only reads game state (ShootingSystem, ScoringSystem,
// PossessionSystem); it never changes it.
ISO.UI = class {
  constructor(container, opts = {}) {
    this.container = container;
    this.role = opts.role || 'offense';
    this.teams = opts.teams || null;
    this.roster = opts.roster || null;
    this.bindings = opts.bindings || null;     // the live Input.bindings (labels follow rebinding)

    // Shot meter: a vertical bar beside the shooter with marked timing zones.
    this.meter = el('div', 'shot-meter');
    const track = el('div', 'shot-meter__track');
    this.zoneEls = {
      early: el('div', 'shot-meter__zone shot-meter__zone--near'),
      perfect: el('div', 'shot-meter__zone shot-meter__zone--perfect'),
      late: el('div', 'shot-meter__zone shot-meter__zone--near'),
      ideal: el('div', 'shot-meter__ideal'),
    };
    this.fill = el('div', 'shot-meter__fill');
    this.marker = el('div', 'shot-meter__marker');
    track.append(this.zoneEls.early, this.zoneEls.late, this.fill, this.zoneEls.perfect, this.zoneEls.ideal, this.marker);
    this.meter.append(track);

    // Release feedback text.
    this.feedback = el('div', 'shot-feedback');
    this.feedbackMain = el('div', 'shot-feedback__main');
    this.feedbackSub = el('div', 'shot-feedback__sub');
    this.feedback.append(this.feedbackMain, this.feedbackSub);

    // Score panel: one score per TEAM (teams with players), and a dot on the
    // team that has the ball.
    this.scoreboard = el('div', 'scoreboard');
    this.teamEls = {};
    const teamIds = this.teams ? Object.keys(this.teams).filter((t) => !this.roster || this.roster.playersOn(t).length) : ['A'];
    teamIds.forEach((id, i) => {
      const t = this.teams ? this.teams[id] : { name: 'PLAYER', color: '#ff7a1a' };
      const box = el('div', 'scoreboard__team');
      const label = el('div', 'scoreboard__label');
      label.textContent = teamIds.length > 1 ? t.name : 'PLAYER';
      const value = el('div', 'scoreboard__value');
      value.textContent = '0';
      value.style.background = t.color;
      const dot = el('span', 'scoreboard__ball');
      if (i === 0) box.append(dot, label, value); else box.append(value, label, dot);
      this.scoreboard.append(box);
      this.teamEls[id] = { box, value, score: 0 };
    });

    // Possession: who has the ball now, and the quick fade that hides resets.
    this.banner = el('div', 'possession-banner');
    // ANKLE BREAKER: shown only when the gameplay reports a real major break.
    this.callout = el('div', 'callout');
    this.fadeEl = el('div', 'possession-fade');

    this.controls = el('div', 'controls-bar');
    this._buildControls(this.role);

    // Small transient notice (e.g. no pass target).
    this.toast = el('div', 'hud-toast');

    container.append(this.fadeEl, this.scoreboard, this.banner, this.callout, this.meter, this.feedback, this.toast, this.controls);
    this._toastUntil = 0;

    this._zonesSet = false;
    this._wasShooting = false;
    this._judged = false;
    this._meterHideAt = 0;
    this._time = 0;
    this._v = new THREE.Vector3();
    this._shooting = null;
    this._possNum = null;
  }

  // Development: which reference scenario is running (?scenario=...).
  setScenarioLabel(text) {
    if (!this.scenarioEl) { this.scenarioEl = el('div', 'scenario-label'); this.container.append(this.scenarioEl); }
    this.scenarioEl.textContent = text;
  }

  // The controls guide follows the role YOUR player is playing.
  setRole(role) {
    if (role === this.role && this.controls.childElementCount) return;
    this.role = role;
    this._buildControls(role);
  }

  get controlsRole() { return this.controls.dataset.role; }

  // Controls guide along the bottom edge, grouped by what the keys do.
  // [keys, label, alternate keys, short label for narrow screens]
  _buildControls(role) {
    this.controls.textContent = '';
    this.controls.dataset.role = role;
    // What YOUR player can do right now (offense or defense), with the keys read
    // from the same bindings the input uses (Input.bindings). Only actions that
    // do something are listed: Pass needs a target (the ?debug catch target),
    // and the CPU-offense test keys are a ?debug aid.
    const B = this.bindings || {};
    const dbg = ISO.CONFIG.debugPhysics;
    const keys = (actions, which = 0) => actions.map((a) => (B[a] || [])[which]).filter(Boolean).map(ISO.Input.keyLabel);
    const item = (actions, label, short, withAlt = false) => [keys(actions), label, withAlt ? keys(actions, 1) : null, short];
    const MOVE = ['up', 'left', 'down', 'right'];
    const GROUPS = role === 'defense' ? [
      ['Defend', [
        item(MOVE, 'Move (slide / pressure / retreat)', 'Move', true),
        item(['sprint'], 'Turn & run', 'Run'),
        item(['steal'], 'Steal (reach)', 'Steal'),
        item(['shoot'], 'Jump / contest', 'Jump'),
        item(['pass'], 'Hold: hands up', 'Hands'),
      ]],
    ].concat(dbg ? [['CPU offense (test)', [
      item(['bot1'], 'Jumper', 'Jumper'), item(['bot2'], 'Pull-up', 'Pull-up'), item(['bot3'], 'Step-back', 'Step'),
      item(['bot4'], 'Side-step', 'Side'), item(['bot5'], 'Drive', 'Drive'), item(['bot6'], 'Floater', 'Float'),
      item(['bot7'], 'Pump fake', 'Fake'), item(['bot0'], 'Stand', 'Stand'), item(['bot8'], 'Mix', 'Mix'),
    ]]] : []) : [
      ['Move', [
        item(MOVE, 'Move', 'Move', true),
        item(['sprint'], 'Sprint', 'Sprint'),
      ]],
      ['Handle', [
        item(['crossover'], 'Crossover', 'Cross'),
        item(['spinLeft', 'spinRight'], 'Spin L / R', 'Spin'),
        item(['hesitation'], 'Hesitation', 'Hesi'),
        item(['behindBack'], 'Behind back', 'BTB'),
        item(['inAndOut'], 'In & out', 'In-out'),
        item(['stepBack'], 'Step back', 'Step'),
      ]],
      ['Score', [
        item(['shoot'], 'Tap fake · Hold shoot · Drive to finish', 'Fake/Shoot/Finish'),
      ].concat(dbg ? [item(['pass'], 'Pass (debug target)', 'Pass')] : [])],
    ];
    for (const [title, items] of GROUPS) {
      const group = el('div', 'controls-group');
      const head = el('span', 'controls-group__title');
      head.textContent = title;
      group.append(head);
      for (const [keys, label, alt, short] of items) {
        const item = el('div', 'controls-bar__item');
        const caps = el('span', 'controls-bar__keys');
        keys.forEach((k) => { const c = el('kbd', 'keycap' + (k.length > 1 ? ' keycap--wide' : '')); c.textContent = k; caps.append(c); });
        if (alt && alt.length) {
          const or = el('span', 'controls-bar__or'); or.textContent = '/'; caps.append(or);
          alt.forEach((k) => { const c = el('kbd', 'keycap keycap--alt'); c.textContent = k; caps.append(c); });
        }
        const text = el('span', 'controls-bar__label');
        text.textContent = label;
        const shortText = el('span', 'controls-bar__label controls-bar__label--short');
        shortText.textContent = short;
        item.append(caps, text, shortText);
        group.append(item);
      }
      this.controls.append(group);
    }
    this._barH = null;
  }

  // state: { shooting, scoring, camera, anchor } — anchor is the world
  // position the meter sits beside (the shooter).
  update(dt, { shooting, passing, scoring, possession, camera, anchor }) {
    this._time += dt;
    if (possession) this._updatePossession(possession);
    if (scoring) this._updateScore(scoring);
    // A different shooter (possession changed hands): the meter starts clean.
    if (shooting !== this._shooting) { this._shooting = shooting; this._wasShooting = false; this._judged = true; this.meter.classList.remove('is-visible'); }
    if (passing && passing.passBlocked) this._showToast('No teammate to pass to yet');
    if (this._time > this._toastUntil) this.toast.classList.remove('is-shown');
    // Keep the toast just above the controls bar, however many rows it wraps to.
    const barH = this.controls.offsetHeight;
    if (barH !== this._barH) { this._barH = barH; this.toast.style.bottom = `${barH + 22}px`; }
    if (!shooting) return;
    if (!this._zonesSet) this._setZones(shooting.timingZones);

    // The meter appears once a shot is committed (a pump fake never shows it).
    const committed = shooting.isShooting && shooting.shotCommitted;
    if (committed && !this._wasShooting) {
      // New shot: reset the meter.
      this._judged = false;
      this.meter.className = 'shot-meter is-visible';
      this.marker.style.opacity = '0';
    }
    this._wasShooting = committed;

    if (committed || this._time < this._meterHideAt) {
      this.fill.style.height = `${(shooting.shotMeter * 100).toFixed(1)}%`;
      this._position(camera, anchor);
    }

    if (shooting.isShooting && shooting.releaseTiming && !this._judged) {
      this._judged = true;
      this._showResult(shooting);
      this._meterHideAt = this._time + 0.9;
    }

    if (!committed && this._time >= this._meterHideAt) {
      this.meter.classList.remove('is-visible');
    }
  }

  _updatePossession(P) {
    this.fadeEl.style.opacity = P.fade > 0.001 ? P.fade.toFixed(3) : '0';
    for (const id in this.teamEls) this.teamEls[id].box.classList.toggle('has-ball', P.offenseTeamId === id);
    if (P.possessionNumber !== this._possNum) {
      const first = this._possNum === null;
      this._possNum = P.possessionNumber;
      const t = this.teams && this.teams[P.offenseTeamId];
      if (!first && t && Object.keys(this.teamEls).length > 1) {
        this.banner.textContent = `${t.name} BALL`;
        this.banner.style.color = t.color;
        this.banner.classList.remove('is-shown');
        void this.banner.offsetWidth;
        this.banner.classList.add('is-shown');
      }
    }
  }

  _updateScore(scoring) {
    const ts = scoring.teamScore || { A: scoring.score };
    for (const id in this.teamEls) {
      const T = this.teamEls[id], v = ts[id] || 0;
      if (v === T.score) continue;
      T.score = v;
      T.value.textContent = String(v);
      T.box.classList.remove('is-pop');
      void T.box.offsetWidth;
      T.box.classList.add('is-pop');
    }
    const r = scoring.resolvedThisFrame;
    if (!r || this._time < (this._winUntil || 0)) return;
    if (r.blocked && !r.made) return;              // already shown as a block
    let main, sub, kind;
    const pts = `+${r.points}${r.isThree ? '  ·  FROM DEEP' : ''}`;   // outside the arc (1s and 2s)
    const FINISH = { dunk: 'DUNK!', layup: 'LAYUP', floater: 'FLOATER' };
    if (FINISH[r.shotType]) {
      // Finishes have no meter: name the finish.
      if (r.made) { main = FINISH[r.shotType]; sub = pts; kind = r.shotType === 'dunk' ? 'perfect' : 'made'; }
      else { main = 'MISSED'; sub = r.shotType.toUpperCase(); kind = 'missed'; }
    } else if (r.made && r.timing === 'PERFECT') {
      main = 'GREEN!'; sub = `${r.swish ? 'SWISH' : 'MADE'}  ·  ${pts}`; kind = 'perfect';
    } else if (r.made) {
      main = r.swish ? 'SWISH' : 'MADE'; sub = r.shotType === 'sidestep' ? `SIDE-STEP  ·  ${pts}` : pts; kind = 'made';
    } else {
      main = 'MISSED'; sub = r.timing ? `${r.timing} RELEASE` : ''; kind = 'missed';
    }
    this._showFeedback(main, sub, kind);
  }

  // First to 11 reached (gameWon event): the result holds the screen for the
  // game-over beat; the score resets when the next game starts.
  showWin(e) {
    const t = this.teams && this.teams[e.winnerTeamId];
    const ids = Object.keys(this.teamEls);
    const score = ids.map((id) => e.score[id] || 0).join(' – ');
    this._winUntil = this._time + 2.4;
    this.feedbackMain.textContent = `${t ? t.name : 'TEAM ' + e.winnerTeamId} WINS`;
    this.feedbackSub.textContent = score;
    this.feedback.className = 'shot-feedback is-win';
    void this.feedback.offsetWidth;
    this.feedback.classList.add('is-shown');
  }

  // A steal (from the steal event): who did it decides the color.
  showSteal(e, localId) {
    const mine = e.defenderPlayerId === localId;
    this._showFeedback('STEAL!', e.kind === 'deflection' ? 'POKED AWAY' : 'PICKED', mine ? 'perfect' : 'bad');
  }

  // ANKLE BREAKER (from the ankleBreak event, major stagger or fall only).
  showAnkleBreaker(e) {
    this.callout.textContent = 'ANKLE BREAKER';
    this.callout.classList.remove('is-shown', 'is-fall');
    void this.callout.offsetWidth;
    this.callout.classList.add('is-shown');
    if (e.reactionLevel >= 3) this.callout.classList.add('is-fall');
  }

  // A physical block happened (from the blockOccurred event).
  showBlock(e) {
    const sub = { rejection: 'REJECTED', deflection: 'DEFLECTED', 'pop-up': 'POPPED UP', fingertip: 'FINGERTIP', 'knock-loose': 'AT THE RELEASE' }[e.blockType] || '';
    this._showFeedback('BLOCKED!', sub, 'bad');
  }

  _showToast(text) {
    this.toast.textContent = text;
    this.toast.classList.add('is-shown');
    this._toastUntil = this._time + 1.4;
  }

  _showFeedback(main, sub, kind) {
    this.feedbackMain.textContent = main;
    this.feedbackSub.textContent = sub;
    this.feedback.className = `shot-feedback is-${kind}`;
    void this.feedback.offsetWidth; // restart the pop animation
    this.feedback.classList.add('is-shown');
  }

  _setZones(z) {
    const band = (elm, a, b) => {
      elm.style.bottom = `${a * 100}%`;
      elm.style.height = `${(b - a) * 100}%`;
    };
    band(this.zoneEls.early, z.nearStart, z.greenStart);
    band(this.zoneEls.perfect, z.greenStart, z.greenEnd);
    band(this.zoneEls.late, z.greenEnd, z.nearEnd);
    this.zoneEls.ideal.style.bottom = `${z.ideal * 100}%`;
    this._zonesSet = true;
  }

  _showResult(shooting) {
    const timing = shooting.releaseTiming;
    const kind = timing === 'PERFECT' ? 'perfect' : (timing === 'EARLY' || timing === 'LATE') ? 'ok' : 'bad';
    this.meter.className = `shot-meter is-visible is-${kind}`;
    this.marker.style.bottom = `${(shooting.shotMeter * 100).toFixed(1)}%`;
    this.marker.style.opacity = '1';

    this._showFeedback(timing === 'PERFECT' ? 'GREEN!' : timing, timing === 'PERFECT' ? 'PERFECT RELEASE' : 'RELEASE', kind);
  }

  // Keep the meter just to the right of the player's head on screen.
  _position(camera, anchor) {
    const v = this._v.copy(anchor);
    v.y += 2.1;
    v.project(camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const x = (v.x * 0.5 + 0.5) * w;
    // Never let the meter slide down behind the controls bar.
    const maxY = h - this.controls.offsetHeight - 22 - this.meter.offsetHeight + 20;
    const y = Math.min((-v.y * 0.5 + 0.5) * h, maxY);
    this.meter.style.transform = `translate(${Math.round(x + 34)}px, ${Math.round(y - 20)}px)`;
  }
};

function el(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
