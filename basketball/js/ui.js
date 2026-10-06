// UI: DOM overlay for the shot meter and release feedback. It only reads game
// state (the ShootingSystem); it never changes it.
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

    container.append(this.meter, this.feedback);

    this._zonesSet = false;
    this._wasShooting = false;
    this._judged = false;
    this._meterHideAt = 0;
    this._time = 0;
    this._v = new THREE.Vector3();
  }

  // shooting: ShootingSystem, anchor: world position to place the meter beside.
  update(dt, shooting, camera, anchor) {
    this._time += dt;
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

    this.feedbackMain.textContent = timing === 'PERFECT' ? 'GREEN!' : timing;
    this.feedbackSub.textContent = timing === 'PERFECT' ? 'PERFECT RELEASE' : 'RELEASE';
    this.feedback.className = `shot-feedback is-${kind}`;
    void this.feedback.offsetWidth; // restart the pop animation
    this.feedback.classList.add('is-shown');
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
