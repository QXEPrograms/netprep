// UI: DOM overlay for the score, the shot meter and shot feedback. It only
// reads game state (ShootingSystem, ScoringSystem); it never changes it.
ISO.UI = class {
  constructor(container) {
    this.container = container;

    // Shot meter: a vertical bar beside the shooter with marked timing zones.
    this.meter = el('div', 'shot-meter');
    const track = el('div', 'shot-meter__track');
    this.zoneEls = {
      early: el('div', 'shot-meter__zone shot-meter__zone--early'),
      perfect: el('div', 'shot-meter__zone shot-meter__zone--perfect'),
      late: el('div', 'shot-meter__zone shot-meter__zone--late'),
    };
    this.fill = el('div', 'shot-meter__fill');
    this.marker = el('div', 'shot-meter__marker');
    track.append(this.zoneEls.early, this.zoneEls.perfect, this.zoneEls.late, this.fill, this.marker);
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

    container.append(this.scoreboard, this.meter, this.feedback);
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
  update(dt, { shooting, scoring, camera, anchor }) {
    this._time += dt;
    if (scoring) this._updateScore(scoring);
    if (!shooting) return;
    if (!this._zonesSet) this._setZones(shooting.timingZones);

    if (shooting.isShooting && !this._wasShooting) {
      // New shot: reset the meter.
      this._judged = false;
      this.meter.className = 'shot-meter is-visible';
      this.marker.style.opacity = '0';
    }
    this._wasShooting = shooting.isShooting;

    if (shooting.isShooting || this._time < this._meterHideAt) {
      this.fill.style.height = `${(shooting.shotMeter * 100).toFixed(1)}%`;
      this._position(camera, anchor);
    }

    if (shooting.isShooting && shooting.releaseTiming && !this._judged) {
      this._judged = true;
      this._showResult(shooting);
      this._meterHideAt = this._time + 0.9;
    }

    if (!shooting.isShooting && this._time >= this._meterHideAt) {
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
    if (r.made && r.timing === 'PERFECT') {
      main = 'GREEN!'; sub = `${r.swish ? 'SWISH' : 'MADE'}  ·  ${pts}`; kind = 'perfect';
    } else if (r.made) {
      main = r.swish ? 'SWISH' : 'MADE'; sub = pts; kind = 'made';
    } else {
      main = 'MISSED'; sub = r.timing ? `${r.timing} RELEASE` : ''; kind = 'missed';
    }
    this._showFeedback(main, sub, kind);
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
    band(this.zoneEls.early, z.early, z.perfect);
    band(this.zoneEls.perfect, z.perfect, z.late);
    band(this.zoneEls.late, z.late, z.veryLate);
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
    const y = (-v.y * 0.5 + 0.5) * h;
    this.meter.style.transform = `translate(${Math.round(x + 34)}px, ${Math.round(y - 20)}px)`;
  }
};

function el(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
