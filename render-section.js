// ---- Section (lesson) view: one objective at a time, Next/Back to move ----
function renderSection(sectionId, focusObjectiveId){
  const main = document.getElementById('mainView');
  const idx = SECTIONS.findIndex(s => s.id === sectionId);
  const s = SECTIONS[idx];
  if(!s){ location.hash = '#/dashboard'; return; }

  if(!sectionUnlocked(idx)){
    main.innerHTML = `<div class="panel empty-state">
      ${iconSvg('lock')}
      <h2 style="font-size:16px; margin-bottom:6px;">${s.title} is locked</h2>
      <p>Pass the previous section's quiz at ${Math.round(PASS_THRESHOLD*100)}% or higher to unlock it.</p>
      <button class="btn primary" style="margin-top:14px;" data-nav="dashboard">Back to dashboard</button>
    </div>`;
    main.querySelector('[data-nav]').addEventListener('click', () => location.hash = '#/dashboard');
    return;
  }

  const sec = STATE.sections[s.id];
  const best = sectionBestScore(s.id);
  const passed = sectionPassed(s.id);

  let startIdx = 0;
  if(focusObjectiveId){
    const fi = s.objectives.findIndex(o => o.id === focusObjectiveId);
    if(fi >= 0) startIdx = fi;
  } else {
    const firstUnseen = s.objectives.findIndex(o => !sec.objectivesViewed.includes(o.id));
    startIdx = firstUnseen >= 0 ? firstUnseen : 0;
  }

  let current = startIdx;

  main.innerHTML = `
    <div class="topbar">
      <div>
        <div class="topbar-sub" style="margin-bottom:4px;"><button class="btn sm ghost" data-nav="dashboard" style="padding:3px 8px;">${iconSvg('chevron')} Dashboard</button></div>
        <h1>${s.title}</h1>
        <div class="topbar-sub">${s.blurb}</div>
      </div>
      <div class="topbar-actions">
        ${TTS_SUPPORTED ? ttsButtonHtml('id="listenSectionBtn"', 'Listen to section') : ''}
        ${best!==null ? `<span class="badge ${passed?'muted':'warn'}" style="font-size:11.5px; padding:5px 10px;">Best score ${Math.round(best*100)}%</span>` : ''}
      </div>
    </div>
    <div class="stepper-dots" id="stepperDots"></div>
    <div class="panel lesson-card" id="lessonCard"></div>
    <div class="stepper-nav">
      <button class="btn" id="prevBtn">${iconSvg('chevron')} Back</button>
      <span class="hint tabnum" id="stepLabel"></span>
      <button class="btn primary" id="nextBtn">Next ${iconSvg('chevron')}</button>
    </div>
    <div class="panel" id="quizPanel" style="text-align:center; display:none;">
      <h2 style="margin-bottom:6px;">Ready to test yourself?</h2>
      <p style="margin-bottom:16px;">${s.questions.length} practice questions &middot; need ${Math.round(PASS_THRESHOLD*100)}% to pass and unlock the next section.</p>
      <div style="display:flex; justify-content:center; gap:14px; flex-wrap:wrap; align-items:center;">
        <label class="pill-toggle" style="cursor:pointer;">
          <span class="switch ${STATE.settings.timedMode?'on':''}" id="timedSwitch"><i></i></span>
          <span>Timed mode (~30s/question)</span>
        </label>
        <button class="btn primary" id="startQuizBtn">${passed ? 'Retake quiz' : 'Start quiz'}</button>
      </div>
    </div>
  `;

  main.querySelector('[data-nav]').addEventListener('click', () => location.hash = '#/dashboard');
  const timedSwitch = document.getElementById('timedSwitch');
  timedSwitch.addEventListener('click', () => {
    STATE.settings.timedMode = !STATE.settings.timedMode;
    saveState();
    timedSwitch.classList.toggle('on', STATE.settings.timedMode);
  });
  document.getElementById('startQuizBtn').addEventListener('click', () => { location.hash = `#/quiz/${s.id}`; });

  if(TTS_SUPPORTED){
    const listenSectionBtn = document.getElementById('listenSectionBtn');
    listenSectionBtn.addEventListener('click', () => {
      const fullText = `${s.title}. ${s.blurb} ` + s.objectives.map(o => `${o.title}. ${stripHtml(o.body)}`).join(' ');
      ttsToggle(listenSectionBtn, 'Listen to section', fullText);
    });
  }

  function renderDots(){
    const dots = document.getElementById('stepperDots');
    dots.innerHTML = s.objectives.map((o,i) => `<button class="step-dot ${i===current?'active':''} ${sec.objectivesViewed.includes(o.id)?'done':''}" data-step="${i}" title="${o.title}"></button>`).join('');
    dots.querySelectorAll('[data-step]').forEach(d => d.addEventListener('click', () => goTo(+d.getAttribute('data-step'))));
  }

  function renderCard(){
    const o = s.objectives[current];
    const card = document.getElementById('lessonCard');
    card.innerHTML = `
      <div class="lesson-num">Objective ${current+1} of ${s.objectives.length}</div>
      <div class="lesson-title-row">
        <h3>${o.title}</h3>
        ${TTS_SUPPORTED ? ttsButtonHtml('id="listenObjectiveBtn"', 'Listen') : ''}
      </div>
      ${o.image ? `<div class="illustration-box">${ILLUSTRATIONS[o.image] ? ILLUSTRATIONS[o.image]() : ''}</div>` : ''}
      ${o.body}
      ${o.diagram ? `<div class="diagram-box">${DIAGRAMS[o.diagram]()}</div>` : ''}
    `;
    if(TTS_SUPPORTED){
      const btn = document.getElementById('listenObjectiveBtn');
      btn.addEventListener('click', () => ttsToggle(btn, 'Listen', `${o.title}. ${stripHtml(o.body)}`));
    }
    document.getElementById('stepLabel').textContent = `${current+1} / ${s.objectives.length}`;
    document.getElementById('prevBtn').disabled = current === 0;
    const isLast = current === s.objectives.length - 1;
    document.getElementById('nextBtn').innerHTML = isLast ? `Go to quiz ${iconSvg('chevron')}` : `Next ${iconSvg('chevron')}`;
    document.getElementById('quizPanel').style.display = isLast ? 'block' : 'none';

    if(!sec.objectivesViewed.includes(o.id)){
      markObjectiveViewed(s.id, o.id);
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goTo(i){
    ttsStop();
    current = Math.max(0, Math.min(s.objectives.length - 1, i));
    renderDots();
    renderCard();
  }

  document.getElementById('prevBtn').addEventListener('click', () => goTo(current - 1));
  document.getElementById('nextBtn').addEventListener('click', () => {
    if(current === s.objectives.length - 1){
      document.getElementById('quizPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      goTo(current + 1);
    }
  });

  renderDots();
  renderCard();
}
