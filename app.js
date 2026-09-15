'use strict';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const KEY = 'lifespan-eval-form-v1';
const COURSE = 'Words are Not Enough: Sensorimotor Interventions for Suicidality among Adults, Adolescents and Children';

const LIKERT = [
  { value: '1', label: '1 ★ Strongly Disagree' },
  { value: '2', label: '2 ★ Disagree' },
  { value: '3', label: '3 ★ Neutral' },
  { value: '4', label: '4 ★ Agree' },
  { value: '5', label: '5 ★ Strongly Agree' }
];

const LEARN_SCALE = [
  { value: '1', label: '1 very little' },
  { value: '2', label: '2' },
  { value: '3', label: '3 some' },
  { value: '4', label: '4' },
  { value: '5', label: '5 Great deal' }
];

const USEFUL_SCALE = [
  { value: '1', label: '1 not useful' },
  { value: '2', label: '2' },
  { value: '3', label: '3 Moderately Useful' },
  { value: '4', label: '4' },
  { value: '5', label: '5 Extremely Useful' }
];

const RECOMMEND_SCALE = [
  { value: '1', label: '1 No' },
  { value: '2', label: '2' },
  { value: '3', label: '3 Maybe' },
  { value: '4', label: '4' },
  { value: '5', label: '5 yes' }
];

const CONFIDENCE_SCALE = [
  { value: '0', label: '0%' },
  { value: '25', label: '25%' },
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' }
];

const PRESENTER_ITEMS = [
  'presenter was knowledgeable in the content material',
  'presenter competently delivered the content in an accessible and organized manner',
  'presenter covered the stated objectives in depth',
  'presenter maintained my interest',
  'presenter was responsive to questions, comments, and opinions',
  'presenter clarified content and answered questions effectively',
  'Content was consistent with the objectives',
  'content was appropriate for my professional level',
  'instruction was at a level appropriate to my professional level',
  'Teaching methods were effective',
  'presentation materials (visual aids, handouts) clarified content'
];

const PAGES = [
  { id: 'learning', label: '1. Learning' },
  { id: 'objectives', label: '2. Learning Objectives' },
  { id: 'environment', label: '3. Environment & Admin' },
  { id: 'feedback', label: '4. Open Feedback' },
  { id: 'identity', label: '5. Identifiers' }
];

const defaultAnswers = () => ({
  applyKnowledge: '',
  fulfilledNeeds: '',
  activityFormat: '',
  professionalEffectiveness: '',
  culturalDifferences: '',
  howMuchLearned: '',
  howUseful: '',
  recommend: '',
  confidence: '',
  obj1: '', obj2: '', obj3: '', obj4: '', obj5: '',
  pat: Object.fromEntries(PRESENTER_ITEMS.map((_, i) => [`q${i}`, ''])),
  bonnie: Object.fromEntries(PRESENTER_ITEMS.map((_, i) => [`q${i}`, ''])),
  envDigital: '',
  envInterface: '',
  envInstructions: '',
  envAv: '',
  envTech: '',
  adminPromo: '',
  adminRequirements: '',
  adminRegistration: '',
  adminAccuracy: '',
  adminBias: '',
  adminSupport: '',
  adminResearch: '',
  adminDisclosures: '',
  applications: '',
  challenges: '',
  topics: '',
  likedMost: '',
  likedLeast: '',
  enhance: '',
  title: '',
  firstName: '',
  lastName: '',
  license: '',
  email: '',
  emailVerify: ''
});

let page = 0;
let submitted = false;
let answers = defaultAnswers();

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.answers) answers = { ...defaultAnswers(), ...saved.answers, pat: { ...defaultAnswers().pat, ...(saved.answers.pat || {}) }, bonnie: { ...defaultAnswers().bonnie, ...(saved.answers.bonnie || {}) } };
  if (typeof saved?.page === 'number') page = Math.min(Math.max(saved.page, 0), PAGES.length - 1);
  if (saved?.submitted) submitted = true;
} catch { /* ignore corrupt storage */ }

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ answers, page, submitted }));
  } catch { /* storage unavailable */ }
};

const toast = (msg) => {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
};

const likertField = (name, text, value, scale = LIKERT) => `
  <fieldset class="question">
    <legend>${esc(text)}</legend>
    <div class="choices">
      ${scale.map((opt) => `
        <label class="choice">
          <input type="radio" name="${esc(name)}" value="${esc(opt.value)}" ${value === opt.value ? 'checked' : ''} required>
          <span>${esc(opt.label)}</span>
        </label>`).join('')}
    </div>
  </fieldset>`;

const textArea = (name, label, value, required = true) => `
  <div class="field">
    <label for="${esc(name)}">${esc(label)}</label>
    <textarea id="${esc(name)}" name="${esc(name)}" ${required ? 'required' : ''} placeholder="Enter your answer...">${esc(value)}</textarea>
  </div>`;

const textInput = (name, label, value, required = true) => `
  <div class="field">
    <label for="${esc(name)}">${esc(label)}${required ? ' *' : ''}</label>
    <input id="${esc(name)}" name="${esc(name)}" type="text" value="${esc(value)}" ${required ? 'required' : ''}>
  </div>`;

const emailInput = (name, label, value) => `
  <div class="field">
    <label for="${esc(name)}">${esc(label)} *</label>
    <input id="${esc(name)}" name="${esc(name)}" type="email" value="${esc(value)}" required>
  </div>`;

const steps = () => `
  <div class="steps" aria-label="Evaluation progress">
    ${PAGES.map((p, i) => `<span class="step ${i === page ? 'active' : ''} ${i < page ? 'done' : ''}">${esc(p.label)}</span>`).join('')}
  </div>`;

const shell = (body) => `
  <header class="topbar">
    <img src="assets/logo.png" alt="Lifespan Learning Institute">
    <div class="meta">Course Evaluation<br>Page ${page + 1} of ${PAGES.length}</div>
  </header>
  <main id="main">
    ${steps()}
    <p class="page-label">${esc(PAGES[page].label)}</p>
    <p class="course-title">${esc(COURSE)}</p>
    <form id="eval-form" novalidate>${body}</form>
  </main>`;

const pageLearning = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Learning</h2>
      <p>Please indicate your agreement with the following statements.</p>
    </div>
    <div class="scale-legend">1 ★ = Strongly Disagree &nbsp;·&nbsp; 2 ★ = Disagree &nbsp;·&nbsp; 3 ★ = Neutral &nbsp;·&nbsp; 4 ★ = Agree &nbsp;·&nbsp; 5 ★ = Strongly Agree</div>
    ${likertField('applyKnowledge', 'I will apply the knowledge/skills I learned', answers.applyKnowledge)}
    ${likertField('fulfilledNeeds', 'This program fulfilled my educational needs', answers.fulfilledNeeds)}
    ${likertField('activityFormat', 'Activity format enhanced achievement of learning objectives', answers.activityFormat)}
    ${likertField('professionalEffectiveness', 'This program improved my professional effectiveness and expertise', answers.professionalEffectiveness)}
    ${likertField('culturalDifferences', 'Cultural, racial, ethnic, socioeconomic, and gender differences were considered.', answers.culturalDifferences)}
    ${likertField('howMuchLearned', 'How much did you learn in this program?', answers.howMuchLearned, LEARN_SCALE)}
    ${likertField('howUseful', 'How useful was the content of this CE program for your practice or other professional development?', answers.howUseful, USEFUL_SCALE)}
    ${likertField('recommend', 'Would you recommend this program to others?', answers.recommend, RECOMMEND_SCALE)}
    ${likertField('confidence', 'What degree of confidence do you have that you will apply your “new” learning in your practice:', answers.confidence, CONFIDENCE_SCALE)}
  </section>
  <div class="actions between">
    <button type="button" class="btn outline" data-action="cancel">Cancel</button>
    <button type="submit" class="btn primary" data-nav="next">Continue</button>
  </div>`;

const presenterBlock = (key, name) => `
  <h3 class="section-title">${esc(name)}</h3>
  <div class="scale-legend">1 ★ = Strongly Disagree &nbsp;·&nbsp; 2 ★ = Disagree &nbsp;·&nbsp; 3 ★ = Neutral &nbsp;·&nbsp; 4 ★ = Agree &nbsp;·&nbsp; 5 ★ = Strongly Agree</div>
  ${PRESENTER_ITEMS.map((text, i) => likertField(`${key}.q${i}`, text, answers[key][`q${i}`])).join('')}`;

const pageObjectives = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Learning Objectives</h2>
      <p>After attending this activity I am able to:</p>
    </div>
    <div class="scale-legend">1 ★ = Strongly Disagree &nbsp;·&nbsp; 2 ★ = Disagree &nbsp;·&nbsp; 3 ★ = Neutral &nbsp;·&nbsp; 4 ★ = Agree &nbsp;·&nbsp; 5 ★ = Strongly Agree</div>
    ${likertField('obj1', 'Determine three bodily cues that can indicate hopelessness, helplessness and despair in session.', answers.obj1)}
    ${likertField('obj2', 'Assess the role of the body in generating and maintaining depression in psychotherapy with adults, children and adolescents in clinical settings.', answers.obj2)}
    ${likertField('obj3', 'Analyze the efficacy of working with the body to improve clinical outcome in treatment of suicidal adults, children and adolescents.', answers.obj3)}
    ${likertField('obj4', 'Demonstrate three body oriented interventions and their clinical implications for treating suicidality and related emotions in adults, children and adolescents.', answers.obj4)}
    ${likertField('obj5', 'Distinguish the role of mindfulness in adult, child and adolescent treatment from “talk therapy.”', answers.obj5)}
    ${presenterBlock('pat', 'Pat Ogden, PhD')}
    ${presenterBlock('bonnie', 'Bonnie Goldstein, PhD')}
  </section>
  <div class="actions between">
    <button type="button" class="btn outline" data-nav="prev">Previous</button>
    <button type="submit" class="btn primary" data-nav="next">Continue</button>
  </div>`;

const pageEnvironment = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Environment and Administration</h2>
      <p>After attending this activity I am able to:</p>
    </div>
    <h3 class="section-title">Environment</h3>
    <div class="scale-legend">1 ★ = Strongly Disagree &nbsp;·&nbsp; 2 ★ = Disagree &nbsp;·&nbsp; 3 ★ = Neutral &nbsp;·&nbsp; 4 ★ = Agree &nbsp;·&nbsp; 5 ★ = Strongly Agree</div>
    ${likertField('envDigital', 'The digital materials were conducive to my learning', answers.envDigital)}
    ${likertField('envInterface', 'The web interface was reasonably convenient and accessible', answers.envInterface)}
    ${likertField('envInstructions', 'Instructions to access materials were clear', answers.envInstructions)}
    ${likertField('envAv', 'The activity’s audio/visual support was good', answers.envAv)}
    ${likertField('envTech', 'If applicable, tech support was helpful', answers.envTech)}
    <h3 class="section-title">Program Administration</h3>
    ${likertField('adminPromo', 'Program promotional materials (ads, brochures, web pages) were accurate and informative', answers.adminPromo)}
    ${likertField('adminRequirements', 'Requirements for successful completion of the activity were clear', answers.adminRequirements)}
    ${likertField('adminRegistration', 'Registration procedures and confirmation were straight forward', answers.adminRegistration)}
    ${likertField('adminAccuracy', 'Information on the accuracy and utility of the materials to be presented, the basis of such statements, the limitations of the content being taught and the severe and most common risks was made available and easily accessible.', answers.adminAccuracy)}
    ${likertField('adminBias', 'It was clear that the instructional content was free of commercial bias', answers.adminBias)}
    ${likertField('adminSupport', 'It was clear whether or not the planners or presenters received commercial support or had any relationships that could be reasonably construed as a conflict of interest', answers.adminSupport)}
    ${likertField('adminResearch', 'It was clear whether or not the research and development of this activity’s content received commercial support', answers.adminResearch)}
    ${likertField('adminDisclosures', 'Disclosures of potential conflict of interest by faculty were clearly communicated', answers.adminDisclosures)}
  </section>
  <div class="actions between">
    <button type="button" class="btn outline" data-nav="prev">Previous</button>
    <button type="submit" class="btn primary" data-nav="next">Continue</button>
  </div>`;

const pageFeedback = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Open Feedback</h2>
      <p>Please share written responses for program improvement.</p>
    </div>
    ${textArea('applications', 'Based upon information you received from this program, please list at least two applications that can be made to your clinical practice', answers.applications)}
    ${textArea('challenges', 'Are there any specific challenges that you encounter in your practice that you would like to see addressed in future programs?', answers.challenges)}
    ${textArea('topics', 'List three topics or experts you would find interesting and professionally relevant for future CME conferences', answers.topics)}
    ${textArea('likedMost', 'What did you like most about this conference?', answers.likedMost)}
    ${textArea('likedLeast', 'What did you like least about this conference?', answers.likedLeast)}
    ${textArea('enhance', 'What can we do to enhance your CE experience?', answers.enhance)}
  </section>
  <div class="actions between">
    <button type="button" class="btn outline" data-nav="prev">Previous</button>
    <button type="submit" class="btn primary" data-nav="next">Continue</button>
  </div>`;

const pageIdentity = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Identifiers — Verification</h2>
      <p>Participant Identity Verification</p>
    </div>
    <div class="note">
      Please confirm your personal information for your CE Credit Certificate. The information you provide here will be cross checked with your registration information and sign-in/out sheets to assure accuracy.
      This information is stored separately from your responses to assure the anonymity of your evaluation responses.
    </div>
    <p><strong>Enter your Name exactly as it appears on your license</strong></p>
    <div class="grid three">
      ${textInput('title', 'Title', answers.title, false)}
      ${textInput('firstName', 'First Name', answers.firstName)}
      ${textInput('lastName', 'Last Name', answers.lastName)}
    </div>
    ${textArea('license', 'Your professional license number (If you have more than one license #, please indicate the type next to each)', answers.license)}
    ${emailInput('email', 'Enter your email address', answers.email)}
    ${emailInput('emailVerify', 'Please verify your email address so we may keep you updated about upcoming programs', answers.emailVerify)}
    <p class="error" id="form-error" hidden></p>
  </section>
  <div class="actions between">
    <div class="actions">
      <button type="button" class="btn outline" data-action="cancel">Cancel</button>
      <button type="button" class="btn outline" data-nav="prev">Previous</button>
    </div>
    <button type="submit" class="btn primary" data-nav="finish">Finish</button>
  </div>`;

const pageDone = () => `
  <header class="topbar">
    <img src="assets/logo.png" alt="Lifespan Learning Institute">
  </header>
  <main id="main">
    <section class="panel success">
      <h1>Evaluation submitted</h1>
      <p>Thank you. Your course evaluation for <strong>${esc(COURSE)}</strong> has been recorded for this preview.</p>
      <p class="muted">Your identity details are kept separate from rating responses in the live workflow.</p>
      <div class="actions" style="justify-content:center;margin-top:24px">
        <button type="button" class="btn primary" data-action="restart">Start another evaluation</button>
      </div>
    </section>
  </main>`;

const readForm = (form) => {
  const data = new FormData(form);
  const next = structuredClone(answers);
  for (const [key, value] of data.entries()) {
    if (key.startsWith('pat.')) next.pat[key.slice(4)] = String(value);
    else if (key.startsWith('bonnie.')) next.bonnie[key.slice(7)] = String(value);
    else next[key] = String(value);
  }
  return next;
};

const validateCurrent = (form) => {
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }
  if (page === 4) {
    const err = $('#form-error');
    if (answers.email.trim().toLowerCase() !== answers.emailVerify.trim().toLowerCase()) {
      err.hidden = false;
      err.textContent = 'Email addresses must match.';
      return false;
    }
    err.hidden = true;
  }
  return true;
};

const render = () => {
  if (submitted) {
    $('#app').innerHTML = pageDone();
    return;
  }
  const bodies = [pageLearning, pageObjectives, pageEnvironment, pageFeedback, pageIdentity];
  $('#app').innerHTML = shell(bodies[page]());
  window.scrollTo(0, 0);
};

document.addEventListener('submit', (e) => {
  const form = e.target.closest('#eval-form');
  if (!form) return;
  e.preventDefault();
  answers = readForm(form);
  if (!validateCurrent(form)) return;

  const nav = e.submitter?.dataset?.nav || 'next';
  if (nav === 'finish') {
    submitted = true;
    persist();
    toast('Evaluation submitted');
    render();
    return;
  }
  page = Math.min(page + 1, PAGES.length - 1);
  persist();
  render();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-nav],[data-action]');
  if (!btn) return;

  if (btn.dataset.action === 'cancel') {
    if (confirm('Cancel and clear this evaluation?')) {
      answers = defaultAnswers();
      page = 0;
      submitted = false;
      persist();
      toast('Evaluation cleared');
      render();
    }
    return;
  }

  if (btn.dataset.action === 'restart') {
    answers = defaultAnswers();
    page = 0;
    submitted = false;
    persist();
    render();
    return;
  }

  if (btn.dataset.nav === 'prev') {
    const form = $('#eval-form');
    if (form) answers = readForm(form);
    page = Math.max(page - 1, 0);
    persist();
    render();
  }
});

render();
