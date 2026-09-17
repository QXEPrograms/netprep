// ---- State: read/write localStorage, safe fallbacks ----
const STORE_KEY = 'fbla-netstudy-v1';
const PASS_THRESHOLD = 0.9;
// Leitner-style spaced repetition: a miss resets to day 0 (due now); each correct
// review pushes the next review further out until it graduates out of rotation.
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35];
// Mirrors the "Weekly Study Schedule" table from the original study plan.
const WEEK_PLAN = [
  { from: 1, to: 2, sectionId: 'basics', label: 'Networking Basics' },
  { from: 3, to: 4, sectionId: 'topologies', label: 'Network Topologies and Architecture' },
  { from: 5, to: 7, sectionId: 'security', label: 'Network Security', note: 'extra week &mdash; it\'s the biggest section' },
  { from: 8, to: 9, sectionId: 'protocols', label: 'Network Protocols and Standards' },
  { from: 10, to: 10, sectionId: 'hardware', label: 'Network Hardware and Connectivity' },
];
const WEEK_PLAN_TOTAL_WEEKS = 11;
const WEEK_PLAN_DEFAULT_START = '2026-09-16';

const SECTIONS = [window.SECTION_BASICS, window.SECTION_TOPOLOGIES, window.SECTION_SECURITY, window.SECTION_PROTOCOLS, window.SECTION_HARDWARE];

function defaultState(){
  const sections = {};
  SECTIONS.forEach(s => { sections[s.id] = { objectivesViewed: [], attempts: [] }; });
  return {
    competitionDate: null,
    planStartDate: WEEK_PLAN_DEFAULT_START,
    streak: { count: 0, lastActiveDate: null },
    sections,
    mistakeBank: {},
    badges: {},
    lastRoute: null,
    flashcardsKnown: [],
    settings: { timedMode: false, readingMode: false },
  };
}

// Which week of the plan "today" falls in (1-based). null if the plan hasn't started yet or isn't set.
function currentWeekNumber(){
  if(!STATE.planStartDate) return null;
  const start = new Date(STATE.planStartDate + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  const diffDays = Math.round((now - start) / 86400000);
  if(diffDays < 0) return null;
  return Math.floor(diffDays / 7) + 1;
}

// The plan-table entry (or the "review phase" fallback for week 11+) for a given week number.
function weekFocus(weekNum){
  if(!weekNum || weekNum < 1) return null;
  const entry = WEEK_PLAN.find(e => weekNum >= e.from && weekNum <= e.to);
  if(entry) return entry;
  return { from: 11, to: Infinity, sectionId: null, label: 'Full practice tests + drilling weak areas', note: 'no new material &mdash; pure repetition and closing gaps' };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    // shallow-merge to survive schema additions
    SECTIONS.forEach(s => { if(!parsed.sections || !parsed.sections[s.id]) return; base.sections[s.id] = Object.assign(base.sections[s.id], parsed.sections[s.id]); });
    return Object.assign(base, parsed, { sections: base.sections });
  }catch(e){
    return defaultState();
  }
}

let STATE = loadState();
applyReadingMode();

function saveState(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }catch(e){ /* private mode / storage blocked: continue in-memory */ }
}

function todayStr(){ return new Date().toISOString().slice(0,10); }

function addDays(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function touchStreak(){
  const today = todayStr();
  const s = STATE.streak;
  if(s.lastActiveDate === today) return;
  if(s.lastActiveDate){
    const prev = new Date(s.lastActiveDate);
    const diffDays = Math.round((new Date(today) - prev) / 86400000);
    s.count = diffDays === 1 ? s.count + 1 : 1;
  } else {
    s.count = 1;
  }
  s.lastActiveDate = today;
  saveState();
}

function markObjectiveViewed(sectionId, objectiveId){
  const sec = STATE.sections[sectionId];
  if(!sec.objectivesViewed.includes(objectiveId)){
    sec.objectivesViewed.push(objectiveId);
    touchStreak();
    refreshBadges();
    saveState();
  }
}

function getSection(id){ return SECTIONS.find(s => s.id === id); }

function sectionObjectiveProgress(sectionId){
  const def = getSection(sectionId);
  const sec = STATE.sections[sectionId];
  return def.objectives.length ? sec.objectivesViewed.length / def.objectives.length : 0;
}

function sectionBestScore(sectionId){
  const attempts = STATE.sections[sectionId].attempts;
  if(!attempts.length) return null;
  return Math.max(...attempts.map(a => a.score));
}

function sectionPassed(sectionId){
  const best = sectionBestScore(sectionId);
  return best !== null && best >= PASS_THRESHOLD;
}

function sectionUnlocked(index){
  if(index === 0) return true;
  return sectionPassed(SECTIONS[index - 1].id);
}

function firstUnfinishedSection(){
  for(let i = 0; i < SECTIONS.length; i++){
    if(!sectionUnlocked(i)) return SECTIONS[i - 1] ? SECTIONS[i - 1] : SECTIONS[0];
    if(!sectionPassed(SECTIONS[i].id)) return SECTIONS[i];
  }
  return SECTIONS[SECTIONS.length - 1];
}

function overallProgress(){
  // average of (objective coverage + best score achieved) across sections, weighted by exam weight
  const totalWeight = SECTIONS.reduce((a,s)=>a+s.weight,0);
  let acc = 0;
  SECTIONS.forEach(s => {
    const cov = sectionObjectiveProgress(s.id);
    const score = sectionBestScore(s.id) || 0;
    const secProgress = (cov * 0.4) + (Math.min(score,1) * 0.6);
    acc += secProgress * (s.weight / totalWeight);
  });
  return acc;
}

function allAttemptsChronological(){
  const list = [];
  SECTIONS.forEach(s => {
    STATE.sections[s.id].attempts.forEach(a => list.push(Object.assign({ sectionId: s.id, sectionShort: s.short }, a)));
  });
  list.sort((a,b) => a.ts - b.ts);
  return list;
}

function overallAccuracy(){
  const attempts = allAttemptsChronological();
  if(!attempts.length) return null;
  let correct = 0, total = 0;
  attempts.forEach(a => { correct += a.answers.filter(x=>x.correct).length; total += a.answers.length; });
  return total ? correct/total : null;
}

function weakestSection(){
  let worst = null, worstScore = Infinity;
  SECTIONS.forEach(s => {
    const attempts = STATE.sections[s.id].attempts;
    if(!attempts.length) return;
    const avg = attempts.reduce((a,x)=>a+x.score,0) / attempts.length;
    if(avg < worstScore){ worstScore = avg; worst = s; }
  });
  return worst ? { section: worst, avg: worstScore } : null;
}

function daysUntil(dateStr){
  if(!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target - now) / 86400000);
}

// ---- Milestone badges ----
const BADGES = [
  { id: 'first-quiz', title: 'First Steps', desc: 'Complete your first quiz attempt', icon: 'quiz', check: () => allAttemptsChronological().length >= 1 },
  { id: 'streak-3', title: '3-Day Streak', desc: 'Study three days in a row', icon: 'flame', check: () => STATE.streak.count >= 3 },
  { id: 'streak-7', title: 'Week Streak', desc: 'Study seven days in a row', icon: 'flame', check: () => STATE.streak.count >= 7 },
  { id: 'passed-basics', title: 'Basics Passed', desc: 'Pass the Networking Basics quiz', icon: 'book', check: () => sectionPassed('basics') },
  { id: 'passed-topologies', title: 'Topologies Passed', desc: 'Pass the Topologies quiz', icon: 'book', check: () => sectionPassed('topologies') },
  { id: 'passed-security', title: 'Security Passed', desc: 'Pass the Network Security quiz', icon: 'book', check: () => sectionPassed('security') },
  { id: 'passed-protocols', title: 'Protocols Passed', desc: 'Pass the Protocols quiz', icon: 'book', check: () => sectionPassed('protocols') },
  { id: 'passed-hardware', title: 'Hardware Passed', desc: 'Pass the Hardware quiz', icon: 'book', check: () => sectionPassed('hardware') },
  { id: 'perfect-score', title: 'Perfect Score', desc: 'Score 100% on any quiz', icon: 'target', check: () => allAttemptsChronological().some(a => a.score >= 1) },
  { id: 'mistake-slayer', title: 'Mistake Slayer', desc: 'Clear 10 missed questions for good', icon: 'check', check: () => Object.values(STATE.mistakeBank).filter(e => e.cleared).length >= 10 },
  { id: 'certified', title: 'Certified', desc: 'Pass all five sections', icon: 'flag', check: () => SECTIONS.every(s => sectionPassed(s.id)) },
];

// Marks any newly-qualified badges as earned and returns just the ones earned this call (for a toast).
function refreshBadges(){
  const newly = [];
  BADGES.forEach(b => {
    if(!STATE.badges[b.id] && b.check()){
      STATE.badges[b.id] = todayStr();
      newly.push(b);
    }
  });
  return newly;
}

function scheduleReview(qId, correct, sectionId){
  const today = todayStr();
  let entry = STATE.mistakeBank[qId];
  if(!entry){
    if(correct) return; // never missed before and got it right: nothing to track
    entry = { intervalIndex: 0, cleared: false, missedCount: 0, sectionId };
    STATE.mistakeBank[qId] = entry;
  }
  entry.sectionId = sectionId;
  if(correct){
    entry.intervalIndex = (entry.intervalIndex || 0) + 1;
    if(entry.intervalIndex >= REVIEW_INTERVALS_DAYS.length){
      entry.cleared = true;
      entry.nextReviewDate = null;
    } else {
      entry.cleared = false;
      entry.nextReviewDate = addDays(today, REVIEW_INTERVALS_DAYS[entry.intervalIndex]);
    }
  } else {
    entry.missedCount = (entry.missedCount || 0) + 1;
    entry.intervalIndex = 0;
    entry.cleared = false;
    entry.nextReviewDate = today;
  }
}

function recordAttempt(sectionId, attempt){
  STATE.sections[sectionId].attempts.push(attempt);
  attempt.answers.forEach(ans => scheduleReview(ans.qId, ans.correct, sectionId));
  touchStreak();
  const newBadges = refreshBadges();
  saveState();
  return newBadges;
}

function mistakeBankEntries(filterFn){
  const today = todayStr();
  const ids = Object.keys(STATE.mistakeBank).filter(id => filterFn(STATE.mistakeBank[id], today));
  const out = [];
  SECTIONS.forEach(s => s.questions.forEach(q => { if(ids.includes(q.id)) out.push(Object.assign({ sectionId: s.id, sectionShort: s.short }, q)); }));
  return out;
}

// Due for review right now (a fresh miss, or a spaced-repetition interval that has elapsed).
function activeMistakeQuestions(){
  return mistakeBankEntries((e, today) => !e.cleared && e.nextReviewDate && e.nextReviewDate <= today);
}

// Missed before, correctly answered since, and scheduled to resurface later — not due yet.
function upcomingMistakeQuestions(){
  return mistakeBankEntries((e, today) => !e.cleared && e.nextReviewDate && e.nextReviewDate > today);
}

function resetAllProgress(){
  STATE = defaultState();
  saveState();
  applyReadingMode();
}

function applyReadingMode(){
  try{ document.documentElement.setAttribute('data-reading', STATE.settings.readingMode ? 'on' : 'off'); }catch(e){ /* ignore */ }
}
