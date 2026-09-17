// ---- Quiz engine ----
let quizSession = null;
const QUESTION_SECONDS = 30;
const CONFIDENCE_LABELS = ['Guessing', 'Somewhat sure', 'Confident'];

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function startQuiz(sectionId, isMistakeMode){
  let questions;
  if(isMistakeMode){
    questions = shuffle(activeMistakeQuestions());
  } else {
    const s = getSection(sectionId);
    questions = shuffle(s.questions);
  }
  quizSession = {
    sectionId, isMistakeMode, questions, index: 0, answers: [],
    timed: STATE.settings.timedMode, timeLeft: QUESTION_SECONDS, timerId: null,
    currentConfidence: null, locked: false, flagged: new Set(),
  };
  location.hash = isMistakeMode ? '#/quiz/mistakes' : `#/quiz/${sectionId}`;
  renderQuiz();
}

function clearTimer(){
  if(quizSession && quizSession.timerId){ clearInterval(quizSession.timerId); quizSession.timerId = null; }
}

function renderQuiz(){
  const main = document.getElementById('mainView');
  if(!quizSession){ location.hash = '#/dashboard'; return; }
  const qs = quizSession;
  const total = qs.questions.length;
  if(qs.index >= total){ finishQuiz(); return; }
  const q = qs.questions[qs.index];
  qs.currentConfidence = null;
  qs.locked = false;
  qs.timeLeft = QUESTION_SECONDS;

  const choiceLetters = ['A','B','C','D'];
  const choicesHtml = q.choices.map((c,i) => `
    <button class="choice-btn" data-choice="${i}" disabled>
      <span class="choice-letter">${choiceLetters[i]}</span><span>${c}</span>
    </button>
  `).join('');

  const confHtml = CONFIDENCE_LABELS.map((label,i) => `<button class="conf-btn" data-conf="${i}">${label}</button>`).join('');

  main.innerHTML = `
    <div class="topbar">
      <div>
        <div class="topbar-sub" style="margin-bottom:4px;"><button class="btn sm ghost" id="exitQuizBtn" style="padding:3px 8px;">${iconSvg('chevron')} Exit quiz</button></div>
        <h1>${qs.isMistakeMode ? 'Mistake replay' : getSection(qs.sectionId).title}</h1>
      </div>
      <div class="topbar-actions">
        ${qs.timed ? `<span class="timer-chip tabnum" id="timerChip">${QUESTION_SECONDS}s</span>` : ''}
        <span class="hint tabnum">Question ${qs.index+1} of ${total}${qs.flagged.size ? ` &middot; ${qs.flagged.size} flagged` : ''}</span>
      </div>
    </div>
    <div class="quiz-progress-bar"><i style="width:${Math.round((qs.index/total)*100)}%"></i></div>
    <div class="panel">
      <div class="quiz-head">
        ${q.scenario ? '<span class="badge muted">Scenario</span>' : '<span></span>'}
        <button class="btn sm flag-toggle-btn ${qs.flagged.has(q.id)?'active':''}" id="flagBtn">${iconSvg('flag')} ${qs.flagged.has(q.id) ? 'Flagged' : 'Flag for review'}</button>
      </div>
      <div class="q-prompt">${q.prompt}</div>
      <div class="confidence-row" id="confRow">${confHtml}</div>
      <div class="choice-list" id="choiceList">${choicesHtml}</div>
      <div id="explainHost"></div>
      <div class="quiz-foot" id="quizFoot"></div>
    </div>
  `;

  document.getElementById('exitQuizBtn').addEventListener('click', () => {
    clearTimer(); quizSession = null; location.hash = '#/dashboard';
  });

  document.getElementById('flagBtn').addEventListener('click', (e) => {
    if(qs.flagged.has(q.id)) qs.flagged.delete(q.id);
    else qs.flagged.add(q.id);
    const btn = e.currentTarget;
    const isFlagged = qs.flagged.has(q.id);
    btn.classList.toggle('active', isFlagged);
    btn.innerHTML = `${iconSvg('flag')} ${isFlagged ? 'Flagged' : 'Flag for review'}`;
    const hint = main.querySelector('.topbar-actions .hint');
    if(hint) hint.innerHTML = `Question ${qs.index+1} of ${total}${qs.flagged.size ? ` &middot; ${qs.flagged.size} flagged` : ''}`;
  });

  main.querySelectorAll('[data-conf]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(qs.locked) return;
      qs.currentConfidence = +btn.getAttribute('data-conf');
      main.querySelectorAll('[data-conf]').forEach(b => b.classList.toggle('selected', b === btn));
      main.querySelectorAll('[data-choice]').forEach(b => b.disabled = false);
    });
  });

  main.querySelectorAll('[data-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(qs.locked || qs.currentConfidence === null) return;
      lockAnswer(+btn.getAttribute('data-choice'));
    });
  });

  if(qs.timed){
    const chip = document.getElementById('timerChip');
    qs.timerId = setInterval(() => {
      qs.timeLeft--;
      if(chip){ chip.textContent = qs.timeLeft + 's'; chip.classList.toggle('low', qs.timeLeft <= 10); }
      if(qs.timeLeft <= 0){
        clearTimer();
        if(!qs.locked) lockAnswer(null);
      }
    }, 1000);
  }
}

function lockAnswer(choiceIndex){
  const qs = quizSession;
  clearTimer();
  qs.locked = true;
  const q = qs.questions[qs.index];
  const correct = choiceIndex === q.answer;
  qs.answers.push({ qId: q.id, sectionId: q.sectionId || qs.sectionId, chosenIndex: choiceIndex, correct, confidence: qs.currentConfidence });

  const main = document.getElementById('mainView');
  main.querySelectorAll('[data-choice]').forEach(btn => {
    const i = +btn.getAttribute('data-choice');
    btn.disabled = true;
    if(i === q.answer) btn.classList.add('correct');
    else if(i === choiceIndex) btn.classList.add('incorrect');
  });
  main.querySelectorAll('[data-conf]').forEach(b => b.disabled = true);

  const overconfident = correct === false && qs.currentConfidence === 2;
  document.getElementById('explainHost').innerHTML = `
    <div class="explain-box">
      <div class="tag ${correct?'correct':'incorrect'}">${correct ? iconSvg('check') : iconSvg('alert')} ${correct ? 'Correct' : (choiceIndex===null?'Time\'s up':'Incorrect')}</div>
      <p style="margin:0; color:var(--text);">${q.explanation}</p>
      ${overconfident ? `<p style="margin-top:8px; color:var(--warning); font-size:12.5px;">You marked this "Confident" &mdash; worth a second look.</p>` : ''}
    </div>
  `;
  const isLast = qs.index === qs.questions.length - 1;
  document.getElementById('quizFoot').innerHTML = `<button class="btn primary" id="nextBtn">${isLast ? 'See results' : 'Next question'}</button>`;
  document.getElementById('nextBtn').addEventListener('click', () => { qs.index++; renderQuiz(); });
}

function finishQuiz(){
  const qs = quizSession;
  const correctCount = qs.answers.filter(a=>a.correct).length;
  const score = qs.answers.length ? correctCount / qs.answers.length : 0;
  const attempt = { ts: Date.now(), score, total: qs.answers.length, correct: correctCount, passed: score >= PASS_THRESHOLD, answers: qs.answers, timed: qs.timed, mistakeMode: qs.isMistakeMode };

  let newBadges = [];
  if(qs.isMistakeMode){
    qs.answers.forEach(ans => scheduleReview(ans.qId, ans.correct, ans.sectionId || qs.sectionId));
    touchStreak();
    newBadges = refreshBadges();
    saveState();
  } else {
    newBadges = recordAttempt(qs.sectionId, attempt);
  }
  renderResults(qs, attempt, newBadges);
}

function renderResults(qs, attempt, newBadges){
  const main = document.getElementById('mainView');
  const pct = Math.round(attempt.score*100);
  const passed = attempt.passed;
  const missed = qs.answers.map((a,i) => Object.assign({}, a, { question: qs.questions[i] })).filter(a => !a.correct);
  const overconfidentMisses = missed.filter(a => a.confidence === 2).length;
  const flagged = qs.answers.map((a,i) => Object.assign({}, a, { question: qs.questions[i] })).filter(a => qs.flagged.has(a.qId));

  const badgeToastHtml = (newBadges && newBadges.length) ? `
    <div class="panel" style="border-color:rgba(251,191,36,.4); background:var(--warning-soft);">
      <div class="panel-head" style="margin-bottom:10px;"><h2>${iconSvg('flag')} New badge${newBadges.length>1?'s':''} earned!</h2></div>
      <div class="badge-grid">
        ${newBadges.map(b => `<div class="badge-chip earned"><span class="badge-chip-icon">${iconSvg(b.icon)}</span><div><div class="badge-chip-title">${b.title}</div><div class="badge-chip-desc">${b.desc}</div></div></div>`).join('')}
      </div>
    </div>
  ` : '';

  const ring = (() => {
    const r = 62, c = 2*Math.PI*r;
    const dash = c * attempt.score;
    const color = passed ? '#34d399' : (pct>=60?'#fbbf24':'#f87171');
    return `<svg viewBox="0 0 150 150" width="150" height="150">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"/>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${dash} ${c}" transform="rotate(-90 75 75)"/>
      <text x="75" y="70" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="30" font-weight="700" fill="#f0eef4">${pct}%</text>
      <text x="75" y="92" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#8f8d96">${attempt.correct}/${attempt.total} correct</text>
    </svg>`;
  })();

  const missListHtml = missed.length ? missed.map(m => `
    <div class="miss-item">
      <div class="miss-meta">
        <span class="badge danger">Missed</span>
        ${m.confidence===2 ? '<span class="badge warn">Marked confident</span>' : ''}
        ${m.chosenIndex===null ? '<span class="badge muted">Ran out of time</span>' : ''}
      </div>
      <div class="miss-q">${m.question.prompt}</div>
      <p style="margin-bottom:10px;">${m.question.explanation}</p>
      <button class="btn sm" data-review="${m.question.sectionId || qs.sectionId}::${m.question.objectiveId}">${iconSvg('book')} Review in lesson</button>
    </div>
  `).join('') : `<div class="empty-state" style="padding:24px;">${iconSvg('check')}<div>No missed questions &mdash; clean sweep.</div></div>`;

  const flaggedListHtml = flagged.length ? flagged.map(m => `
    <div class="miss-item">
      <div class="miss-meta">
        <span class="badge warn">${iconSvg('flag')} Flagged</span>
        <span class="badge ${m.correct?'muted':'danger'}">${m.correct ? 'Answered correctly' : 'Missed'}</span>
      </div>
      <div class="miss-q">${m.question.prompt}</div>
      <p style="margin-bottom:10px;">${m.question.explanation}</p>
      <button class="btn sm" data-review="${m.question.sectionId || qs.sectionId}::${m.question.objectiveId}">${iconSvg('book')} Review in lesson</button>
    </div>
  `).join('') : '';

  const flaggedPanelHtml = flagged.length ? `
    <div class="panel">
      <div class="panel-head"><h2>${iconSvg('flag')} Flagged for review</h2><span class="hint">${flagged.length} question${flagged.length===1?'':'s'}</span></div>
      <div class="miss-list">${flaggedListHtml}</div>
    </div>
  ` : '';

  const nextIdx = SECTIONS.findIndex(s=>s.id===qs.sectionId) + 1;
  const nextSection = SECTIONS[nextIdx];

  main.innerHTML = `
    ${badgeToastHtml}
    <div class="panel results-hero">
      <div class="score-ring-wrap">${ring}</div>
      <div class="results-verdict">${qs.isMistakeMode ? (missed.length ? 'Keep at it' : 'All cleared!') : (passed ? 'Section passed' : 'Not quite &mdash; 90% needed')}</div>
      <div class="results-sub">${qs.isMistakeMode ? `${attempt.correct - missed.length + missed.length /*noop*/}` : ''}${qs.isMistakeMode ? `You cleared ${attempt.correct} of ${attempt.total} previously-missed questions.` : (passed ? `Great work &mdash; ${nextSection ? nextSection.title+' is now unlocked.' : 'you\'ve unlocked every section.'}` : 'Review the lesson and retake when ready.')}</div>
      ${overconfidentMisses ? `<div class="results-sub" style="color:var(--warning); margin-top:6px;">${overconfidentMisses} miss${overconfidentMisses===1?'':'es'} were marked "Confident" &mdash; watch for overconfidence there.</div>` : ''}
      <div class="results-actions">
        <button class="btn" id="backDashBtn">Back to dashboard</button>
        <button class="btn primary" id="retakeBtn">${iconSvg('refresh')} Retake</button>
        ${(!qs.isMistakeMode && passed && nextSection) ? `<button class="btn primary" id="nextSecBtn">Next section ${iconSvg('chevron')}</button>` : ''}
      </div>
    </div>
    ${flaggedPanelHtml}
    <div class="panel">
      <div class="panel-head"><h2>Missed questions</h2><span class="hint">${missed.length} of ${attempt.total}</span></div>
      <div class="miss-list">${missListHtml}</div>
    </div>
  `;

  document.getElementById('backDashBtn').addEventListener('click', () => { quizSession = null; location.hash = '#/dashboard'; });
  document.getElementById('retakeBtn').addEventListener('click', () => { startQuiz(qs.sectionId, qs.isMistakeMode); });
  const nextBtn = document.getElementById('nextSecBtn');
  if(nextBtn) nextBtn.addEventListener('click', () => { quizSession = null; location.hash = `#/section/${nextSection.id}`; });
  main.querySelectorAll('[data-review]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [sid, oid] = btn.getAttribute('data-review').split('::');
      quizSession = null;
      location.hash = `#/section/${sid}/${oid}`;
    });
  });
}
