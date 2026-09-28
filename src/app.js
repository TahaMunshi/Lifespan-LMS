import { STANDARD_QUESTIONS, cloneStandardSections } from './seed.js';
import { store } from './store.js';
import {
  ACTIVITY_TYPES,
  activityContext,
  byId,
  evaluationSections,
  formatDate,
  isExpired,
  learnerProgress,
  safeSlug,
  scoreTest
} from './domain.js';
import { downloadCertificatePdf, renderCertificate } from './certificate.js';

const app = document.querySelector('#app');
const toastElement = document.querySelector('#toast');
let certificateReady = false;
let reportDateFrom = '';
let reportDateTo = '';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const routeParts = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
const state = () => store.getState();
const routeLink = (path, label, className = '') => `<a class="${className}" href="#/${path}">${label}</a>`;
const previewSessions = new Map();
const WIZARD_STORAGE_KEY = 'lli-activity-draft';

const ACTIVITY_TYPE_HELP = {
  live: 'Attend in person or online. No knowledge check required.',
  'home-study': 'Complete on your own schedule. Includes a knowledge check.',
  hybrid: 'Mix of live and self-paced learning with a knowledge check.'
};

function wizardDraftKey(id) {
  return `${WIZARD_STORAGE_KEY}:${id || 'new'}`;
}

function loadWizardDraft(id) {
  try {
    return JSON.parse(sessionStorage.getItem(wizardDraftKey(id)) || 'null') || {};
  } catch {
    return {};
  }
}

function saveWizardDraft(id, draft) {
  sessionStorage.setItem(wizardDraftKey(id), JSON.stringify(draft));
}

function clearWizardDraft(id) {
  sessionStorage.removeItem(wizardDraftKey(id));
}

function wizardNextStep(currentStep, activityType) {
  if (currentStep === 4 && !ACTIVITY_TYPES[activityType]?.requiresTest) return 6;
  return Math.min(currentStep + 1, 6);
}

function wizardPrevStep(currentStep, activityType) {
  if (currentStep === 6 && !ACTIVITY_TYPES[activityType]?.requiresTest) return 4;
  return Math.max(currentStep - 1, 1);
}

function activityPreset(data, activityType = 'live') {
  const version = data.versions.find((item) => item.activityType === activityType) || data.versions[0];
  const course = byId(data.courses, version?.courseId) || data.courses[0];
  const cohort = data.cohorts.find((item) => item.versionId === version?.id) || data.cohorts[0];
  const module = data.modules.find((item) => item.cohortId === cohort?.id) || data.modules[0];
  const sample = data.publications.find((item) => item.activityType === activityType)
    || data.publications.find((item) => item.courseId === course?.id)
    || data.publications[0];
  const objectives = (sample?.objectives || []).filter(Boolean).slice(0, 4);
  while (objectives.length < 4) {
    objectives.push(`Learning goal ${objectives.length + 1}`);
  }
  const requiresTest = ACTIVITY_TYPES[activityType]?.requiresTest;
  const endDate = module?.endDate || '2027-12-31';
  return {
    courseId: course?.id || data.courses[0].id,
    versionId: version?.id || data.versions[0].id,
    cohortId: cohort?.id || data.cohorts[0].id,
    moduleId: module?.id || data.modules[0].id,
    evaluationTemplateId: data.templates.evaluations[0].id,
    testTemplateId: requiresTest ? (data.templates.tests[0]?.id || null) : null,
    certificateTemplateId: ACTIVITY_TYPES[activityType]?.certificateTemplate || 'cert-live-v1',
    activityType,
    deadline: sample?.deadline || endDate,
    location: cohort?.location || '',
    creditHours: module?.creditHours ?? 6,
    startDate: module?.startDate || '',
    endDate,
    presenters: (cohort?.presenters || []).join('\n'),
    cosponsor: 'Sensorimotor Psychotherapy Institute',
    objectives
  };
}

function parsePresenters(value) {
  const list = String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
  return list.length ? list : [''];
}

function presenterFieldsHtml(presentersText) {
  return parsePresenters(presentersText).map((name, index, list) => `
    <div class="presenter-row">
      <label>Presenter ${index + 1}
        <input type="text" class="presenter-input" value="${escapeHtml(name)}" required placeholder="Example: Pat Ogden, PhD">
      </label>
      ${list.length > 1 ? `<button type="button" class="btn ghost small presenter-remove" data-action="remove-presenter">Remove</button>` : ''}
    </div>`).join('');
}

function syncPresentersField(form) {
  if (!form) return;
  const hidden = form.querySelector('input[name="presenters"]');
  if (!hidden) return;
  hidden.value = [...form.querySelectorAll('.presenter-input')]
    .map((input) => input.value.trim())
    .filter(Boolean)
    .join('\n');
}

function applyActivityTypePreset(draft, data, activityType) {
  const preset = activityPreset(data, activityType);
  return {
    ...draft,
    ...preset,
    activityType,
    objectives: Array.isArray(preset.objectives) ? preset.objectives.join('\n') : preset.objectives
  };
}

function testAnswers(pubId, preview) {
  if (preview) {
    const session = previewSession(pubId);
    session.testAnswers ||= {};
    return session.testAnswers;
  }
  try {
    return JSON.parse(sessionStorage.getItem(`test-answers-${pubId}`) || '{}');
  } catch {
    return {};
  }
}

function saveTestAnswers(pubId, preview, answers) {
  if (preview) {
    previewSession(pubId).testAnswers = answers;
  } else {
    sessionStorage.setItem(`test-answers-${pubId}`, JSON.stringify(answers));
  }
}

function clearTestAnswers(pubId, preview) {
  if (preview) {
    delete previewSession(pubId).testAnswers;
  } else {
    sessionStorage.removeItem(`test-answers-${pubId}`);
  }
}

function previewSession(publicationId) {
  if (!previewSessions.has(publicationId)) {
    previewSessions.set(publicationId, { draft: { ratings: {}, comments: {}, learner: {} }, attempts: [] });
  }
  return previewSessions.get(publicationId);
}

function progressFor(context, preview = false) {
  if (!preview) return learnerProgress(state(), context.publication.id);
  const session = previewSession(context.publication.id);
  const requiresTest = ACTIVITY_TYPES[context.publication.activityType].requiresTest;
  const passedAttempt = session.attempts.find((attempt) => attempt.passed);
  return {
    submission: session.submission,
    attempts: session.attempts,
    passedAttempt,
    attendanceConfirmed: Boolean(session.attendanceConfirmed),
    requiresTest,
    eligible: Boolean(session.submission && (requiresTest ? passedAttempt : session.attendanceConfirmed)),
    attemptsRemaining: Math.max(0, (context.testTemplate?.maxAttempts || 3) - session.attempts.length)
  };
}

function toast(message, tone = '') {
  toastElement.textContent = message;
  toastElement.className = `show ${tone}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toastElement.className = ''; }, 3000);
}

function emptyState(title, text, action = '') {
  return `<div class="empty-state"><div class="empty-mark">LLI</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${action}</div>`;
}

function statusBadge(status) {
  const label = status === 'published' ? 'Published' : status === 'closed' ? 'Closed' : 'Draft';
  return `<span class="status ${status}">${label}</span>`;
}

function pencilBtn(action, id = '', label = 'Edit') {
  return `<button type="button" class="btn-pencil" data-action="${escapeHtml(action)}" ${id ? `data-id="${escapeHtml(id)}"` : ''} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span aria-hidden="true">✎</span><span class="btn-pencil-text">${escapeHtml(label)}</span></button>`;
}

function nextStepBanner(text, actionHtml = '') {
  return `<div class="next-step-banner" role="status"><div><strong>What to do next</strong><p>${escapeHtml(text)}</p></div>${actionHtml}</div>`;
}

function templateQuestionBank(template) {
  return evaluationSections(template) || cloneStandardSections();
}

function adminShell(title, subtitle, content, active = 'dashboard', actions = '') {
  const navigation = [
    ['dashboard', 'Overview'],
    ['activities', 'Activities'],
    ['templates', 'Templates'],
    ['reports', 'Reports'],
    ['certificates', 'Certificates']
  ];
  document.body.className = 'admin-page';
  return `
    <div class="admin-shell">
      <div class="menu-backdrop" data-action="menu-close"></div>
      <aside class="admin-sidebar">
        <button class="sidebar-close" data-action="menu-close">Close</button>
        <div class="admin-brand"><img src="assets/logo.png?v=3" alt="Lifespan Learning Institute"></div>
        <nav aria-label="Administrator navigation">
          ${navigation.map(([id, label]) => `
            <a href="#/admin/${id}" class="${active === id ? 'active' : ''}">
              <span class="nav-monogram" aria-hidden="true">${label.slice(0, 1)}</span>
              <span>${label}</span>
            </a>`).join('')}
        </nav>
        <a class="sidebar-learner" href="#/learn">Open Learner portal</a>
        <div class="sidebar-note">
          <span>Frontend prototype</span>
          <small>Data is stored on this device.</small>
        </div>
      </aside>
      <section class="admin-workspace">
        <header class="admin-header">
          <button class="mobile-menu" data-action="menu" aria-label="Toggle navigation">Menu</button>
          <div><p class="eyebrow">Admin portal</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
          <div class="header-actions">${routeLink('learn', 'Learner portal', 'btn secondary')}${actions}</div>
        </header>
        <main class="admin-main" id="main">${content}</main>
      </section>
    </div>`;
}

function selectOptions(items, selected, label) {
  return items.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('');
}

function adminDashboard() {
  const data = state();
  const published = data.publications.filter((item) => item.status === 'published').length;
  const responses = data.submissions.length;
  const stats = [
    ['Published activities', published, 'Ready to share'],
    ['Saved templates', data.templates.evaluations.length + data.templates.tests.length + data.templates.certificates.length, 'Evaluation, test, certificate'],
    ['Evaluation responses', responses, 'Across all saved versions'],
    ['Certificates issued', data.certificates.length, 'Requirements met']
  ];
  const recent = data.publications.slice(0, 3).map((publication) => {
    const context = activityContext(data, publication);
    return `
      <article class="activity-row">
        <div>${statusBadge(publication.status)}<h3>${escapeHtml(context.course?.name)}</h3><p>${escapeHtml(context.cohort?.name)} · ${escapeHtml(context.module?.name)}</p></div>
        <div class="row-actions">${routeLink(`admin/activity/${publication.id}/edit/1`, 'Edit', 'btn secondary small')}${routeLink(`preview/${publication.id}`, 'Preview', 'btn ghost small')}</div>
      </article>`;
  }).join('');
  const content = `
    <section class="guide-actions">
      ${routeLink('admin/activity/new/edit/1', '<span class="guide-icon">+</span><strong>Create activity</strong><small>One page. Fill in, save, publish.</small>', 'guide-card')}
      ${routeLink('admin/templates', '<span class="guide-icon">T</span><strong>Edit forms &amp; tests</strong><small>Pencil icons edit names and questions.</small>', 'guide-card')}
      ${routeLink('learn', '<span class="guide-icon">L</span><strong>Learner portal</strong><small>See what learners see after you publish.</small>', 'guide-card')}
    </section>
    <section class="metric-grid secondary">${stats.map(([label, value, note]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></article>`).join('')}</section>
    <section class="content-card"><div class="section-heading"><div><h2>Recent activities</h2><p>Pick up where you left off.</p></div>${routeLink('admin/activities', 'View all', 'text-action')}</div>${recent || emptyState('No activities yet', 'Create your first activity to get started.', routeLink('admin/activity/new/edit/1', 'Create activity', 'btn primary'))}</section>`;
  return adminShell('Overview', 'Start here to create activities, view responses, and issue certificates.', content, 'dashboard', routeLink('admin/activity/new/edit/1', 'New activity', 'btn primary'));
}

function adminActivities() {
  const data = state();
  const rows = data.publications.map((publication) => {
    const context = activityContext(data, publication);
    const responseCount = data.submissions.filter((item) => item.publicationId === publication.id).length;
    const publicUrl = `${location.origin}${location.pathname}#/learn/${publication.slug}`;
    const primaryAction = publication.status === 'published'
      ? `<button class="btn primary" data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy learner link</button>`
      : `<button class="btn primary" data-action="toggle-publish" data-id="${publication.id}">Publish</button>`;
    return `
      <article class="activity-card">
        <div class="activity-card-main">
          <div class="activity-topline">${statusBadge(publication.status)}<span class="type-chip">${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)}</span><span>Saved version ${publication.revision}</span></div>
          <h2>${escapeHtml(context.course?.name)}</h2>
          <p>${escapeHtml(context.version?.name)} · Class group: ${escapeHtml(context.cohort?.name)} · ${escapeHtml(context.module?.name)}</p>
          <div class="activity-meta"><span>Deadline <strong>${formatDate(publication.deadline)}</strong></span><span>Learning goals <strong>${publication.objectives.length}</strong></span><span>Responses <strong>${responseCount}</strong></span><span>Credit hours <strong>${context.module?.creditHours}</strong></span></div>
          ${publication.status === 'published' ? `<div class="published-link"><span>${escapeHtml(publicUrl)}</span><button data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy</button></div>` : '<p class="muted">Draft — not visible in the Learner portal until you publish.</p>'}
        </div>
        <div class="activity-card-actions senior">
          ${pencilBtn('goto-activity-edit', publication.id, 'Edit')}
          ${primaryAction}
          <details class="more-actions">
            <summary>More actions</summary>
            <div class="more-panel">
              <button class="btn ghost" data-action="duplicate-publication" data-id="${publication.id}">Duplicate</button>
              ${routeLink(`preview/${publication.id}`, 'Preview', 'btn ghost')}
              ${routeLink('learn', 'Open Learner portal', 'btn ghost')}
              ${publication.status === 'published' ? `<button class="btn danger-ghost" data-action="toggle-publish" data-id="${publication.id}">Unpublish</button>` : ''}
            </div>
          </details>
        </div>
      </article>`;
  }).join('');
  return adminShell(
    'Activities',
    'What you publish here appears in the Learner portal.',
    `${nextStepBanner('Press the pencil to edit an activity on one page. Publish to show it to learners.')}<div class="filter-bar"><div><strong>${data.publications.length} activities</strong><span>${data.publications.filter((item) => item.status === 'draft').length} drafts not yet published</span></div>${routeLink('admin/activity/new/edit/1', 'Create activity', 'btn primary')}</div><section class="activity-list">${rows}</section>`,
    'activities',
    routeLink('admin/activity/new/edit/1', 'New activity', 'btn primary')
  );
}

function adminActivityEditor(id, stepParam) {
  const data = state();
  const draftKey = id === 'new' ? 'new' : id;
  const existing = id && id !== 'new' ? data.publications.find((item) => item.id === id) : null;
  let draft = loadWizardDraft(draftKey);
  if (!existing && !Object.keys(draft).length) {
    draft = applyActivityTypePreset({}, data, 'live');
    saveWizardDraft(draftKey, draft);
  }
  const presetType = draft.activityType || existing?.activityType || 'live';
  const preset = activityPreset(data, presetType);
  const defaults = existing ? {
    id: existing.id,
    slug: existing.slug,
    status: existing.status,
    courseId: existing.courseId,
    versionId: existing.versionId,
    cohortId: existing.cohortId,
    moduleId: existing.moduleId,
    evaluationTemplateId: existing.evaluationTemplateId,
    testTemplateId: existing.testTemplateId,
    certificateTemplateId: existing.certificateTemplateId,
    activityType: existing.activityType,
    deadline: existing.deadline,
    objectives: existing.objectives,
    location: existing.location,
    creditHours: existing.creditHours,
    startDate: existing.startDate,
    endDate: existing.endDate,
    presenters: (existing.presenters || []).join('\n'),
    cosponsor: existing.cosponsor || 'Sensorimotor Psychotherapy Institute'
  } : {
    id: '',
    slug: '',
    status: 'draft',
    ...preset,
    presenters: preset.presenters
  };
  const merged = { ...defaults, ...draft };
  if (typeof merged.objectives === 'string') {
    merged.objectives = merged.objectives.split('\n').map((item) => item.trim()).filter(Boolean);
  }
  if (!Array.isArray(merged.objectives) || merged.objectives.filter(Boolean).length < 4) {
    merged.objectives = preset.objectives;
  }
  const publication = {
    ...defaults,
    ...merged,
    objectives: Array.isArray(merged.objectives) ? merged.objectives.filter(Boolean) : preset.objectives
  };
  if (ACTIVITY_TYPES[publication.activityType]?.requiresTest && !publication.testTemplateId) {
    publication.testTemplateId = data.templates.tests[0]?.id || null;
  }
  const resolved = activityContext(data, publication);
  const requiresTest = ACTIVITY_TYPES[publication.activityType]?.requiresTest;
  const savedFlag = existing && sessionStorage.getItem(`activity-saved-${existing.id}`);
  if (savedFlag) {
    sessionStorage.removeItem(`activity-saved-${existing.id}`);
    const publicUrl = `${location.origin}${location.pathname}#/learn/${existing.slug}`;
    const content = `
      ${nextStepBanner(existing.status === 'published' ? 'This activity is live for learners. Open the Learner portal to confirm it appears.' : 'Publish this activity so learners can see it.', existing.status !== 'published' ? `<button class="btn primary" data-action="toggle-publish" data-id="${existing.id}">Publish now</button>` : routeLink('learn', 'Open Learner portal', 'btn primary'))}
      <section class="wizard-page celebrate">
        <div class="celebrate-link">
          <h2>Activity saved</h2>
          <p>Everything below is ready. Learners only see this after you publish.</p>
          <div class="published-link large"><span>${escapeHtml(publicUrl)}</span><button class="btn primary" data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy link</button></div>
          <div class="celebrate-actions">
            ${routeLink(`preview/${existing.id}`, 'Preview', 'btn secondary')}
            ${existing.status !== 'published' ? `<button class="btn primary" data-action="toggle-publish" data-id="${existing.id}">Publish</button>` : ''}
            ${routeLink('admin/activities', 'Back to activities', 'btn ghost')}
          </div>
        </div>
      </section>`;
    return adminShell('Activity saved', 'Saved. Publish when you want learners to see it.', content, 'activities');
  }

  const objectivesText = (publication.objectives || preset.objectives).join('\n');
  const presentersText = draft.presenters
    || defaults.presenters
    || (resolved?.cohort?.presenters || []).join('\n');
  const locationValue = draft.location ?? defaults.location ?? resolved?.cohort?.location ?? '';
  const creditHoursValue = draft.creditHours ?? defaults.creditHours ?? resolved?.module?.creditHours ?? '';
  const startDateValue = draft.startDate ?? defaults.startDate ?? resolved?.module?.startDate ?? '';
  const endDateValue = draft.endDate ?? defaults.endDate ?? resolved?.module?.endDate ?? '';
  const certTemplate = ACTIVITY_TYPES[publication.activityType]?.certificateTemplate || publication.certificateTemplateId;
  const cosponsorValue = draft.cosponsor ?? defaults.cosponsor ?? preset.cosponsor ?? 'Sensorimotor Psychotherapy Institute';
  const testId = publication.testTemplateId || data.templates.tests[0]?.id;

  const content = `
    ${nextStepBanner('Fill in every section on this page, then press Save at the bottom. Nothing is hidden in another step.')}
    <form id="activity-form" class="flat-editor" data-id="${escapeHtml(publication.id)}" data-step="6" data-draft-key="${escapeHtml(draftKey)}">
      <section class="editor-card flat-section" id="section-type">
        <div class="section-heading tight"><h2>1. Activity type</h2>${statusBadge(publication.status || 'draft')}</div>
        <div class="type-choice-grid">
          ${Object.entries(ACTIVITY_TYPES).map(([value, item]) => `
            <label class="type-choice">
              <input type="radio" name="activityType" value="${value}" ${publication.activityType === value ? 'checked' : ''} required>
              <span><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(ACTIVITY_TYPE_HELP[value])}</span></span>
            </label>`).join('')}
        </div>
      </section>
      <section class="editor-card flat-section" id="section-course">
        <div class="section-heading tight"><h2>2. Course and class</h2></div>
        <div class="form-grid two">
          <label>Course<select name="courseId">${selectOptions(data.courses, publication.courseId, (item) => item.name)}</select></label>
          <label>Version<select name="versionId">${selectOptions(data.versions, publication.versionId, (item) => `${byId(data.courses, item.courseId)?.name} - ${item.name}`)}</select></label>
          <label>Class group<select name="cohortId">${selectOptions(data.cohorts, publication.cohortId, (item) => `${item.name} - ${item.location}`)}</select></label>
          <label>Module<select name="moduleId">${selectOptions(data.modules, publication.moduleId, (item) => `${item.name} - ${item.creditHours} credit hours`)}</select></label>
        </div>
      </section>
      <section class="editor-card flat-section" id="section-schedule">
        <div class="section-heading tight"><h2>3. Dates, place, and presenters</h2></div>
        <div class="form-grid two">
          <label>Activity location<input name="location" value="${escapeHtml(locationValue)}" required></label>
          <label>Credit hours<input type="number" min="0.25" step="0.25" name="creditHours" value="${escapeHtml(creditHoursValue)}" required></label>
          <label>Start date<input type="date" name="startDate" value="${escapeHtml(startDateValue)}" required></label>
          <label>End date<input type="date" name="endDate" value="${escapeHtml(endDateValue)}" required></label>
          <label>Completion deadline<input type="date" name="deadline" value="${escapeHtml(publication.deadline)}" required></label>
          <label class="span-two">Cosponsor (certificate wording)<input name="cosponsor" value="${escapeHtml(cosponsorValue)}" placeholder="Sensorimotor Psychotherapy Institute"></label>
        </div>
        <div class="presenter-field-list">${presenterFieldsHtml(presentersText)}</div>
        <button type="button" class="btn secondary" data-action="add-presenter">+ Add another presenter</button>
        <input type="hidden" name="presenters" value="${escapeHtml(presentersText)}">
      </section>
      <section class="editor-card flat-section" id="section-objectives">
        <div class="section-heading tight"><h2>4. Objectives and evaluation form</h2>
          ${publication.evaluationTemplateId ? pencilBtn('goto-eval-template', publication.evaluationTemplateId, 'Edit form questions') : ''}
        </div>
        <p class="muted">Enter at least four objectives (one per line). Learners rate each on a 1-5 scale.</p>
        <label>Learning objectives<textarea name="objectives" rows="8" required>${escapeHtml(objectivesText)}</textarea></label>
        <label>Evaluation form<select name="evaluationTemplateId">${selectOptions(data.templates.evaluations, publication.evaluationTemplateId, (item) => `${item.name} | v${item.version}`)}</select></label>
        <input type="hidden" name="certificateTemplateId" value="${escapeHtml(certTemplate)}">
      </section>
      ${requiresTest ? `
      <section class="editor-card flat-section" id="section-test">
        <div class="section-heading tight"><h2>5. Knowledge check</h2>
          ${testId ? pencilBtn('goto-test-template', testId, 'Edit knowledge check') : ''}
        </div>
        <label>Knowledge check<select name="testTemplateId" required>${selectOptions(data.templates.tests, testId, (item) => `${item.name} | ${item.passPercent}% | ${item.questions.length} questions`)}</select></label>
        <p class="muted">Use the pencil to rename or edit questions. Duplicated checks keep their own editable name.</p>
      </section>` : '<input type="hidden" name="testTemplateId" value="">'}
      <div class="sticky-actions flat-save">
        ${routeLink('admin/activities', 'Cancel', 'btn ghost')}
        <button class="btn primary" type="submit">Save activity</button>
      </div>
    </form>`;

  return adminShell(
    existing ? 'Edit activity' : 'Create activity',
    'All fields are on this one page. Scroll, edit, then Save.',
    content,
    'activities'
  );
}


function adminTemplates() {
  const data = state();
  const evaluationCards = data.templates.evaluations.map((template) => `
    <article class="template-card">
      <div class="template-icon">E</div>
      <div>
        <div class="activity-topline"><span class="type-chip">Evaluation</span><span>Version ${template.version}</span></div>
        <h2>${escapeHtml(template.name)}</h2>
        <p>All sections editable. Objectives and presenters still come from each activity.</p>
      </div>
      <div class="template-actions">
        ${pencilBtn('goto-eval-template', template.id, 'Edit')}
        <button class="btn ghost" data-action="duplicate-template" data-id="${template.id}">Duplicate</button>
      </div>
    </article>`).join('');
  const testCards = data.templates.tests.map((template) => `
    <article class="template-card">
      <div class="template-icon">T</div>
      <div>
        <div class="activity-topline"><span class="type-chip">Knowledge check</span><span>Version ${template.version || 1}</span></div>
        <h3>${escapeHtml(template.name)}</h3>
        <p>${template.questions.length} questions | ${template.passPercent}% to pass | ${template.maxAttempts} attempts</p>
      </div>
      <div class="template-actions">
        ${pencilBtn('goto-test-template', template.id, 'Edit')}
        <button class="btn ghost" data-action="duplicate-test" data-id="${template.id}">Duplicate</button>
      </div>
    </article>`).join('');
  const certCards = data.templates.certificates.map((template) => `
    <article class="template-card compact"><div class="template-icon">C</div><div><span class="type-chip">Certificate</span><h3>${escapeHtml(template.name)}</h3><p>White background, slate-blue frame, Live or Home Study wording.</p></div></article>`).join('');
  const content = `
    ${nextStepBanner('Pick a form or knowledge check, press the pencil to edit names and questions on one page.')}
    <section class="section-heading standalone"><div><p class="eyebrow">Evaluation forms</p><h2>Edit every question</h2><p>Rename, rewrite, add, or remove questions. Changes apply to activities that use this form.</p></div></section>
    <div class="template-grid">${evaluationCards}</div>
    <section class="section-heading standalone lower"><div><p class="eyebrow">Knowledge checks</p><h2>Home study tests</h2><p>Rename even after Duplicate. Multiple choice (two options works as true/false).</p></div>
      <button class="btn primary" data-action="create-test">+ New knowledge check</button>
    </section>
    <div class="template-grid">${testCards}</div>
    <section class="section-heading standalone lower"><div><p class="eyebrow">Certificates</p><h2>Automatic layouts</h2></div></section>
    <div class="template-grid two-col">${certCards}</div>`;
  return adminShell('Templates', 'Forms and knowledge checks stay one click from this list.', content, 'templates');
}

function adminTemplateEditor(id) {
  const data = state();
  const template = byId(data.templates.evaluations, id);
  if (!template) {
    return adminShell('Template not found', 'Return to templates.', emptyState('Template unavailable', 'This form may have been removed.', routeLink('admin/templates', 'Back to templates', 'btn primary')), 'templates');
  }
  const sections = templateQuestionBank(template);
  const sectionOrder = [
    ['learning', 'Learning'],
    ['presenter', 'Presenter'],
    ['environment', 'Environment'],
    ['administration', 'Administration'],
    ['written', 'Written feedback']
  ];
  const blocks = sectionOrder.map(([key, label]) => {
    const questions = sections[key] || [];
    return `
      <section class="editor-card flat-section" data-section="${key}">
        <div class="section-heading tight"><h2>${escapeHtml(label)}</h2>
          <button type="button" class="btn secondary small" data-action="add-eval-question" data-section="${key}">+ Add question</button>
        </div>
        <div class="eval-question-list" data-section="${key}">
          ${questions.map((question, index) => `
            <div class="eval-question-row" data-qid="${escapeHtml(question.id)}">
              <label>Question ${index + 1}
                <textarea name="${key}.${question.id}" rows="2" required>${escapeHtml(question.text)}</textarea>
              </label>
              <button type="button" class="btn ghost small" data-action="remove-eval-question">Remove</button>
            </div>`).join('') || '<p class="muted">No questions yet. Add one.</p>'}
        </div>
      </section>`;
  }).join('');
  const content = `
    ${nextStepBanner('Change the form name or any question text, then Save. Learners see these words on the evaluation.')}
    <form id="template-form" data-id="${template.id}">
      <section class="editor-card template-editor-head">
        <label>Form name (editable anytime, including copies)<input name="name" value="${escapeHtml(template.name)}" required></label>
        <div><span class="status ${template.status || 'active'}">${escapeHtml(template.status || 'active')}</span><p>Version ${template.version}</p></div>
      </section>
      ${blocks}
      <div class="sticky-actions">${routeLink('admin/templates', 'Back', 'btn ghost')}<button type="submit" class="btn primary">Save evaluation form</button></div>
    </form>`;
  return adminShell('Edit evaluation form', 'Every question is editable. Nothing is locked.', content, 'templates');
}

function adminTestEditor(id) {
  const data = state();
  const template = byId(data.templates.tests, id);
  if (!template) {
    return adminShell('Test not found', 'Return to templates.', emptyState('Template unavailable', 'This knowledge check may have been removed.', routeLink('admin/templates', 'Back to templates', 'btn primary')), 'templates');
  }
  const questionBlocks = template.questions.map((question, index) => `
    <article class="editor-card test-question-editor" data-question-index="${index}">
      <div class="section-heading tight"><h3>Question ${index + 1}</h3><button type="button" class="btn ghost small" data-action="remove-test-question" data-index="${index}">Remove</button></div>
      <label>Question text<textarea name="q_${index}_text" rows="2" required>${escapeHtml(question.text)}</textarea></label>
      <div class="form-grid two">
        ${(question.options || ['', '', '', '']).concat(['', '', '', '']).slice(0, 4).map((option, optionIndex) => `
          <label>Answer ${optionIndex + 1}<input name="q_${index}_opt_${optionIndex}" value="${escapeHtml(option)}" ${optionIndex < 2 ? 'required' : ''}></label>`).join('')}
      </div>
      <label>Correct answer<select name="q_${index}_correct">${[0, 1, 2, 3].map((optionIndex) => `
        <option value="${optionIndex}" ${Number(question.correct) === optionIndex ? 'selected' : ''}>Answer ${optionIndex + 1}</option>`).join('')}</select></label>
      <label>Linked objective number (0 = first)<input type="number" min="0" step="1" name="q_${index}_objective" value="${Number(question.objectiveIndex) || 0}"></label>
    </article>`).join('');
  const content = `
    ${nextStepBanner('Rename this knowledge check anytime (including after Duplicate), edit questions, then Save.')}
    <form id="test-template-form" data-id="${template.id}" data-question-count="${template.questions.length}">
      <section class="editor-card template-editor-head">
        <label>Knowledge check name<input name="name" value="${escapeHtml(template.name)}" required></label>
        <div class="form-grid two">
          <label>Pass score (%)<input type="number" min="1" max="100" name="passPercent" value="${template.passPercent}" required></label>
          <label>Maximum attempts<input type="number" min="1" max="10" name="maxAttempts" value="${template.maxAttempts}" required></label>
        </div>
        <p class="muted">Home Study activities need at least 12 questions. Each objective needs at least three linked questions.</p>
      </section>
      <div id="test-question-list">${questionBlocks}</div>
      <button type="button" class="btn secondary" data-action="add-test-question">+ Add question</button>
      <div class="sticky-actions">${routeLink('admin/templates', 'Back', 'btn ghost')}<button type="submit" class="btn primary">Save knowledge check</button></div>
    </form>`;
  return adminShell('Edit knowledge check', 'Name and questions stay on one page.', content, 'templates');
}


function collectTestTemplateForm(form) {
  const questions = [...form.querySelectorAll('.test-question-editor')].map((block, index) => {
    const text = block.querySelector('textarea')?.value?.trim();
    const options = [...block.querySelectorAll('.form-grid.two input')]
      .map((input) => input.value.trim())
      .filter(Boolean);
    const correct = Number(block.querySelector('select')?.value) || 0;
    const objectiveIndex = Number(block.querySelector('input[type="number"]')?.value) || 0;
    if (!text || options.length < 2) return null;
    while (options.length < 4) options.push(`Option ${options.length + 1}`);
    return {
      id: `tq-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      options: options.slice(0, 4),
      correct,
      objectiveIndex
    };
  }).filter(Boolean);
  return {
    name: new FormData(form).get('name'),
    passPercent: new FormData(form).get('passPercent'),
    maxAttempts: new FormData(form).get('maxAttempts'),
    questions
  };
}

function reportData(publicationId) {
  const data = state();
  const submissions = data.submissions.filter((item) => {
    if (publicationId && item.publicationId !== publicationId) return false;
    const submitted = new Date(item.submittedAt);
    if (reportDateFrom && submitted < new Date(`${reportDateFrom}T00:00:00`)) return false;
    if (reportDateTo && submitted > new Date(`${reportDateTo}T23:59:59`)) return false;
    return true;
  });
  const ratingValues = submissions.flatMap((item) => Object.values(item.ratings || {}).map(Number));
  const distribution = [1, 2, 3, 4, 5].map((rating) => ratingValues.filter((value) => value === rating).length);
  const average = ratingValues.length ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length : 0;
  return { submissions, ratingValues, distribution, average };
}

function valuesFor(submissions, key) {
  return submissions.map((item) => {
    const objectiveMatch = key.match(/^objective\.(\d+)$/);
    const value = item.ratings?.[key]
      ?? (objectiveMatch ? item.objectiveRatings?.[Number(objectiveMatch[1])] : undefined)
      ?? item.presenterRatings?.[key];
    return Number(value);
  }).filter((value) => Number.isFinite(value) && value > 0);
}

function averageOf(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function reportQuestionTable(title, subtitle, questions, submissions, keyForQuestion) {
  const rows = questions.map((question, index) => {
    const key = keyForQuestion(question, index);
    const values = valuesFor(submissions, key);
    return `<tr><th scope="row">${escapeHtml(question.text || question)}</th><td>${values.length ? averageOf(values).toFixed(2) : '—'}</td><td>${values.length}</td></tr>`;
  }).join('');
  const total = questions.reduce((sum, question, index) => sum + valuesFor(submissions, keyForQuestion(question, index)).length, 0);
  return `<section class="content-card report-section"><div class="section-heading"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><span class="response-total">${total} total responses</span></div><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Question</th><th>Average</th><th>Responses</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function scaleDistribution(question, submissions) {
  const values = valuesFor(submissions, `learning.${question.id}`);
  const labels = question.scale || SCALE.map(([, label]) => label);
  return `<section class="content-card distribution-card"><div class="section-heading"><div><h2>${escapeHtml(question.text)}</h2><p>${values.length} total responses</p></div><strong>${values.length ? averageOf(values).toFixed(2) : '—'} avg.</strong></div><div class="distribution-list">${labels.map((label, index) => {
    const count = values.filter((value) => value === index + 1).length;
    const percent = values.length ? (count / values.length) * 100 : 0;
    return `<div><span><strong>${index + 1}</strong>${escapeHtml(label)}</span><i><b style="width:${percent}%"></b></i><em>${percent.toFixed(1)}% · ${count}</em></div>`;
  }).join('')}</div></section>`;
}

function adminReports(selectedId = '') {
  const data = state();
  const selected = selectedId || data.publications[0]?.id || '';
  const context = activityContext(data, selected);
  const report = reportData(selected);
  const agreementQuestions = STANDARD_QUESTIONS.learning.filter((question) => !question.scale);
  const scaleQuestions = STANDARD_QUESTIONS.learning.filter((question) => question.scale);
  const presenters = context?.cohort?.presenters || [];
  const objectiveGroups = [...report.submissions.reduce((groups, submission) => {
    const revision = submission.publicationRevision || 1;
    if (!groups.has(revision)) groups.set(revision, []);
    groups.get(revision).push(submission);
    return groups;
  }, new Map())];
  if (!objectiveGroups.length) objectiveGroups.push([context?.publication?.revision || 1, []]);
  const writtenSections = STANDARD_QUESTIONS.written.map((question) => {
    const answers = report.submissions.map((item) => item.comments?.[question.id]).filter(Boolean);
    return `<section class="content-card comments-card"><div class="section-heading"><div><h2>${escapeHtml(question.text)}</h2><p>${answers.length} anonymized response${answers.length === 1 ? '' : 's'}</p></div></div>${answers.length ? answers.map((answer) => `<blockquote><span>Guest</span>“${escapeHtml(answer)}”</blockquote>`).join('') : '<p class="muted">No responses to this question.</p>'}</section>`;
  }).join('');
  const comments = report.submissions.flatMap((item) => Object.values(item.comments || {})).filter(Boolean);
  const presenterOptions = [...new Set(data.cohorts.flatMap((cohort) => cohort.presenters))];
  const content = `
    <section class="report-toolbar">
      <label>Activity<select id="report-filter">${data.publications.map((publication) => {
        const itemContext = activityContext(data, publication);
        return `<option value="${publication.id}" ${publication.id === selected ? 'selected' : ''}>${escapeHtml(itemContext.course?.name)} — ${escapeHtml(itemContext.cohort?.name)}</option>`;
      }).join('')}</select></label>
      <div class="report-primary-actions"><button class="btn primary" data-action="export-csv" data-id="${selected}">Export CSV</button><button class="btn secondary" data-action="print-report">Print</button><button class="btn ghost" data-action="toggle-more-filters">More filters</button></div>
    </section>
    <section class="report-filters collapsed">
      <label>Version<select class="report-jump-filter" data-field="versionId">${selectOptions(data.versions, context?.version?.id, (item) => item.name)}</select></label>
      <label>Class group<select class="report-jump-filter" data-field="cohortId">${selectOptions(data.cohorts, context?.cohort?.id, (item) => item.name)}</select></label>
      <label>Module<select class="report-jump-filter" data-field="moduleId">${selectOptions(data.modules, context?.module?.id, (item) => item.name)}</select></label>
      <label>Presenter<select class="report-jump-filter" data-field="presenter"><option value="">All presenters</option>${presenterOptions.map((presenter) => `<option value="${escapeHtml(presenter)}" ${presenter === presenters[0] ? 'selected' : ''}>${escapeHtml(presenter)}</option>`).join('')}</select></label>
      <label>From<input id="report-date-from" type="date" value="${escapeHtml(reportDateFrom)}"></label>
      <label>To<input id="report-date-to" type="date" value="${escapeHtml(reportDateTo)}"></label>
    </section>
    <div class="provisional-note"><strong>Client sample matched</strong><span>Consolidated per-question layout based on “Summary 5-10-24 live webinar EVAL”; licensing-board acceptance still requires client validation.</span></div>
    <section class="metric-grid report-metrics">
      <article class="metric"><span>Responses</span><strong>${report.submissions.length}</strong><small>Selected activity revision history</small></article>
      <article class="metric"><span>Average rating</span><strong>${report.average.toFixed(1)}</strong><small>Across all five-point questions</small></article>
      <article class="metric"><span>Presenter sections</span><strong>${presenters.length}</strong><small>Reported separately as required</small></article>
      <article class="metric"><span>Written comments</span><strong>${comments.length}</strong><small>Anonymized responses</small></article>
    </section>
    <div class="report-stack">
      ${reportQuestionTable('Learning', 'Please indicate your agreement with the following statements.', agreementQuestions, report.submissions, (question) => `learning.${question.id}`)}
      <div class="report-grid">${scaleQuestions.map((question) => scaleDistribution(question, report.submissions)).join('')}</div>
      ${objectiveGroups.map(([revision, submissions]) => reportQuestionTable(
        `Learning Objectives · Revision ${revision}`,
        'Historical objective wording is read from the saved publication snapshot.',
        submissions[0]?.snapshot?.objectives || context?.publication?.objectives || [],
        submissions,
        (_, index) => `objective.${index}`
      )).join('')}
      ${presenters.map((presenter, presenterIndex) => reportQuestionTable(presenter, 'Presenter results are reported in a separate standardized section.', STANDARD_QUESTIONS.presenter, report.submissions, (question) => `presenter.${presenterIndex}.${question.id}`)).join('')}
      ${reportQuestionTable('Environment', 'Learning environment and technical support.', STANDARD_QUESTIONS.environment, report.submissions, (question) => `environment.${question.id}`)}
      ${reportQuestionTable('Program Administration', 'Program administration and disclosures.', STANDARD_QUESTIONS.administration, report.submissions, (question) => `administration.${question.id}`)}
      ${writtenSections}
    </div>`;
  return adminShell('Reports', 'Review evaluation results by activity, class group, and module.', content, 'reports');
}

function adminCertificates() {
  const data = state();
  const demoPublication = data.publications.find((item) => item.status === 'published') || data.publications[0];
  const demoSlug = demoPublication?.slug || 'sensorimotor-live-2026';
  const startLearner = routeLink(`learn/${demoSlug}`, 'Start learner flow', 'btn primary');
  const issued = data.certificates.map((certificate) => {
    const publication = byId(data.publications, certificate.publicationId);
    const viewPath = publication?.status === 'published'
      ? `learn/${publication.slug}/certificate`
      : `preview/${certificate.publicationId}/certificate`;
    return `
    <article class="certificate-record">
      <div>
        <span class="status published">Issued</span>
        <h3>${escapeHtml([certificate.learner.firstName, certificate.learner.lastName].filter(Boolean).join(' '))}</h3>
        <p>${escapeHtml(certificate.snapshot.courseName)} · ${escapeHtml(certificate.snapshot.moduleName)}</p>
      </div>
      <div>
        <strong>${escapeHtml(certificate.number)}</strong>
        <small>${new Date(certificate.issuedAt).toLocaleDateString()}</small>
        ${routeLink(viewPath, 'View certificate', 'btn secondary small')}
      </div>
    </article>`;
  }).join('');
  const templateCards = data.templates.certificates.map((template) => `<article class="mini-template"><img src="${template.asset}" alt=""><div><strong>${escapeHtml(template.name)}</strong><span>${template.activityTypes.map((type) => ACTIVITY_TYPES[type].label).join(', ')}</span></div></article>`).join('');
  const empty = emptyState(
    'No certificates issued yet',
    'A learner flow is the step-by-step path a participant takes: evaluation → attendance or knowledge check → certificate. Start one now and keep clicking Continue.',
    startLearner
  );
  const content = `
    <section class="welcome-panel certificate-guide">
      <div>
        <p class="eyebrow">Try it yourself</p>
        <h2>See how a learner earns a certificate</h2>
        <p>Open a published activity as a learner. Ratings and answers are pre-filled — keep clicking the green Continue buttons until the certificate appears.</p>
      </div>
      ${startLearner}
    </section>
    <section class="content-grid certificates-layout">
      <div class="content-card">
        <div class="section-heading">
          <div>
            <h2>Issued certificates</h2>
            <p>Certificates appear here after a learner finishes every required step.</p>
          </div>
          ${startLearner}
        </div>
        ${issued || empty}
      </div>
      <aside class="content-card">
        <h2>Certificate templates</h2>
        <div class="mini-template-list">${templateCards}</div>
      </aside>
    </section>`;
  return adminShell('Certificates', 'View issued certificates or start a learner flow to earn one.', content, 'certificates', startLearner);
}

function learnerBase(context, content, options = {}) {
  const { publication, course, cohort, module } = context;
  const preview = options.preview;
  const base = preview ? `preview/${publication.id}` : `learn/${publication.slug}`;
  document.body.className = 'learner-page';
  return `
    <header class="learner-header"><div><img src="assets/logo.png?v=3" alt="Lifespan Learning Institute"><span>${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)} activity</span></div><div class="learner-header-actions">${preview ? routeLink('admin/activities', 'Exit preview', 'btn light small') : ''}${routeLink('learn', 'All activities', 'btn light small')}</div></header>
    ${preview ? '<div class="preview-banner"><strong>Admin learner preview</strong><span>This draft can be reviewed without publishing.</span></div>' : ''}
    <main class="learner-main" id="main">
      <nav class="learner-breadcrumb">${routeLink(base, 'Activity overview')}<span>/</span><span>${escapeHtml(options.label || 'Details')}</span></nav>
      ${options.hideCourse ? '' : `<section class="learner-course"><p class="eyebrow">${escapeHtml(cohort?.name)} · ${escapeHtml(module?.name)}</p><h1>${escapeHtml(course?.name)}</h1><div><span>${module?.creditHours} credit hours</span><span>${escapeHtml(cohort?.location)}</span><span>Due ${formatDate(publication.deadline)}</span></div></section>`}
      ${content}
    </main>`;
}

function learnerHref(context, suffix = '', preview = false) {
  const base = preview ? `preview/${context.publication.id}` : `learn/${context.publication.slug}`;
  return `#/${base}${suffix ? `/${suffix}` : ''}`;
}

function learnerLanding(context, preview = false) {
  const { publication, course, cohort, module } = context;
  const progress = progressFor(context, preview);
  const expired = isExpired(publication);
  const requiresTest = ACTIVITY_TYPES[publication.activityType].requiresTest;
  const steps = requiresTest
    ? [
      ['Complete the evaluation', progress.submission],
      ['Pass the knowledge check', progress.passedAttempt],
      ['Get your certificate', progress.eligible]
    ]
    : [
      ['Complete the evaluation', progress.submission],
      ['Confirm attendance', progress.attendanceConfirmed],
      ['Get your certificate', progress.eligible]
    ];
  const stepStatus = (done) => done ? 'Done' : 'Not started';
  const action = expired && !preview
    ? '<button class="btn primary" disabled>Completion window closed</button>'
    : progress.eligible
      ? routeLink(`${preview ? `preview/${publication.id}` : `learn/${publication.slug}`}/certificate`, 'View certificate', 'btn primary')
      : progress.submission
        ? `<a class="btn primary" href="${learnerHref(context, requiresTest ? 'test/0' : 'attendance', preview)}">${requiresTest ? 'Continue to knowledge check' : 'Confirm attendance'}</a>`
        : `<a class="btn primary" href="${learnerHref(context, 'evaluation/0', preview)}">Start evaluation</a>`;
  const content = `
    <section class="checklist-card">
      <h1>${escapeHtml(course.name)}</h1>
      <p class="checklist-intro">Complete these steps to get your certificate.</p>
      <div class="path-steps senior">
        ${steps.map(([title, done], index) => `
          <div>
            <i>${index + 1}</i>
            <span><strong>${escapeHtml(title)}</strong><small>${done ? 'You finished this step.' : 'This step is waiting for you.'}</small></span>
            <em class="path-status ${done ? 'done' : ''}">${stepStatus(done)}</em>
          </div>`).join('')}
      </div>
      <div class="checklist-action">${action}</div>
      <div class="deadline-card ${expired ? 'expired' : ''}"><span>Completion deadline</span><strong>${formatDate(publication.deadline)}</strong><small>${expired ? 'This activity is closed.' : 'Your progress saves on this device.'}</small></div>
    </section>
    <details class="details-plain">
      <summary>Activity details</summary>
      <dl>
        <div><dt>Activity type</dt><dd>${escapeHtml(ACTIVITY_TYPES[publication.activityType].label)}</dd></div>
        <div><dt>Version</dt><dd>${escapeHtml(context.version.name)}</dd></div>
        <div><dt>Class group</dt><dd>${escapeHtml(cohort.name)}</dd></div>
        <div><dt>Module</dt><dd>${escapeHtml(module.name)}</dd></div>
        <div><dt>Credit hours</dt><dd>${module.creditHours}</dd></div>
        <div><dt>Presenters</dt><dd>${escapeHtml(cohort.presenters.join(', '))}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(cohort.location)}</dd></div>
      </dl>
    </details>`;
  document.body.className = 'learner-page';
  return `<header class="learner-header"><div><img src="assets/logo.png?v=3" alt="Lifespan Learning Institute"><span>Continuing education</span></div><div class="learner-header-actions">${preview ? routeLink('admin/activities', 'Exit preview', 'btn light small') : ''}${routeLink('learn', 'All activities', 'btn light small')}</div></header>${preview ? '<div class="preview-banner"><strong>Admin learner preview</strong><span>This draft can be reviewed without publishing.</span></div>' : ''}<main class="learner-main" id="main">${content}</main>`;
}

const SCALE = [
  ['1', 'Strongly disagree'],
  ['2', 'Disagree'],
  ['3', 'Neutral'],
  ['4', 'Agree'],
  ['5', 'Strongly agree']
];

function ratingQuestion(name, question, value = '') {
  const text = typeof question === 'string' ? question : question.text;
  const scale = typeof question === 'string' || !question.scale
    ? SCALE
    : question.scale.map((label, index) => [String(index + 1), label]);
  const selected = value === '' || value == null ? '5' : String(value);
  return `<fieldset class="question rating-question"><legend>${escapeHtml(text)}</legend><div class="star-scale">${scale.map(([number, label]) => `<label class="star-choice"><input type="radio" name="${escapeHtml(name)}" value="${number}" ${selected === number ? 'checked' : ''} required><span class="rating-label"><strong>${number}</strong>${escapeHtml(label)}</span><span class="star" aria-hidden="true">★</span></label>`).join('')}</div></fieldset>`;
}

function objectiveRatingQuestion(name, objective, draftValue = '') {
  return ratingQuestion(name, {
    text: `This activity helped me achieve the following objective: ${objective}`
  }, draftValue);
}

function evaluationPages(context, draft) {
  const learnerDefaults = {
    firstName: 'Margaret',
    lastName: 'Whitfield',
    credential: 'LCSW',
    email: 'margaret.whitfield@example.com',
    license: 'LCSW-12345',
    ...(draft.learner || {})
  };
  const bank = templateQuestionBank(context.evaluationTemplate);
  const presenters = context.cohort?.presenters?.length
    ? context.cohort.presenters
    : ['Presenter name not set'];
  const presenterQuestions = presenters.flatMap((presenter, presenterIndex) => [
    `<div class="presenter-heading"><span>${presenterIndex + 1}</span><div><h2>Presenter: ${escapeHtml(presenter)}</h2><p>Please rate this presenter using the same 1-5 scale.</p></div></div>`,
    ...(bank.presenter || []).map((question) => ratingQuestion(`presenter.${presenterIndex}.${question.id}`, question, draft.ratings?.[`presenter.${presenterIndex}.${question.id}`]))
  ]);
  return [
    {
      title: 'Learning',
      subtitle: 'Tell us how effectively this activity supported your learning.',
      body: (bank.learning || []).map((question) => ratingQuestion(`learning.${question.id}`, question, draft.ratings?.[`learning.${question.id}`])).join('')
    },
    {
      title: 'Objectives',
      subtitle: 'Rate each learning objective. 1 = strongly disagree, 5 = strongly agree.',
      body: `<div class="scale-legend"><strong>How to answer:</strong> Tap a number from 1 to 5 under each objective. You can change your choice before you continue.</div>${context.publication.objectives.map((objective, index) => (
        objectiveRatingQuestion(`objective.${index}`, objective, draft.ratings?.[`objective.${index}`])
      )).join('')}`
    },
    {
      title: 'Presenters',
      subtitle: 'Each presenter receives the same rating questions.',
      body: presenterQuestions.join('')
    },
    {
      title: 'Environment',
      subtitle: 'Rate the learning environment and technical support.',
      body: (bank.environment || []).map((question) => ratingQuestion(`environment.${question.id}`, question, draft.ratings?.[`environment.${question.id}`])).join('')
    },
    {
      title: 'Administration',
      subtitle: 'Rate program administration and disclosures.',
      body: (bank.administration || []).map((question) => ratingQuestion(`administration.${question.id}`, question, draft.ratings?.[`administration.${question.id}`])).join('')
    },
    {
      title: 'Your information',
      subtitle: 'Your details are filled in. Click continue when you are ready.',
      body: `<div class="feedback-grid">${(bank.written || []).map((question) => `<label>${escapeHtml(question.text)}<textarea name="comment.${question.id}" placeholder="Optional">${escapeHtml(draft.comments?.[question.id] || '')}</textarea></label>`).join('')}</div><div class="subsection-title">Certificate information</div><div class="form-grid two"><label>First name<input name="firstName" value="${escapeHtml(learnerDefaults.firstName)}" required></label><label>Last name<input name="lastName" value="${escapeHtml(learnerDefaults.lastName)}" required></label><label>Credential<input name="credential" value="${escapeHtml(learnerDefaults.credential)}" placeholder="LCSW, PhD, LMFT"></label><label>Email address<input type="email" name="email" value="${escapeHtml(learnerDefaults.email)}" required></label><label class="span-two">Professional license number<input name="license" value="${escapeHtml(learnerDefaults.license)}" required></label></div>`
    }
  ];
}

function learnerEvaluation(context, pageIndex, preview = false) {
  const draft = preview
    ? previewSession(context.publication.id).draft
    : (state().drafts[context.publication.id] || { ratings: {}, comments: {}, learner: {} });
  const pages = evaluationPages(context, draft);
  const currentIndex = Math.min(Math.max(Number(pageIndex) || 0, 0), pages.length - 1);
  const page = pages[currentIndex];
  const namedSteps = `<div class="named-steps eval-named-steps">${pages.map((item, index) => `<span class="${index === currentIndex ? 'active' : ''}${index < currentIndex ? ' done' : ''}">${escapeHtml(item.title)}</span>`).join('')}</div>`;
  const progress = `<div class="eval-progress"><div><span>Evaluation progress</span><strong>${currentIndex + 1} of ${pages.length}</strong></div><i><b style="width:${((currentIndex + 1) / pages.length) * 100}%"></b></i></div>`;
  const prevButton = currentIndex > 0
    ? `<button type="button" class="btn ghost" data-action="eval-prev">Previous</button>`
    : routeLink(preview ? `preview/${context.publication.id}` : `learn/${context.publication.slug}`, 'Back', 'btn ghost');
  const help = currentIndex < pages.length - 1
    ? '<p class="rating-help"><span aria-hidden="true">★</span> Tap a number to rate each item. When you are finished with this page, press <strong>Continue</strong>.</p>'
    : '';
  const content = `${namedSteps}${progress}<form id="learner-evaluation" data-id="${context.publication.id}" data-page="${currentIndex}" data-preview="${preview}"><section class="evaluation-card"><div class="evaluation-heading"><p class="eyebrow">Step ${currentIndex + 1}</p><h2>${escapeHtml(page.title)}</h2><p>${escapeHtml(page.subtitle)}</p></div>${help}${page.body}</section><div class="form-navigation">${prevButton}<button class="btn primary" type="submit">${currentIndex === pages.length - 1 ? 'Submit evaluation' : 'Continue'}</button></div></form>`;
  return learnerBase(context, content, { preview, label: 'Evaluation' });
}

function learnerAttendance(context, preview = false) {
  const progress = progressFor(context, preview);
  if (!progress.submission) return learnerLanding(context, preview);
  const learner = progress.submission.learner || {};
  const content = `<form id="attendance-form" data-id="${context.publication.id}" data-preview="${preview}"><section class="evaluation-card narrow-card"><div class="evaluation-heading"><p class="eyebrow">Live attendance verification</p><h2>Confirm your certificate details</h2><p>Review the details below, then continue.</p></div><div class="form-grid two"><label>Full name<input value="${escapeHtml(`${learner.firstName || ''} ${learner.lastName || ''}`.trim())}" disabled></label><label>Professional license<input value="${escapeHtml(learner.license || '')}" disabled></label></div><label class="confirmation"><input type="checkbox" name="confirm" checked required><span>I confirm that I attended this activity and the information above is accurate.</span></label><button class="btn primary full" type="submit">Continue to certificate</button></section></form>`;
  return learnerBase(context, content, { preview, label: 'Attendance verification' });
}

function learnerTest(context, questionIndex = 0, preview = false) {
  const progress = progressFor(context, preview);
  if (!progress.submission) return learnerLanding(context, preview);
  if (progress.eligible) return learnerCertificate(context, preview);
  const template = context.testTemplate;
  if (!template || progress.attemptsRemaining <= 0) {
    const content = emptyState('Attempt limit reached', 'You have used all attempts. Contact the program administrator for help.', routeLink(learnerHref(context, '', preview).slice(2), 'Activity overview', 'btn ghost'));
    return learnerBase(context, content, { preview, label: 'Knowledge check' });
  }
  const qIndex = Math.min(Math.max(Number(questionIndex) || 0, 0), template.questions.length - 1);
  const question = template.questions[qIndex];
  const answers = testAnswers(context.publication.id, preview);
  const selected = answers[question.id] ?? '';
  const isLast = qIndex === template.questions.length - 1;
  const last = progress.attempts.at(-1);
  const hiddenAnswers = Object.entries(answers)
    .filter(([qId]) => qId !== question.id)
    .map(([qId, value]) => `<input type="hidden" name="${escapeHtml(qId)}" value="${escapeHtml(value)}">`)
    .join('');
  const content = `${last ? `<div class="result-banner fail"><strong>${last.percent}% — not yet passed</strong><span>${progress.attemptsRemaining} attempt${progress.attemptsRemaining === 1 ? '' : 's'} remaining.</span></div>` : ''}<form id="test-form" data-id="${context.publication.id}" data-preview="${preview}" data-question="${qIndex}"><section class="evaluation-card test-single"><div class="evaluation-heading"><p class="eyebrow">Question ${qIndex + 1} of ${template.questions.length} · Attempt ${progress.attempts.length + 1}</p><h2>Knowledge check</h2><p>Choose the best answer, then press Continue. You need ${context.testTemplate.passPercent}% to pass.</p></div>${hiddenAnswers}<fieldset class="test-question single-question"><legend>${escapeHtml(question.text)}</legend>${question.options.map((option, optionIndex) => `<label class="test-choice"><input type="radio" name="${question.id}" value="${optionIndex}" ${String(selected) === String(optionIndex) ? 'checked' : ''} required><span>${escapeHtml(option)}</span></label>`).join('')}</fieldset><div class="form-navigation"><a class="btn ghost" href="${learnerHref(context, '', preview)}">Save for later</a>${isLast ? '<button class="btn primary" type="submit">Submit answers</button>' : `<button type="button" class="btn primary" data-action="test-next">Continue</button>`}</div></section></form>`;
  return learnerBase(context, content, { preview, label: 'Knowledge check' });
}

function learnerCertificate(context, preview = false) {
  const progress = progressFor(context, preview);
  const session = preview ? previewSession(context.publication.id) : null;
  let certificate = preview
    ? session.certificate
    : state().certificates.find((item) => item.publicationId === context.publication.id);
  if (!progress.eligible && !preview) {
    const content = emptyState('Certificate locked', 'Complete every required step before the certificate becomes available.', `<a class="btn primary" href="${learnerHref(context)}">View requirements</a>`);
    return learnerBase(context, content, { preview, label: 'Certificate' });
  }
  if (!certificate) {
    const learner = progress.submission?.learner || { firstName: 'Margaret', lastName: 'Whitfield', credential: 'LCSW' };
    certificate = preview
      ? {
        id: `preview-${context.publication.id}`,
        number: 'LLI-PREVIEW-000001',
        publicationId: context.publication.id,
        issuedAt: new Date().toISOString(),
        learner,
        snapshot: {
          publicationId: context.publication.id,
          revision: context.publication.revision,
          activityType: context.publication.activityType,
          courseName: context.course.name,
          versionName: context.version.name,
          cohortName: context.cohort.name,
          moduleName: context.module.name,
          presenters: [...context.cohort.presenters],
          location: context.cohort.location,
          creditHours: context.module.creditHours,
          activityDates: [context.module.startDate, context.module.endDate],
          objectives: [...context.publication.objectives],
          cosponsor: context.publication.cosponsor || 'Sensorimotor Psychotherapy Institute'
        },
        templateId: context.publication.certificateTemplateId
      }
      : store.issueCertificate(context.publication.id, learner);
    if (preview) session.certificate = certificate;
  }
  const content = `<section class="certificate-view"><div class="completion-banner success-large"><span>Congratulations</span><strong>Your certificate is ready</strong><p>${escapeHtml(context.course.name)} · ${context.module.creditHours} credit hours</p></div><div class="certificate-frame"><div id="certificate-render"></div></div><div class="certificate-actions oversized"><button class="btn primary" data-action="download-certificate" data-id="${certificate.id}">Download certificate</button><button class="btn secondary" data-action="print-certificate">Print certificate</button></div><dl class="certificate-details minimal"><div><dt>Certificate number</dt><dd>${escapeHtml(certificate.number)}</dd></div><div><dt>Issued</dt><dd>${new Date(certificate.issuedAt).toLocaleDateString()}</dd></div></dl></section>`;
  const html = learnerBase(context, content, { preview, label: 'Certificate', hideCourse: true });
  setTimeout(async () => {
    const mount = document.querySelector('#certificate-render');
    const template = byId(state().templates.certificates, certificate.templateId);
    try {
      certificateReady = await renderCertificate(mount, certificate, template);
    } catch {
      toast('Certificate could not be rendered.', 'error');
    }
  });
  return html;
}

function findLearnerContext(parts) {
  const data = state();
  if (parts[0] === 'preview') return { context: activityContext(data, parts[1]), preview: true, offset: 2 };
  const publication = data.publications.find((item) => item.slug === parts[1] && item.status === 'published');
  return { context: activityContext(data, publication), preview: false, offset: 2 };
}

function learnerCatalog() {
  const data = state();
  const published = data.publications.filter((item) => item.status === 'published');
  const cards = published.map((publication) => {
    const context = activityContext(data, publication);
    const expired = isExpired(publication);
    return `
      <article class="learner-catalog-card ${expired ? 'is-expired' : ''}">
        <div class="activity-topline"><span class="type-chip">${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)}</span><span>${expired ? 'Closed' : 'Open'}</span></div>
        <h2>${escapeHtml(context.course?.name || 'Activity')}</h2>
        <p>${escapeHtml(context.cohort?.name || '')} · ${context.module?.creditHours || 0} CE hours</p>
        <p class="muted">Deadline ${formatDate(publication.deadline)} · ${escapeHtml((context.cohort?.presenters || []).join(', ') || 'Presenters TBA')}</p>
        ${expired
          ? '<button class="btn ghost" disabled>Completion window closed</button>'
          : routeLink(`learn/${publication.slug}`, 'Open this activity', 'btn primary')}
      </article>`;
  }).join('');
  document.body.className = 'learner-page';
  return `
    <header class="learner-header">
      <div><img src="assets/logo.png?v=3" alt="Lifespan Learning Institute"><span>Learner portal</span></div>
      ${routeLink('admin/dashboard', 'Admin portal', 'btn light small')}
    </header>
    <main class="learner-main" id="main">
      ${nextStepBanner(published.length ? 'Choose an activity below. Only published activities appear here.' : 'No published activities yet. An administrator must publish one first.', routeLink('admin/activities', 'Go to Admin activities', 'btn secondary'))}
      <section class="section-heading standalone"><div><h1>Your continuing education activities</h1><p>Everything an administrator publishes shows up on this page.</p></div></section>
      <div class="learner-catalog-grid">${cards || emptyState('Nothing published yet', 'When an administrator publishes an activity, it will appear here automatically.', routeLink('admin/dashboard', 'Open Admin', 'btn primary'))}</div>
    </main>`;
}

function learnerShell(inner, actions = '') {
  document.body.className = 'learner-page';
  return `<header class="learner-header"><div><img src="assets/logo.png?v=3" alt="Lifespan Learning Institute"><span>Continuing education</span></div><div class="learner-header-actions">${routeLink('learn', 'All activities', 'btn light small')}${actions}</div></header>${inner}`;
}

function renderLearner(parts) {
  if (parts[0] === 'learn' && !parts[1]) {
    return learnerCatalog();
  }
  const { context, preview, offset } = findLearnerContext(parts);
  if (!context) {
    return learnerShell(`<main class="learner-main">${emptyState('Activity not available', 'This link is invalid, unpublished, or no longer available.', routeLink('learn', 'Back to all activities', 'btn primary'))}</main>`);
  }
  const screen = parts[offset] || 'overview';
  if (screen === 'evaluation') return learnerEvaluation(context, parts[offset + 1] || 0, preview);
  if (screen === 'attendance') return learnerAttendance(context, preview);
  if (screen === 'test') return learnerTest(context, parts[offset + 1] || 0, preview);
  if (screen === 'certificate') return learnerCertificate(context, preview);
  return learnerLanding(context, preview);
}

function render() {
  document.body.classList.remove('menu-open');
  const parts = routeParts();
  if (!parts.length) {
    location.hash = '#/admin/dashboard';
    return;
  }
  if (parts[0] === 'learn' || parts[0] === 'preview') {
    app.innerHTML = renderLearner(parts);
    window.scrollTo(0, 0);
    return;
  }
  const screen = parts[1] || 'dashboard';
  if (screen === 'activities') app.innerHTML = adminActivities();
  else if (screen === 'activity') app.innerHTML = adminActivityEditor(parts[2], parts[3] === 'edit' ? parts[4] : 1);
  else if (screen === 'templates') app.innerHTML = adminTemplates();
  else if (screen === 'template') app.innerHTML = adminTemplateEditor(parts[2]);
  else if (screen === 'test') app.innerHTML = adminTestEditor(parts[2]);
  else if (screen === 'reports') app.innerHTML = adminReports(parts[2]);
  else if (screen === 'certificates') app.innerHTML = adminCertificates();
  else app.innerHTML = adminDashboard();
  window.scrollTo(0, 0);
}

function collectEvaluation(form) {
  const formData = new FormData(form);
  const draft = form.dataset.preview === 'true'
    ? previewSession(form.dataset.id).draft
    : (state().drafts[form.dataset.id] || { ratings: {}, comments: {}, learner: {} });
  const next = structuredClone(draft);
  next.ratings ||= {};
  next.comments ||= {};
  next.learner ||= {};
  for (const [key, value] of formData) {
    if (key.startsWith('comment.')) next.comments[key.slice(8)] = value;
    else if (['firstName', 'lastName', 'credential', 'email', 'license'].includes(key)) next.learner[key] = value;
    else next.ratings[key] = Number(value);
  }
  return next;
}

function submitActivityForm(form) {
  const data = new FormData(form);
  const activityType = data.get('activityType') || 'live';
  const course = byId(state().courses, data.get('courseId'));
  const draftKey = form.dataset.draftKey || form.dataset.id || 'new';
  const draft = loadWizardDraft(draftKey);
  const mergedData = { ...draft, ...Object.fromEntries(data) };
  const requiresTest = ACTIVITY_TYPES[activityType]?.requiresTest;
  let objectives = String(mergedData.objectives || '').split('\n').map((item) => item.trim()).filter(Boolean);
  if (objectives.length < 4) {
    objectives = activityPreset(state(), activityType).objectives;
  }
  const result = store.savePublication({
    id: form.dataset.id || undefined,
    courseId: mergedData.courseId,
    versionId: mergedData.versionId,
    cohortId: mergedData.cohortId,
    moduleId: mergedData.moduleId,
    activityType,
    deadline: mergedData.deadline,
    location: String(mergedData.location || '').trim(),
    creditHours: Number(mergedData.creditHours),
    startDate: mergedData.startDate,
    endDate: mergedData.endDate,
    presenters: String(mergedData.presenters || '').split('\n').map((item) => item.trim()).filter(Boolean),
    cosponsor: String(mergedData.cosponsor || '').trim() || 'Sensorimotor Psychotherapy Institute',
    evaluationTemplateId: mergedData.evaluationTemplateId || state().templates.evaluations[0].id,
    testTemplateId: requiresTest ? (mergedData.testTemplateId || state().templates.tests[0].id) : null,
    certificateTemplateId: ACTIVITY_TYPES[activityType].certificateTemplate,
    slug: form.dataset.id
      ? (byId(state().publications, form.dataset.id)?.slug || safeSlug(course?.name || 'activity'))
      : safeSlug(course?.name || 'activity'),
    objectives,
    status: form.dataset.id ? byId(state().publications, form.dataset.id)?.status : 'draft'
  });
  if (!result.ok) {
    toast(result.errors.join(' '), 'error');
    return;
  }
  clearWizardDraft(draftKey);
  sessionStorage.setItem(`activity-saved-${result.publication.id}`, '1');
  toast('Activity saved.');
  location.hash = `#/admin/activity/${result.publication.id}/edit/6`;
}

function exportReport(publicationId) {
  const data = state();
  const context = activityContext(data, publicationId);
  const submissions = reportData(publicationId).submissions;
  const questionDetails = (key, submission) => {
    const [section, part, id] = key.split('.');
    if (section === 'objective') return ['Learning Objectives', submission.snapshot?.objectives?.[Number(part)] || context.publication.objectives[Number(part)] || key];
    if (section === 'presenter') {
      const question = STANDARD_QUESTIONS.presenter.find((item) => item.id === id);
      return [submission.snapshot?.presenters?.[Number(part)] || context.cohort.presenters[Number(part)] || 'Presenter', question?.text || key];
    }
    const question = STANDARD_QUESTIONS[section]?.find((item) => item.id === part);
    return [section.replace(/^\w/, (letter) => letter.toUpperCase()), question?.text || key];
  };
  const rows = [['Submission ID', 'Submitted', 'Revision', 'Course', 'Version', 'Cohort', 'Module', 'Section', 'Question', 'Rating', 'Anonymous written response']];
  submissions.forEach((submission) => {
    Object.entries(submission.ratings || {}).forEach(([question, rating]) => {
      const [section, label] = questionDetails(question, submission);
      rows.push([submission.id, submission.submittedAt, submission.publicationRevision, context.course.name, context.version.name, context.cohort.name, context.module.name, section, label, rating, '']);
    });
    Object.entries(submission.comments || {}).filter(([, answer]) => answer).forEach(([questionId, answer]) => {
      const question = STANDARD_QUESTIONS.written.find((item) => item.id === questionId);
      rows.push([submission.id, submission.submittedAt, submission.publicationRevision, context.course.name, context.version.name, context.cohort.name, context.module.name, 'Written feedback', question?.text || questionId, '', answer]);
    });
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = `${context.publication.slug}-evaluation-report.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
  toast('CSV report downloaded.');
}

document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;

  if (form.id === 'activity-form') {
    if (Number(form.dataset.step) !== 6) return;
    syncPresentersField(form);
    submitActivityForm(form);
    return;
  }
  if (form.id === 'template-form') {
    const sections = {};
    ['learning', 'presenter', 'environment', 'administration', 'written'].forEach((key) => {
      sections[key] = [...form.querySelectorAll(`.eval-question-list[data-section="${key}"] .eval-question-row`)].map((row, index) => {
        const textarea = row.querySelector('textarea');
        const existingId = row.dataset.qid || `${key}-${index + 1}`;
        return {
          id: existingId,
          text: textarea?.value?.trim() || `Question ${index + 1}`
        };
      }).filter((item) => item.text);
    });
    const result = store.saveEvaluationTemplate(form.dataset.id, {
      name: new FormData(form).get('name'),
      sections
    });
    if (!result.ok) toast(result.errors.join(' '), 'error');
    else {
      toast('Evaluation form saved.');
      render();
    }
    return;
  }
  if (form.id === 'test-template-form') {
    const payload = collectTestTemplateForm(form);
    if (payload.questions.length < 1) {
      toast('Add at least one complete question.', 'error');
      return;
    }
    const result = store.saveTestTemplate(form.dataset.id, payload);
    if (!result.ok) toast(result.errors.join(' '), 'error');
    else {
      toast('Knowledge check saved.');
      render();
    }
    return;
  }
  if (form.id === 'learner-evaluation') {
    const draft = collectEvaluation(form);
    const context = activityContext(state(), form.dataset.id);
    const page = Number(form.dataset.page);
    const preview = form.dataset.preview === 'true';
    const pages = evaluationPages(context, draft);
    if (preview) previewSession(form.dataset.id).draft = draft;
    else store.saveDraft(form.dataset.id, draft);
    if (page < pages.length - 1) {
      location.hash = learnerHref(context, `evaluation/${page + 1}`, preview);
      return;
    }
    const response = {
      ratings: draft.ratings,
      objectiveRatings: context.publication.objectives.map((_, index) => draft.ratings[`objective.${index}`]),
      presenterRatings: Object.fromEntries(Object.entries(draft.ratings).filter(([key]) => key.startsWith('presenter.'))),
      comments: draft.comments,
      learner: draft.learner
    };
    if (preview) previewSession(form.dataset.id).submission = response;
    else store.submitEvaluation(form.dataset.id, response);
    const nextMessage = ACTIVITY_TYPES[context.publication.activityType].requiresTest
      ? 'Thank you. Next: take the knowledge check.'
      : 'Thank you. Next: confirm attendance.';
    toast(nextMessage);
    location.hash = learnerHref(context, ACTIVITY_TYPES[context.publication.activityType].requiresTest ? 'test' : 'attendance', preview);
    return;
  }
  if (form.id === 'attendance-form') {
    const context = activityContext(state(), form.dataset.id);
    const preview = form.dataset.preview === 'true';
    const progress = progressFor(context, preview);
    if (preview) previewSession(form.dataset.id).attendanceConfirmed = true;
    else {
      store.confirmAttendance(form.dataset.id);
      store.issueCertificate(form.dataset.id, progress.submission.learner);
    }
    location.hash = learnerHref(context, 'certificate', preview);
    return;
  }
  if (form.id === 'test-form') {
    const context = activityContext(state(), form.dataset.id);
    const preview = form.dataset.preview === 'true';
    const stored = testAnswers(form.dataset.id, preview);
    const answers = { ...stored, ...Object.fromEntries(new FormData(form)) };
    const result = scoreTest(context.testTemplate, answers);
    clearTestAnswers(form.dataset.id, preview);
    if (preview) previewSession(form.dataset.id).attempts.push({ ...result, answers });
    else store.recordAttempt(form.dataset.id, result, answers);
    if (result.passed) {
      const progress = progressFor(context, preview);
      if (!preview) store.issueCertificate(form.dataset.id, progress.submission.learner);
      toast(`Passed with ${result.percent}%. Certificate unlocked.`);
      location.hash = learnerHref(context, 'certificate', preview);
    } else {
      toast(`${result.percent}% — 80% is required.`, 'error');
      location.hash = learnerHref(context, 'test/0', preview);
    }
  }
});

document.addEventListener('change', (event) => {
  if (event.target.name === 'activityType' && event.target.closest('#activity-form')) {
    const form = event.target.closest('#activity-form');
    const draftKey = form.dataset.draftKey || form.dataset.id || 'new';
    const draft = loadWizardDraft(draftKey);
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) draft[key] = value;
    const next = applyActivityTypePreset(draft, state(), event.target.value);
    saveWizardDraft(draftKey, next);
    render();
    return;
  }
  if (event.target.id === 'report-filter') {
    location.hash = `#/admin/reports/${event.target.value}`;
  } else if (event.target.id === 'report-date-from' || event.target.id === 'report-date-to') {
    reportDateFrom = document.querySelector('#report-date-from')?.value || '';
    reportDateTo = document.querySelector('#report-date-to')?.value || '';
    render();
  } else if (event.target.classList.contains('report-jump-filter')) {
    const { field } = event.target.dataset;
    const value = event.target.value;
    const publication = state().publications.find((item) => {
      if (field === 'presenter') return activityContext(state(), item)?.cohort?.presenters.includes(value);
      return item[field] === value;
    });
    if (publication) location.hash = `#/admin/reports/${publication.id}`;
    else toast('No activity matches that filter.', 'error');
  }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id, value } = target.dataset;
  if (action === 'menu') {
    document.body.classList.toggle('menu-open');
  } else if (action === 'menu-close') {
    document.body.classList.remove('menu-open');
  } else if (action === 'toggle-more-filters') {
    document.querySelector('.report-filters')?.classList.toggle('open');
    document.querySelector('.report-filters')?.classList.toggle('collapsed');
  } else if (action === 'eval-prev') {
    const form = document.querySelector('#learner-evaluation');
    if (!form) return;
    const draft = collectEvaluation(form);
    const preview = form.dataset.preview === 'true';
    if (preview) previewSession(form.dataset.id).draft = draft;
    else store.saveDraft(form.dataset.id, draft);
    const context = activityContext(state(), form.dataset.id);
    const page = Number(form.dataset.page);
    if (page > 0) location.hash = learnerHref(context, `evaluation/${page - 1}`, preview);
    else location.hash = learnerHref(context, '', preview);
  } else if (action === 'wizard-next' || action === 'wizard-prev' || action === 'wizard-goto') {
    const form = document.querySelector('#activity-form');
    if (!form) return;
    if (action === 'wizard-next' || action === 'wizard-prev' || action === 'wizard-goto') {
      syncPresentersField(form);
    }
    if (action === 'wizard-next' && !form.reportValidity()) return;
    const draftKey = form.dataset.draftKey || form.dataset.id || 'new';
    const draft = loadWizardDraft(draftKey);
    const previousType = draft.activityType;
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) draft[key] = value;
    const activityType = formData.get('activityType') || draft.activityType || 'live';
    const currentStep = Number(form.dataset.step);
    const typeChanged = currentStep === 1 && previousType !== activityType;
    const nextDraft = (typeChanged || !previousType)
      ? applyActivityTypePreset(draft, state(), activityType)
      : { ...draft, activityType };
    if (ACTIVITY_TYPES[activityType]?.requiresTest && !nextDraft.testTemplateId) {
      nextDraft.testTemplateId = state().templates.tests[0]?.id || '';
    }
    if (!ACTIVITY_TYPES[activityType]?.requiresTest) nextDraft.testTemplateId = '';
    saveWizardDraft(draftKey, nextDraft);
    let targetStep = currentStep;
    if (action === 'wizard-next') targetStep = wizardNextStep(currentStep, activityType);
    else if (action === 'wizard-prev') targetStep = wizardPrevStep(currentStep, activityType);
    else targetStep = Number(target.dataset.step) || 1;
    const pubId = form.dataset.id || 'new';
    location.hash = `#/admin/activity/${pubId}/edit/${targetStep}`;
  } else if (action === 'test-next') {
    const form = document.querySelector('#test-form');
    if (!form || !form.reportValidity()) return;
    const context = activityContext(state(), form.dataset.id);
    const preview = form.dataset.preview === 'true';
    const qIndex = Number(form.dataset.question) || 0;
    const answers = { ...testAnswers(form.dataset.id, preview), ...Object.fromEntries(new FormData(form)) };
    saveTestAnswers(form.dataset.id, preview, answers);
    location.hash = learnerHref(context, `test/${qIndex + 1}`, preview);
  } else if (action === 'duplicate-publication') {
    const duplicate = store.duplicatePublication(id);
    toast('Activity duplicated as a draft.');
    location.hash = `#/admin/activity/${duplicate.id}/edit/1`;
  } else if (action === 'duplicate-template') {
    const duplicate = store.duplicateEvaluationTemplate(id);
    toast('Template duplicated.');
    location.hash = `#/admin/template/${duplicate.id}`;
  } else if (action === 'duplicate-test') {
    const duplicate = store.duplicateTestTemplate(id);
    toast('Knowledge check duplicated. You can rename it on the next screen.');
    location.hash = `#/admin/test/${duplicate.id}`;
  } else if (action === 'create-test') {
    const created = store.createTestTemplate('New Knowledge Check');
    toast('New knowledge check created.');
    location.hash = `#/admin/test/${created.id}`;
  } else if (action === 'goto-eval-template') {
    location.hash = `#/admin/template/${id}`;
  } else if (action === 'goto-test-template') {
    location.hash = `#/admin/test/${id}`;
  } else if (action === 'goto-activity-edit') {
    location.hash = `#/admin/activity/${id}/edit/1`;
  } else if (action === 'add-eval-question') {
    const section = target.dataset.section;
    const list = document.querySelector(`.eval-question-list[data-section="${section}"]`);
    if (!list) return;
    const index = list.querySelectorAll('.eval-question-row').length + 1;
    const qid = `${section}-new-${Date.now().toString(36)}`;
    list.insertAdjacentHTML('beforeend', `
      <div class="eval-question-row" data-qid="${qid}">
        <label>Question ${index}
          <textarea name="${section}.${qid}" rows="2" required></textarea>
        </label>
        <button type="button" class="btn ghost small" data-action="remove-eval-question">Remove</button>
      </div>`);
  } else if (action === 'remove-eval-question') {
    target.closest('.eval-question-row')?.remove();
  } else if (action === 'add-presenter') {
    const list = document.querySelector('.presenter-field-list');
    const form = document.querySelector('#activity-form');
    if (!list || !form) return;
    syncPresentersField(form);
    const count = list.querySelectorAll('.presenter-row').length + 1;
    list.insertAdjacentHTML('beforeend', `
      <div class="presenter-row">
        <label>Presenter ${count}
          <input type="text" class="presenter-input" value="" required placeholder="Example: Pat Ogden, PhD">
        </label>
        <button type="button" class="btn ghost small presenter-remove" data-action="remove-presenter">Remove</button>
      </div>`);
  } else if (action === 'remove-presenter') {
    const row = target.closest('.presenter-row');
    const list = document.querySelector('.presenter-field-list');
    if (!row || !list || list.querySelectorAll('.presenter-row').length < 2) return;
    row.remove();
    [...list.querySelectorAll('.presenter-row')].forEach((item, index) => {
      const label = item.querySelector('label');
      if (label) label.firstChild.textContent = `Presenter ${index + 1} `;
    });
    syncPresentersField(document.querySelector('#activity-form'));
  } else if (action === 'add-test-question') {
    const form = document.querySelector('#test-template-form');
    const list = document.querySelector('#test-question-list');
    if (!form || !list) return;
    const index = Number(form.dataset.questionCount) || 0;
    form.dataset.questionCount = String(index + 1);
    list.insertAdjacentHTML('beforeend', `
      <article class="editor-card test-question-editor" data-question-index="${index}">
        <div class="section-heading tight"><h3>Question ${index + 1}</h3><button type="button" class="btn ghost small" data-action="remove-test-question" data-index="${index}">Remove</button></div>
        <label>Question text<textarea name="q_${index}_text" rows="2" required></textarea></label>
        <div class="form-grid two">
          <label>Answer 1<input name="q_${index}_opt_0" required></label>
          <label>Answer 2<input name="q_${index}_opt_1" required></label>
          <label>Answer 3<input name="q_${index}_opt_2" value="Optional third answer"></label>
          <label>Answer 4<input name="q_${index}_opt_3" value="Optional fourth answer"></label>
        </div>
        <label>Correct answer<select name="q_${index}_correct"><option value="0">Answer 1</option><option value="1">Answer 2</option></select></label>
        <label>Linked objective (0 = first objective)<input type="number" min="0" step="1" name="q_${index}_objective" value="0"></label>
      </article>`);
  } else if (action === 'remove-test-question') {
    const form = document.querySelector('#test-template-form');
    const block = target.closest('.test-question-editor');
    if (!form || !block) return;
    block.remove();
    toast('Question removed. Save to apply changes.');
  } else if (action === 'toggle-publish') {
    const result = store.togglePublication(id);
    if (!result.ok) toast(result.errors.join(' '), 'error');
    else {
      toast(result.publication.status === 'published' ? 'Activity published.' : 'Activity returned to draft.');
      render();
    }
  } else if (action === 'copy-link') {
    try {
      await navigator.clipboard.writeText(value);
      toast('Public link copied.');
    } catch {
      window.prompt('Copy this public link:', value);
    }
  } else if (action === 'export-csv') {
    exportReport(id);
  } else if (action === 'print-report' || action === 'print-certificate') {
    window.print();
  } else if (action === 'download-certificate') {
    const certificate = byId(state().certificates, id)
      || [...previewSessions.values()].map((session) => session.certificate).find((item) => item?.id === id);
    const mount = document.querySelector('#certificate-render');
    if (!certificateReady || !mount) {
      toast('Certificate is still rendering.', 'error');
      return;
    }
    try {
      await downloadCertificatePdf(mount, `${certificate.number}.pdf`);
    } catch {
      toast('Could not create the PDF. Try Print instead.', 'error');
    }
    toast('Certificate downloaded.');
  }
});

window.addEventListener('hashchange', render);
render();
