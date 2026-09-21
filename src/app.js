import { STANDARD_QUESTIONS } from './seed.js';
import { store } from './store.js';
import {
  ACTIVITY_TYPES,
  activityContext,
  byId,
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
    objectives
  };
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
        <div class="admin-brand"><img src="assets/logo.png?v=2" alt="Lifespan Learning Institute"></div>
        <nav aria-label="Administrator navigation">
          ${navigation.map(([id, label]) => `
            <a href="#/admin/${id}" class="${active === id ? 'active' : ''}">
              <span class="nav-monogram" aria-hidden="true">${label.slice(0, 1)}</span>
              <span>${label}</span>
            </a>`).join('')}
        </nav>
        <div class="sidebar-note">
          <span>Frontend prototype</span>
          <small>Data is stored on this device.</small>
        </div>
      </aside>
      <section class="admin-workspace">
        <header class="admin-header">
          <button class="mobile-menu" data-action="menu" aria-label="Toggle navigation">Menu</button>
          <div><p class="eyebrow">Lifespan LMS</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
          <div class="header-actions">${actions}</div>
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
      ${routeLink('admin/activity/new/edit/1', '<span class="guide-icon">+</span><strong>Create activity</strong><small>Set up a new learning activity step by step.</small>', 'guide-card')}
      ${routeLink('admin/activities', '<span class="guide-icon">A</span><strong>Open activities</strong><small>View, edit, and publish your activities.</small>', 'guide-card')}
      ${routeLink('admin/reports', '<span class="guide-icon">R</span><strong>View reports</strong><small>See evaluation results and download reports.</small>', 'guide-card')}
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
      ? routeLink(`admin/activity/${publication.id}/edit/1`, 'Edit', 'btn secondary')
      : `<button class="btn primary" data-action="toggle-publish" data-id="${publication.id}">Publish</button>`;
    return `
      <article class="activity-card">
        <div class="activity-card-main">
          <div class="activity-topline">${statusBadge(publication.status)}<span class="type-chip">${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)}</span><span>Saved version ${publication.revision}</span></div>
          <h2>${escapeHtml(context.course?.name)}</h2>
          <p>${escapeHtml(context.version?.name)} · Class group: ${escapeHtml(context.cohort?.name)} · ${escapeHtml(context.module?.name)}</p>
          <div class="activity-meta"><span>Deadline <strong>${formatDate(publication.deadline)}</strong></span><span>Learning goals <strong>${publication.objectives.length}</strong></span><span>Responses <strong>${responseCount}</strong></span><span>Credit hours <strong>${context.module?.creditHours}</strong></span></div>
          ${publication.status === 'published' ? `<div class="published-link"><span>${escapeHtml(publicUrl)}</span><button data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy</button></div>` : ''}
        </div>
        <div class="activity-card-actions senior">
          ${primaryAction}
          ${publication.status !== 'published' ? routeLink(`admin/activity/${publication.id}/edit/1`, 'Edit', 'btn secondary') : ''}
          <details class="more-actions">
            <summary>More actions</summary>
            <div class="more-panel">
              <button class="btn ghost" data-action="duplicate-publication" data-id="${publication.id}">Duplicate</button>
              ${routeLink(`preview/${publication.id}`, 'Preview', 'btn ghost')}
              ${publication.status === 'published' ? `<button class="btn ghost" data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy link</button><button class="btn danger-ghost" data-action="toggle-publish" data-id="${publication.id}">Unpublish</button>` : ''}
            </div>
          </details>
        </div>
      </article>`;
  }).join('');
  return adminShell(
    'Activities',
    'View and manage your learning activities.',
    `<div class="filter-bar"><div><strong>${data.publications.length} activities</strong><span>${data.publications.filter((item) => item.status === 'draft').length} drafts not yet published</span></div>${routeLink('admin/activity/new/edit/1', 'Create activity', 'btn primary')}</div><section class="activity-list">${rows}</section>`,
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
    presenters: (existing.presenters || []).join('\n')
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
  const step = Math.min(Math.max(Number(stepParam) || 1, 1), 6);
  const requiresTest = ACTIVITY_TYPES[publication.activityType]?.requiresTest;
  if (existing && step !== 6) {
    sessionStorage.removeItem(`activity-saved-${existing.id}`);
  }
  const savedFlag = existing && sessionStorage.getItem(`activity-saved-${existing.id}`);

  if (savedFlag && step === 6) {
    const publicUrl = `${location.origin}${location.pathname}#/learn/${existing.slug}`;
    const content = `
      <section class="wizard-page celebrate">
        <div class="celebrate-link">
          <h2>Activity saved</h2>
          <p>Your activity is ready. Share the link below or preview the learner experience.</p>
          <div class="published-link large"><span>${escapeHtml(publicUrl)}</span><button class="btn primary" data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy link</button></div>
          <div class="celebrate-actions">
            ${routeLink(`preview/${existing.id}`, 'Preview', 'btn secondary')}
            ${existing.status !== 'published' ? `<button class="btn primary" data-action="toggle-publish" data-id="${existing.id}">Publish</button>` : `<button class="btn ghost" data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy link again</button>`}
            ${routeLink('admin/activities', 'Back to activities', 'btn ghost')}
          </div>
        </div>
      </section>`;
    return adminShell('Activity saved', 'Your changes have been saved as a new version.', content, 'activities');
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

  const hiddenFields = (currentStep) => {
    const fields = {
      activityType: publication.activityType,
      courseId: publication.courseId,
      versionId: publication.versionId,
      cohortId: publication.cohortId,
      moduleId: publication.moduleId,
      location: locationValue,
      creditHours: creditHoursValue,
      startDate: startDateValue,
      endDate: endDateValue,
      presenters: presentersText,
      deadline: publication.deadline,
      objectives: objectivesText,
      evaluationTemplateId: publication.evaluationTemplateId,
      testTemplateId: publication.testTemplateId || '',
      certificateTemplateId: certTemplate
    };
    return Object.entries(fields)
      .filter(([name]) => {
        if (currentStep === 1 && name === 'activityType') return false;
        if (currentStep === 2 && ['courseId', 'versionId', 'cohortId', 'moduleId'].includes(name)) return false;
        if (currentStep === 3 && ['location', 'creditHours', 'startDate', 'endDate', 'presenters', 'deadline'].includes(name)) return false;
        if (currentStep === 4 && ['objectives', 'evaluationTemplateId', 'certificateTemplateId'].includes(name)) return false;
        if (currentStep === 5 && name === 'testTemplateId') return false;
        return true;
      })
      .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
      .join('');
  };

  const stepLabels = [
    'Activity type',
    'Course details',
    'Dates and place',
    'Learning goals',
    requiresTest ? 'Knowledge check' : 'Knowledge check',
    'Review'
  ];

  const step1 = `
    <section class="wizard-page" data-wizard-step="1">
      <h2>What kind of activity?</h2>
      <p>Choose the format that best matches how learners will complete this activity.</p>
      <div class="type-choice-grid">
        ${Object.entries(ACTIVITY_TYPES).map(([value, item]) => `
          <label class="type-choice">
            <input type="radio" name="activityType" value="${value}" ${publication.activityType === value ? 'checked' : ''} required>
            <span><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(ACTIVITY_TYPE_HELP[value])}</span></span>
          </label>`).join('')}
      </div>
    </section>`;

  const step2 = `
    <section class="wizard-page" data-wizard-step="2">
      <h2>Which course, class group, and module?</h2>
      <p>These are filled in for you. Change them only if you need something different.</p>
      <div class="form-grid two">
        <label>Course<select name="courseId">${selectOptions(data.courses, publication.courseId, (item) => item.name)}</select></label>
        <label>Version<select name="versionId">${selectOptions(data.versions, publication.versionId, (item) => `${byId(data.courses, item.courseId)?.name} — ${item.name}`)}</select></label>
        <label>Class group<select name="cohortId">${selectOptions(data.cohorts, publication.cohortId, (item) => `${item.name} — ${item.location}`)}</select></label>
        <label>Module<select name="moduleId">${selectOptions(data.modules, publication.moduleId, (item) => `${item.name} — ${item.creditHours} credit hours`)}</select></label>
      </div>
    </section>`;

  const step3 = `
    <section class="wizard-page" data-wizard-step="3">
      <h2>Dates, place, and presenters</h2>
      <p>Already filled from the class group. Adjust only if needed.</p>
      <div class="form-grid two">
        <label>Activity location<input name="location" value="${escapeHtml(locationValue)}" required></label>
        <label>Credit hours<input type="number" min="0.25" step="0.25" name="creditHours" value="${escapeHtml(creditHoursValue)}" required></label>
        <label>Start date<input type="date" name="startDate" value="${escapeHtml(startDateValue)}" required></label>
        <label>End date<input type="date" name="endDate" value="${escapeHtml(endDateValue)}" required></label>
        <label>Completion deadline<input type="date" name="deadline" value="${escapeHtml(publication.deadline)}" required></label>
        <label class="span-two">Presenters (one per line)<textarea name="presenters" rows="4" required>${escapeHtml(presentersText)}</textarea></label>
      </div>
    </section>`;

  const step4 = `
    <section class="wizard-page" data-wizard-step="4">
      <h2>Learning goals and evaluation</h2>
      <p>Four learning goals are ready. Keep at least four lines — one goal per line.</p>
      <label>Learning goals<textarea name="objectives" rows="8" required>${escapeHtml(objectivesText)}</textarea></label>
      <label>Evaluation template<select name="evaluationTemplateId">${selectOptions(data.templates.evaluations, publication.evaluationTemplateId, (item) => `${item.name} · v${item.version}`)}</select></label>
      <input type="hidden" name="certificateTemplateId" value="${escapeHtml(certTemplate)}">
      <p class="muted">Certificate template is chosen automatically based on activity type.</p>
    </section>`;

  const step5 = requiresTest ? `
    <section class="wizard-page" data-wizard-step="5">
      <h2>Knowledge check template</h2>
      <p>The standard knowledge check is selected for you.</p>
      <label>Test template<select name="testTemplateId" required>${selectOptions(data.templates.tests, publication.testTemplateId || data.templates.tests[0]?.id, (item) => `${item.name} · ${item.passPercent}% to pass`)}</select></label>
    </section>` : `
    <section class="wizard-page" data-wizard-step="5">
      <h2>Knowledge check</h2>
      <p>No knowledge check needed for Live activities. Continue to review.</p>
    </section>`;

  const courseName = byId(data.courses, publication.courseId)?.name || '';
  const cohortName = byId(data.cohorts, publication.cohortId)?.name || '';
  const moduleName = byId(data.modules, publication.moduleId)?.name || '';
  const step6 = `
    <section class="wizard-page" data-wizard-step="6">
      <h2>Review your activity</h2>
      <p>Check everything looks right, then save.</p>
      <dl class="review-list">
        <div><dt>Activity type</dt><dd>${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)}</dd></div>
        <div><dt>Course</dt><dd>${escapeHtml(courseName)}</dd></div>
        <div><dt>Class group</dt><dd>${escapeHtml(cohortName)}</dd></div>
        <div><dt>Module</dt><dd>${escapeHtml(moduleName)}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(locationValue)}</dd></div>
        <div><dt>Credit hours</dt><dd>${escapeHtml(creditHoursValue)}</dd></div>
        <div><dt>Deadline</dt><dd>${formatDate(publication.deadline)}</dd></div>
        <div><dt>Learning goals</dt><dd>${(objectivesText.split('\n').filter(Boolean).length)} entered</dd></div>
        ${requiresTest ? `<div><dt>Knowledge check</dt><dd>${escapeHtml(byId(data.templates.tests, publication.testTemplateId || data.templates.tests[0]?.id)?.name || 'Selected')}</dd></div>` : ''}
        <div><dt>Public link</dt><dd>Will be created from course name</dd></div>
      </dl>
      <button class="btn primary full" type="submit">Save activity</button>
    </section>`;

  const steps = [step1, step2, step3, step4, step5, step6];
  const currentPage = steps[step - 1];

  const content = `
    <form id="activity-form" class="wizard-layout" data-id="${escapeHtml(publication.id)}" data-step="${step}" data-draft-key="${escapeHtml(draftKey)}">
      <div class="named-steps wizard-steps">
        ${stepLabels.map((label, index) => {
          const stepNum = index + 1;
          const skipped = stepNum === 5 && !requiresTest;
          const stateClass = stepNum === step ? 'active' : stepNum < step ? 'done' : '';
          return `<button type="button" class="${stateClass}${skipped && step > 5 ? ' done' : ''}" data-action="wizard-goto" data-step="${stepNum}" ${skipped ? 'aria-label="Skipped for Live activities"' : ''}>${escapeHtml(label)}</button>`;
        }).join('')}
      </div>
      <div class="wizard-hidden" hidden>${hiddenFields(step)}</div>
      <div class="wizard-panel">
        ${currentPage}
        <div class="form-navigation wizard-nav">
          ${step > 1 ? `<button type="button" class="btn ghost" data-action="wizard-prev">Previous</button>` : routeLink('admin/activities', 'Cancel', 'btn ghost')}
          ${step < 6 ? `<button type="button" class="btn primary" data-action="wizard-next">Continue</button>` : ''}
        </div>
      </div>
    </form>`;

  return adminShell(
    existing ? 'Edit activity' : 'Create activity',
    existing ? 'Each save creates a new version. Past responses stay unchanged.' : 'Follow the steps below to set up your activity.',
    content,
    'activities'
  );
}

function adminTemplates() {
  const data = state();
  const evaluationCards = data.templates.evaluations.map((template) => `
    <article class="template-card">
      <div class="template-icon">E</div><div><div class="activity-topline"><span class="type-chip">Evaluation</span><span>Version ${template.version}</span></div><h2>${escapeHtml(template.name)}</h2><p>Four locked standard sections with dynamic objectives and presenter blocks.</p></div>
      <div class="template-actions">${routeLink(`admin/template/${template.id}`, 'View & edit', 'btn secondary')}<button class="btn ghost" data-action="duplicate-template" data-id="${template.id}">Duplicate</button></div>
    </article>`).join('');
  const testCards = data.templates.tests.map((template) => `
    <article class="template-card compact"><div class="template-icon">T</div><div><span class="type-chip">Test</span><h3>${escapeHtml(template.name)}</h3><p>${template.questions.length} questions · ${template.passPercent}% pass · ${template.maxAttempts} attempts</p></div></article>`).join('');
  const certCards = data.templates.certificates.map((template) => `
    <article class="template-card compact"><div class="template-icon">C</div><div><span class="type-chip">Certificate</span><h3>${escapeHtml(template.name)}</h3><p>Dynamic learner, activity, module, presenter, date, location, and credit fields.</p></div></article>`).join('');
  const content = `
    <section class="section-heading standalone"><div><p class="eyebrow">Evaluation templates</p><h2>Locked standards, flexible activity content</h2><p>Duplicate a template when you need a different reusable baseline. Do not rebuild standard questions for each activity.</p></div></section>
    <div class="template-grid">${evaluationCards}</div>
    <section class="section-heading standalone lower"><div><p class="eyebrow">Supporting templates</p><h2>Tests and certificates</h2></div></section>
    <div class="template-grid two-col">${testCards}${certCards}</div>`;
  return adminShell('Templates', 'Create a reliable baseline once, then reuse it across class groups and modules.', content, 'templates');
}

function adminTemplateEditor(id) {
  const data = state();
  const template = byId(data.templates.evaluations, id);
  if (!template) return adminShell('Template not found', 'Return to the template library.', emptyState('Template unavailable', 'This template may have been removed.', routeLink('admin/templates', 'Back to templates', 'btn primary')), 'templates');
  const locked = [
    ['Learning', STANDARD_QUESTIONS.learning],
    ['Presenter', STANDARD_QUESTIONS.presenter],
    ['Environment', STANDARD_QUESTIONS.environment],
    ['Administration', STANDARD_QUESTIONS.administration]
  ];
  const content = `
    <form id="template-form" data-id="${template.id}">
      <section class="editor-card template-editor-head">
        <label>Template name<input name="name" value="${escapeHtml(template.name)}" required></label>
        <div><span class="status ${template.status}">${escapeHtml(template.status)}</span><p>Version ${template.version}</p></div>
      </section>
      <section class="locked-banner"><div><strong>Standard wording is locked</strong><p>These questions remain verbatim across every generated evaluation.</p></div><span>${locked.reduce((total, [, questions]) => total + questions.length, 0)} standard questions</span></section>
      <div class="locked-grid">${locked.map(([name, questions]) => `<details class="locked-section"><summary><span>${escapeHtml(name)}</span><strong>${questions.length} questions</strong></summary><ol>${questions.map((question) => `<li>${escapeHtml(question.text)}</li>`).join('')}</ol></details>`).join('')}</div>
      <section class="dynamic-slots"><p class="eyebrow">Activity-specific slots</p><h2>Added when an activity is created</h2><div class="slot-grid"><span>Course and module</span><span>4+ objectives</span><span>Any number of presenters</span><span>Dates, location, and credits</span></div></section>
      <div class="sticky-actions">${routeLink('admin/templates', 'Back', 'btn ghost')}<button type="submit" class="btn primary">Save new version</button></div>
    </form>`;
  return adminShell('Evaluation template', 'Inspect the reusable standard and edit template-level details.', content, 'templates');
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
    <header class="learner-header"><div><img src="assets/logo.png?v=2" alt="Lifespan Learning Institute"><span>${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)} activity</span></div>${preview ? routeLink('admin/activities', 'Exit preview', 'btn light small') : ''}</header>
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
  return `<header class="learner-header"><div><img src="assets/logo.png?v=2" alt="Lifespan Learning Institute"><span>Continuing education</span></div>${preview ? routeLink('admin/activities', 'Exit preview', 'btn light small') : ''}</header>${preview ? '<div class="preview-banner"><strong>Admin learner preview</strong><span>This draft can be reviewed without publishing.</span></div>' : ''}<main class="learner-main" id="main">${content}</main>`;
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

function objectiveMcqFallback(objective, index) {
  const correctAnswers = [
    'Track breath, posture, and muscle tone as possible cues of hopelessness or despair.',
    'Notice how bodily states can maintain depression and shape clinical work.',
    'Use body-oriented interventions when talk alone is not enough.',
    'Practice three sensorimotor interventions for suicidality-related affect.',
    'Use mindfulness to support present-moment awareness alongside talk therapy.',
    'Name secure, avoidant, ambivalent, and disorganized attachment patterns.',
    'Link attachment history to current relationship and clinical presentation.',
    'Assess adult clients with an attachment-informed lens.',
    'Choose attachment-informed interventions when building a treatment plan.',
    'Identify early signs of autonomic dysregulation in trauma work.',
    'Stabilize and resource before deeper trauma processing.',
    'Differentiate top-down cognitive work from bottom-up body-based work.',
    'Build a phased trauma-informed plan with clear safety steps.'
  ];
  const correct = correctAnswers[index % correctAnswers.length];
  const distractors = [
    'Ignore body cues and focus only on paperwork.',
    'Increase activation as quickly as possible in every session.',
    'Skip consent and move straight to trauma processing.'
  ];
  return {
    prompt: `Learning goal: ${objective}`,
    options: [correct, ...distractors],
    correctIndex: 0
  };
}

function objectiveMcqQuestion(name, objective, index, context, draftValue = '') {
  const fromTest = (context.testTemplate?.questions || [])
    .filter((question) => Number(question.objectiveIndex) === index);
  const source = fromTest[0]
    ? {
      prompt: fromTest[0].text,
      options: fromTest[0].options,
      correctIndex: Number(fromTest[0].correct)
    }
    : objectiveMcqFallback(objective, index);
  const values = source.options.map((_, optionIndex) => (
    optionIndex === source.correctIndex ? '5' : String(Math.max(1, optionIndex))
  ));
  const selected = draftValue === '' || draftValue == null ? '5' : String(draftValue);
  const correctText = source.options[source.correctIndex];
  return `
    <fieldset class="question mcq-question">
      <legend>${escapeHtml(source.prompt)}</legend>
      <p class="goal-ref">Linked learning goal: ${escapeHtml(objective)}</p>
      <div class="answer-hint"><span>Correct answer</span><strong>${escapeHtml(correctText)}</strong></div>
      ${source.options.map((option, optionIndex) => `
        <label class="test-choice ${optionIndex === source.correctIndex ? 'is-correct' : ''}">
          <input type="radio" name="${escapeHtml(name)}" value="${values[optionIndex]}" ${selected === values[optionIndex] ? 'checked' : ''} required>
          <span>${escapeHtml(option)}</span>
        </label>`).join('')}
    </fieldset>`;
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
  const presenterQuestions = context.cohort.presenters.flatMap((presenter, presenterIndex) => [
    `<div class="presenter-heading"><span>${presenterIndex + 1}</span><div><h2>${escapeHtml(presenter)}</h2><p>Rate this presenter using the standard questions.</p></div></div>`,
    ...STANDARD_QUESTIONS.presenter.map((question) => ratingQuestion(`presenter.${presenterIndex}.${question.id}`, question, draft.ratings?.[`presenter.${presenterIndex}.${question.id}`]))
  ]);
  return [
    {
      title: 'Learning',
      subtitle: 'Tell us how effectively this activity supported your learning.',
      body: STANDARD_QUESTIONS.learning.map((question) => ratingQuestion(`learning.${question.id}`, question, draft.ratings?.[`learning.${question.id}`])).join('')
    },
    {
      title: 'Learning goals',
      subtitle: 'Answer each question. Correct answers are shown and already selected.',
      kind: 'mcq',
      body: context.publication.objectives.map((objective, index) => (
        objectiveMcqQuestion(`objective.${index}`, objective, index, context, draft.ratings?.[`objective.${index}`])
      )).join('')
    },
    {
      title: 'Presenters',
      subtitle: 'Each presenter receives the same rating questions.',
      body: presenterQuestions.join('')
    },
    {
      title: 'Environment',
      subtitle: 'Rate the learning environment and technical support.',
      body: STANDARD_QUESTIONS.environment.map((question) => ratingQuestion(`environment.${question.id}`, question, draft.ratings?.[`environment.${question.id}`])).join('')
    },
    {
      title: 'Administration',
      subtitle: 'Rate program administration and disclosures.',
      body: STANDARD_QUESTIONS.administration.map((question) => ratingQuestion(`administration.${question.id}`, question, draft.ratings?.[`administration.${question.id}`])).join('')
    },
    {
      title: 'Your information',
      subtitle: 'Your details are filled in. Click continue when you are ready.',
      body: `<div class="feedback-grid">${STANDARD_QUESTIONS.written.map((question) => `<label>${escapeHtml(question.text)}<textarea name="comment.${question.id}" placeholder="Optional">${escapeHtml(draft.comments?.[question.id] || '')}</textarea></label>`).join('')}</div><div class="subsection-title">Certificate information</div><div class="form-grid two"><label>First name<input name="firstName" value="${escapeHtml(learnerDefaults.firstName)}" required></label><label>Last name<input name="lastName" value="${escapeHtml(learnerDefaults.lastName)}" required></label><label>Credential<input name="credential" value="${escapeHtml(learnerDefaults.credential)}" placeholder="LCSW, PhD, LMFT"></label><label>Email address<input type="email" name="email" value="${escapeHtml(learnerDefaults.email)}" required></label><label class="span-two">Professional license number<input name="license" value="${escapeHtml(learnerDefaults.license)}" required></label></div>`
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
  const help = page.kind === 'mcq'
    ? '<p class="rating-help">Choose the best answer for each question. Correct answers are pre-selected so you can continue.</p>'
    : currentIndex < pages.length - 1
      ? '<p class="rating-help"><span aria-hidden="true">★</span> Ratings are pre-selected. Change any star you like, then continue.</p>'
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
  const correctIndex = Number(question.correct);
  const correctText = question.options[correctIndex] || '';
  const selected = answers[question.id] ?? String(correctIndex);
  const isLast = qIndex === template.questions.length - 1;
  const last = progress.attempts.at(-1);
  const hiddenAnswers = Object.entries(answers)
    .filter(([qId]) => qId !== question.id)
    .map(([qId, value]) => `<input type="hidden" name="${escapeHtml(qId)}" value="${escapeHtml(value)}">`)
    .join('');
  const content = `${last ? `<div class="result-banner fail"><strong>${last.percent}% — not yet passed</strong><span>${progress.attemptsRemaining} attempt${progress.attemptsRemaining === 1 ? '' : 's'} remaining.</span></div>` : ''}<form id="test-form" data-id="${context.publication.id}" data-preview="${preview}" data-question="${qIndex}"><section class="evaluation-card test-single"><div class="evaluation-heading"><p class="eyebrow">Question ${qIndex + 1} of ${template.questions.length} · Attempt ${progress.attempts.length + 1}</p><h2>Knowledge check</h2><p>The correct answer is shown and selected. Click continue to move on.</p></div><div class="answer-hint"><span>Correct answer</span><strong>${escapeHtml(correctText)}</strong></div>${hiddenAnswers}<fieldset class="test-question single-question"><legend>${escapeHtml(question.text)}</legend>${question.options.map((option, optionIndex) => `<label class="test-choice ${optionIndex === correctIndex ? 'is-correct' : ''}"><input type="radio" name="${question.id}" value="${optionIndex}" ${String(selected) === String(optionIndex) ? 'checked' : ''} required><span>${escapeHtml(option)}</span></label>`).join('')}</fieldset><div class="form-navigation"><a class="btn ghost" href="${learnerHref(context, '', preview)}">Save for later</a>${isLast ? '<button class="btn primary" type="submit">Submit answers</button>' : `<button type="button" class="btn primary" data-action="test-next">Continue</button>`}</div></section></form>`;
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
          objectives: [...context.publication.objectives]
        },
        templateId: context.publication.certificateTemplateId
      }
      : store.issueCertificate(context.publication.id, learner);
    if (preview) session.certificate = certificate;
  }
  const content = `<section class="certificate-view"><div class="completion-banner success-large"><span>Congratulations</span><strong>Your certificate is ready</strong><p>${escapeHtml(context.course.name)} · ${context.module.creditHours} credit hours</p></div><div class="certificate-frame"><canvas id="certificate-canvas" width="1666" height="1162" aria-label="Certificate for ${escapeHtml(certificate.learner.firstName)} ${escapeHtml(certificate.learner.lastName)}"></canvas></div><div class="certificate-actions oversized"><button class="btn primary" data-action="download-certificate" data-id="${certificate.id}">Download certificate</button><button class="btn secondary" data-action="print-certificate">Print certificate</button></div><dl class="certificate-details minimal"><div><dt>Certificate number</dt><dd>${escapeHtml(certificate.number)}</dd></div><div><dt>Issued</dt><dd>${new Date(certificate.issuedAt).toLocaleDateString()}</dd></div></dl></section>`;
  const html = learnerBase(context, content, { preview, label: 'Certificate', hideCourse: true });
  setTimeout(async () => {
    const canvas = document.querySelector('#certificate-canvas');
    const template = byId(state().templates.certificates, certificate.templateId);
    try {
      certificateReady = await renderCertificate(canvas, certificate, template);
    } catch {
      toast('Certificate artwork could not be rendered.', 'error');
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

function renderLearner(parts) {
  const { context, preview, offset } = findLearnerContext(parts);
  if (!context) {
    document.body.className = 'learner-page';
    return `<main class="learner-main">${emptyState('Activity not available', 'This link is invalid, unpublished, or no longer available.', routeLink('admin/dashboard', 'Open admin demo', 'btn primary'))}</main>`;
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
    submitActivityForm(form);
    return;
  }
  if (form.id === 'template-form') {
    store.renameEvaluationTemplate(form.dataset.id, new FormData(form).get('name'));
    toast('Template saved as a new version.');
    render();
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
    const canvas = document.querySelector('#certificate-canvas');
    if (!certificateReady || !canvas) {
      toast('Certificate is still rendering.', 'error');
      return;
    }
    downloadCertificatePdf(canvas, `${certificate.number}.pdf`);
    toast('Certificate downloaded.');
  }
});

window.addEventListener('hashchange', render);
render();
