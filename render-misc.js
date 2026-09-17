// ---- Mistake replay entry + Settings views ----
function renderMistakes(){
  const main = document.getElementById('mainView');
  const items = activeMistakeQuestions();
  const upcoming = upcomingMistakeQuestions();
  main.innerHTML = `
    <div class="topbar">
      <div><h1>Mistake replay</h1><div class="topbar-sub">Spaced repetition: a miss comes back tomorrow, then in a few days, then weeks out &mdash; until you've proven you know it for good.</div></div>
    </div>
    ${items.length ? `
      <div class="panel" style="text-align:center;">
        <h2 style="margin-bottom:6px;">${items.length} question${items.length===1?'':'s'} due now</h2>
        <p style="margin-bottom:16px;">Answer correctly to push it further out on the schedule. Miss it again and it resets to due tomorrow.</p>
        <button class="btn primary" id="startMistakeBtn">${iconSvg('replay')} Start replay</button>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>By section</h2></div>
        <div class="section-rows">${sectionsBreakdown(items)}</div>
      </div>
    ` : `<div class="panel empty-state">${iconSvg('check')}<h2 style="font-size:16px; margin-bottom:6px;">Nothing due right now</h2><p>${upcoming.length ? `${upcoming.length} previously-missed question${upcoming.length===1?'':'s'} will resurface as ${upcoming.length===1?'its':'their'} review date comes up.` : 'You have no outstanding missed questions.'}</p></div>`}
    ${upcoming.length ? `
      <div class="panel">
        <div class="panel-head"><h2>Scheduled for later</h2><span class="hint">${upcoming.length} question${upcoming.length===1?'':'s'}</span></div>
        <div class="section-rows">${sectionsBreakdown(upcoming)}</div>
      </div>
    ` : ''}
  `;
  const btn = document.getElementById('startMistakeBtn');
  if(btn) btn.addEventListener('click', () => startQuiz(null, true));
}

function sectionsBreakdown(items){
  const counts = {};
  items.forEach(q => { counts[q.sectionShort] = (counts[q.sectionShort]||0) + 1; });
  return Object.keys(counts).map(k => `
    <div class="section-row">
      <div class="sr-index">${iconSvg('alert')}</div>
      <div class="sr-body"><div class="sr-title">${k}</div></div>
      <div class="sr-score">${counts[k]} q</div>
    </div>
  `).join('');
}

function renderSettings(){
  const main = document.getElementById('mainView');
  main.innerHTML = `
    <div class="topbar"><div><h1>Settings</h1><div class="topbar-sub">Progress is saved in this browser only.</div></div></div>
    <div class="panel">
      <div class="field-row">
        <div><div class="field-label">Districts competition date</div><div class="field-sub">Powers the countdown on your dashboard</div></div>
        <input type="date" id="compDate" value="${STATE.competitionDate || ''}"/>
      </div>
      <div class="field-row">
        <div><div class="field-label">Study plan start date</div><div class="field-sub">Powers the "this week" banner &mdash; adjust it once districts are confirmed</div></div>
        <input type="date" id="planStartDate" value="${STATE.planStartDate || ''}"/>
      </div>
      <div class="field-row">
        <div><div class="field-label">Timed quiz mode</div><div class="field-sub">~30 seconds per question, matching real test pacing</div></div>
        <span class="switch ${STATE.settings.timedMode?'on':''}" id="settingsTimedSwitch" style="cursor:pointer;"><i></i></span>
      </div>
      <div class="field-row">
        <div><div class="field-label">Study streak</div><div class="field-sub">${STATE.streak.count} day${STATE.streak.count===1?'':'s'} in a row</div></div>
        <span class="badge muted">${iconSvg('flame')}</span>
      </div>
    </div>
    <div class="panel">
      <div class="field-row" style="border:none;">
        <div><div class="field-label" style="color:var(--danger);">Reset all progress</div><div class="field-sub">Clears every quiz attempt, streak, and lesson checkmark. Cannot be undone.</div></div>
        <button class="btn" id="resetBtn" style="border-color:rgba(248,113,113,.4); color:var(--danger);">Reset</button>
      </div>
    </div>
  `;
  document.getElementById('compDate').addEventListener('change', (e) => {
    STATE.competitionDate = e.target.value || null; saveState();
  });
  document.getElementById('planStartDate').addEventListener('change', (e) => {
    STATE.planStartDate = e.target.value || null; saveState();
  });
  document.getElementById('settingsTimedSwitch').addEventListener('click', (e) => {
    STATE.settings.timedMode = !STATE.settings.timedMode; saveState();
    e.currentTarget.classList.toggle('on', STATE.settings.timedMode);
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    if(confirm('Reset all study progress? This cannot be undone.')){
      resetAllProgress();
      location.hash = '#/dashboard';
      router();
    }
  });
}
