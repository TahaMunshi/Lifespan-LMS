'use strict';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const KEY = 'lifespan-eval-form-v1';
const COURSE = 'Words are Not Enough: Sensorimotor Interventions for Suicidality among Adults, Adolescents and Children';
const INSTRUCTORS = 'Pat Ogden, PhD and Bonnie Goldstein, PhD';
const CE_HOURS = 6;

const LIKERT = [
  { value: '1', number: '1', label: 'Strongly disagree' },
  { value: '2', number: '2', label: 'Disagree' },
  { value: '3', number: '3', label: 'Neutral' },
  { value: '4', number: '4', label: 'Agree' },
  { value: '5', number: '5', label: 'Strongly agree' }
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
let view = 'form'; // 'form' | 'certificate'
let answers = defaultAnswers();
let certificateReady = false;
let certNumber = 'LLI-2026-' + String(Date.now()).slice(-6);

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.answers) answers = { ...defaultAnswers(), ...saved.answers, pat: { ...defaultAnswers().pat, ...(saved.answers.pat || {}) }, bonnie: { ...defaultAnswers().bonnie, ...(saved.answers.bonnie || {}) } };
  if (typeof saved?.page === 'number') page = Math.min(Math.max(saved.page, 0), PAGES.length - 1);
  if (saved?.view === 'certificate') view = 'certificate';
  if (saved?.certNumber) certNumber = saved.certNumber;
} catch { /* ignore corrupt storage */ }

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ answers, page, view, certNumber }));
  } catch { /* storage unavailable */ }
};

const participantName = () => {
  const parts = [answers.title, answers.firstName, answers.lastName].map((s) => String(s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : 'Margaret Whitfield, LCSW';
};

const toast = (msg) => {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2800);
};

const likertField = (name, text, value) => `
  <fieldset class="question rating-question">
    <legend>${esc(text)}</legend>
    <div class="star-scale">
      ${LIKERT.map((opt) => `
        <label class="star-choice">
          <input type="radio" name="${esc(name)}" value="${esc(opt.value)}" ${value === opt.value ? 'checked' : ''} required>
          <span class="rating-label"><strong>${esc(opt.number)}</strong>${esc(opt.label)}</span>
          <span class="star" aria-hidden="true">★</span>
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
  <div class="progress-wrap">
    <div class="progress-copy"><span>Evaluation progress</span><strong>${page + 1} of ${PAGES.length}</strong></div>
    <div class="progress-track"><span style="width:${((page + 1) / PAGES.length) * 100}%"></span></div>
    <div class="steps" aria-label="Evaluation progress">
      ${PAGES.map((p, i) => `<span class="step ${i === page ? 'active' : ''} ${i < page ? 'done' : ''}"><i>${i < page ? '✓' : i + 1}</i><span>${esc(p.label.replace(/^\d+\.\s*/, ''))}</span></span>`).join('')}
    </div>
  </div>`;

const shell = (body) => `
  <header class="topbar">
    <div class="topbar-inner">
      <img src="assets/logo.png" alt="Lifespan Learning Institute">
      <div class="meta">
        <span>Course evaluation</span>
        <button type="button" class="text-link" data-action="certificate">Preview certificate</button>
      </div>
    </div>
  </header>
  <main id="main">
    ${steps()}
    <section class="course-intro">
      <p class="eyebrow">Continuing education evaluation</p>
      <h1>${esc(COURSE)}</h1>
      <p>Your feedback helps us improve future learning experiences. All rating questions use the same five-point scale.</p>
    </section>
    <form id="eval-form" novalidate>${body}</form>
  </main>`;

const pageLearning = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Learning</h2>
      <p>Please indicate your agreement with the following statements.</p>
    </div>
    <p class="rating-help"><span aria-hidden="true">★</span> Select one response for each statement.</p>
    ${likertField('applyKnowledge', 'I will apply the knowledge/skills I learned', answers.applyKnowledge)}
    ${likertField('fulfilledNeeds', 'This program fulfilled my educational needs', answers.fulfilledNeeds)}
    ${likertField('activityFormat', 'Activity format enhanced achievement of learning objectives', answers.activityFormat)}
    ${likertField('professionalEffectiveness', 'This program improved my professional effectiveness and expertise', answers.professionalEffectiveness)}
    ${likertField('culturalDifferences', 'Cultural, racial, ethnic, socioeconomic, and gender differences were considered.', answers.culturalDifferences)}
    ${likertField('howMuchLearned', 'I learned a great deal in this program.', answers.howMuchLearned)}
    ${likertField('howUseful', 'The content of this CE program was useful for my practice or professional development.', answers.howUseful)}
    ${likertField('recommend', 'I would recommend this program to others.', answers.recommend)}
    ${likertField('confidence', 'I am confident that I will apply my new learning in my practice.', answers.confidence)}
  </section>
  <div class="actions between">
    <button type="button" class="btn outline" data-action="cancel">Cancel</button>
    <button type="submit" class="btn primary" data-nav="next">Continue</button>
  </div>`;

const presenterBlock = (key, name) => `
  <h3 class="section-title">${esc(name)}</h3>
  ${PRESENTER_ITEMS.map((text, i) => likertField(`${key}.q${i}`, text, answers[key][`q${i}`])).join('')}`;

const pageObjectives = () => `
  <section class="panel">
    <div class="panel-head">
      <h2>Learning Objectives</h2>
      <p>After attending this activity I am able to:</p>
    </div>
    <p class="rating-help"><span aria-hidden="true">★</span> Select one response for each statement.</p>
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
    <p class="rating-help"><span aria-hidden="true">★</span> Select one response for each statement.</p>
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

const pageCertificate = () => {
  const name = participantName();
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `
  <header class="topbar">
    <div class="topbar-inner">
      <img src="assets/logo.png" alt="Lifespan Learning Institute">
      <div class="meta"><span>Certificate preview</span>80%+ completion achieved</div>
    </div>
  </header>
  <main id="main" class="cert-main">
    <div class="note">
      Staging preview: the quiz/knowledge-check step is skipped. Your sample certificate is shown as if you scored at least 80%.
    </div>
    <section class="panel">
      <span class="page-label">Completed</span>
      <h2 style="margin-top:8px">${esc(COURSE)}</h2>
      <p class="muted">Instructor: ${esc(INSTRUCTORS)}</p>
      <p class="muted">Completed ${esc(date)} · ${CE_HOURS} CE Hours · Certificate No. ${esc(certNumber)}</p>
    </section>
    <section class="panel certificate-panel">
      <h2 class="center">Certificate of Completion</h2>
      <canvas id="certificate" class="certificate-canvas" width="1666" height="1162" role="img" aria-label="Sample certificate of completion for ${esc(name)}"></canvas>
      <div class="actions certificate-actions">
        <button type="button" class="btn primary" data-action="download">↓ Download Certificate</button>
        <button type="button" class="btn outline" data-action="print">Print Certificate</button>
        <button type="button" class="btn outline" data-action="back-form">Back to evaluation</button>
      </div>
      <p class="center muted" style="margin-top:14px;font-size:13px">Staging sample — not valid for continuing education credit.</p>
    </section>
    <section class="panel">
      <h2>Certificate Details</h2>
      <div class="detail-row"><span>Student Name</span><span>${esc(name)}</span></div>
      <div class="detail-row"><span>Program</span><span>${esc(COURSE)}</span></div>
      <div class="detail-row"><span>Instructor</span><span>${esc(INSTRUCTORS)}</span></div>
      <div class="detail-row"><span>CE Hours</span><span>${CE_HOURS}</span></div>
      <div class="detail-row"><span>Completion Date</span><span>${esc(date)}</span></div>
      <div class="detail-row"><span>Certificate Number</span><span>${esc(certNumber)}</span></div>
    </section>
  </main>`;
};

async function drawCertificate() {
  const canvas = $('#certificate');
  if (!canvas) return;
  certificateReady = false;
  const artwork = new Image();
  artwork.src = 'assets/certificate-green.png';
  try {
    await artwork.decode();
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    toast('Certificate artwork could not load. Please reload and try again.');
    return;
  }
  if ($('#certificate') !== canvas) return;

  const logicalWidth = 1666;
  const logicalHeight = 1162;
  const renderScale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(logicalWidth * renderScale);
  canvas.height = Math.round(logicalHeight * renderScale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(artwork, 0, 0, logicalWidth, logicalHeight);
  ctx.textAlign = 'center';
  const bg = ctx.getImageData(
    Math.round(200 * renderScale),
    Math.round(200 * renderScale),
    1,
    1
  ).data;

  const write = (t, y, size = 28, color = '#202d25', font = 'Georgia') => {
    ctx.fillStyle = color;
    ctx.font = `${size}px ${font}`;
    ctx.fillText(t, 833, y, 1245);
  };
  const blank = (x, y, w, h) => {
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    ctx.fillRect(x, y, w, h);
  };
  const wrap = (t, y, size = 26, width = 1200, line = 34, color = '#202d25', font = 'Georgia') => {
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = color;
    let current = '';
    for (const word of t.split(' ')) {
      const next = current + word + ' ';
      if (ctx.measureText(next).width > width && current) {
        ctx.fillText(current.trim(), 833, y);
        y += line;
        current = word + ' ';
      } else current = next;
    }
    if (current) ctx.fillText(current.trim(), 833, y);
    return y;
  };

  const name = participantName();
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  blank(205, 276, 1255, 112);
  write(name, 340, 46);
  blank(205, 410, 1255, 113);
  const y = wrap(COURSE, 449, 30, 1245, 36, '#63a63b');
  wrap(INSTRUCTORS, y + 40, 24, 1245, 30, '#63a63b');
  blank(210, 718, 1248, 84);
  wrap(`This course meets the qualifications for ${CE_HOURS} hours of continuing education credit for LMFTs, LCSWs, LPCCs, and/or LEPs as required by the California Board of Behavioral Sciences.`, 750, 23, 1235, 31, '#171d18', 'Georgia');
  blank(295, 930, 290, 55);
  ctx.font = '29px Georgia';
  ctx.fillStyle = '#171d18';
  ctx.fillText(date, 415, 969, 290);
  write('STAGING SAMPLE — NOT VALID FOR CE CREDIT · ' + certNumber, 1147, 14, '#795938', 'Inter');
  certificateReady = true;
}

function downloadPdf(canvas, name) {
  const bytes = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]), (c) => c.charCodeAt(0));
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let size = 0;
  const add = (s) => {
    const b = typeof s === 'string' ? enc.encode(s) : s;
    parts.push(b);
    size += b.length;
  };
  const obj = (n, s) => {
    offsets[n] = size;
    add(`${n} 0 obj\n${s}\nendobj\n`);
  };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 587] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = size;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
  add(bytes);
  add('\nendstream\nendobj\n');
  const stream = 'q\n842 0 0 587 0 0 cm\n/Im0 Do\nQ\n';
  obj(5, `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);
  const xref = size;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i < 6; i++) add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(parts, { type: 'application/pdf' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Certificate PDF downloaded.');
}

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
  if (view === 'certificate') {
    $('#app').innerHTML = pageCertificate();
    window.scrollTo(0, 0);
    drawCertificate().catch(() => {});
    return;
  }
  const bodies = [pageLearning, pageObjectives, pageEnvironment, pageFeedback, pageIdentity];
  $('#app').innerHTML = shell(bodies[page]());
  window.scrollTo(0, 0);
};

const openCertificate = () => {
  view = 'certificate';
  persist();
  toast('Certificate ready (quiz skipped)');
  render();
};

document.addEventListener('submit', (e) => {
  const form = e.target.closest('#eval-form');
  if (!form) return;
  e.preventDefault();
  answers = readForm(form);
  if (!validateCurrent(form)) return;

  const nav = e.submitter?.dataset?.nav || 'next';
  if (nav === 'finish') {
    // Skip knowledge-check questions; treat as 80%+ and show certificate.
    openCertificate();
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
      view = 'form';
      certNumber = 'LLI-2026-' + String(Date.now()).slice(-6);
      persist();
      toast('Evaluation cleared');
      render();
    }
    return;
  }

  if (btn.dataset.action === 'certificate') {
    const form = $('#eval-form');
    if (form) answers = readForm(form);
    openCertificate();
    return;
  }

  if (btn.dataset.action === 'back-form') {
    view = 'form';
    persist();
    render();
    return;
  }

  if (btn.dataset.action === 'download') {
    const canvas = $('#certificate');
    if (!canvas || !certificateReady) {
      toast('Certificate is still loading.');
      return;
    }
    downloadPdf(canvas, `Lifespan-Certificate-${participantName().replace(/\s+/g, '-')}.pdf`);
    return;
  }

  if (btn.dataset.action === 'print') {
    if (!certificateReady) {
      toast('Certificate is still loading.');
      return;
    }
    window.print();
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
