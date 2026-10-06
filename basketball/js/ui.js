// UI: DOM overlay for the score, the shot meter and shot feedback. It only
// reads game state (ShootingSystem, ScoringSystem); it never changes it.
ISO.UI = class {
  constructor(container) {
    this.container = container;

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

    // Score panel.
    this.scoreboard = el('div', 'scoreboard');
    const label = el('div', 'scoreboard__label');
    label.textContent = 'PLAYER';
    this.scoreValue = el('div', 'scoreboard__value');
    this.scoreValue.textContent = '0';
    this.scoreboard.append(label, this.scoreValue);

    // Controls guide along the bottom edge, grouped by what the keys do.
    // [keys, label, alternate keys, short label for narrow screens]
    this.controls = el('div', 'controls-bar');
    const GROUPS = [
      ['Move', [
        [['W', 'A', 'S', 'D'], 'Move', ['↑', '←', '↓', '→'], 'Move'],
        [['Shift'], 'Sprint', null, 'Sprint'],
      ]],
      ['Handle', [
        [['E'], 'Crossover', null, 'Cross'],
        [['Z', 'X'], 'Spin L / R', null, 'Spin'],
        [['C'], 'Hesitation', null, 'Hesi'],
        [['V'], 'Behind back', null, 'BTB'],
        [['R'], 'In & out', null, 'In-out'],
        [['Q'], 'Step back', null, 'Step'],
      ]],
      ['Score', [
        [['Space'], 'Tap fake · Hold shoot · Drive to finish', null, 'Fake/Shoot/Finish'],
        [['F'], 'Pass', null, 'Pass'],
      ]],
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
        if (alt) {
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

    // Small transient notice (e.g. no pass target).
    this.toast = el('div', 'hud-toast');

    container.append(this.scoreboard, this.meter, this.feedback, this.toast, this.controls);
    this._toastUntil = 0;
    this._score = 0;

    this._zonesSet = false;
    this._wasShooting = false;
    this._judged = false;
    this._meterHideAt = 0;
    this._time = 0;
    this._v = new THREE.Vector3();
  }

  // state: { shooting, scoring, camera, anchor } — anchor is the world
  // position the meter sits beside (the shooter).
  update(dt, { shooting, passing, scoring, camera, anchor }) {
    this._time += dt;
    if (scoring) this._updateScore(scoring);
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

  _updateScore(scoring) {
    if (scoring.score !== this._score) {
      this._score = scoring.score;
      this.scoreValue.textContent = String(scoring.score);
      this.scoreboard.classList.remove('is-pop');
      void this.scoreboard.offsetWidth;
      this.scoreboard.classList.add('is-pop');
    }
    const r = scoring.resolvedThisFrame;
    if (!r) return;
    let main, sub, kind;
    const pts = `+${r.points}${r.isThree ? '  ·  3PT' : ''}`;
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
