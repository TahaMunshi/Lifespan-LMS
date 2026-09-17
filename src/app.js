import { STANDARD_QUESTIONS } from './seed.js';
import { store } from './store.js';
import {
  ACTIVITY_TYPES,
  activityContext,
  byId,
  formatDate,
  isExpired,
  learnerProgress,
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
    ['dashboard', 'Overview', 'Dashboard'],
    ['activities', 'Activities', 'Activities'],
    ['templates', 'Templates', 'Templates'],
    ['reports', 'Reports', 'Reports'],
    ['certificates', 'Certificates', 'Certificates']
  ];
  document.body.className = 'admin-page';
  return `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand"><img src="assets/logo.png?v=2" alt="Lifespan Learning Institute"></div>
        <nav aria-label="Administrator navigation">
          ${navigation.map(([id, label, text]) => `
            <a href="#/admin/${id}" class="${active === id ? 'active' : ''}">
              <span class="nav-monogram" aria-hidden="true">${label.slice(0, 1)}</span>
              <span>${text}</span>
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
    ['Reusable templates', data.templates.evaluations.length + data.templates.tests.length + data.templates.certificates.length, 'Evaluation, test, certificate'],
    ['Evaluation responses', responses, 'Across all activity versions'],
    ['Certificates issued', data.certificates.length, 'Eligibility verified']
  ];
  const recent = data.publications.slice(0, 3).map((publication) => {
    const context = activityContext(data, publication);
    return `
      <article class="activity-row">
        <div>${statusBadge(publication.status)}<h3>${escapeHtml(context.course?.name)}</h3><p>${escapeHtml(context.cohort?.name)} · ${escapeHtml(context.module?.name)}</p></div>
        <div class="row-actions">${routeLink(`admin/activity/${publication.id}/edit`, 'Edit', 'btn secondary small')}${routeLink(`preview/${publication.id}`, 'Preview', 'btn ghost small')}</div>
      </article>`;
  }).join('');
  const content = `
    <section class="welcome-panel">
      <div><p class="eyebrow">Reusable workflow</p><h2>Build once. Adapt and publish in minutes.</h2><p>Standard evaluation sections stay consistent while objectives, presenters, cohorts, tests, and certificates remain activity-specific.</p></div>
      ${routeLink('admin/activity/new/edit', 'Create activity', 'btn primary')}
    </section>
    <section class="metric-grid">${stats.map(([label, value, note]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></article>`).join('')}</section>
    <div class="content-grid">
      <section class="content-card"><div class="section-heading"><div><h2>Recent activities</h2><p>Continue editing or preview the learner experience.</p></div>${routeLink('admin/activities', 'View all', 'text-action')}</div>${recent}</section>
      <aside class="content-card quick-start"><h2>Recommended workflow</h2>
        <ol><li><strong>Duplicate</strong><span>Start from a proven activity or template.</span></li><li><strong>Customize</strong><span>Update the cohort, objectives, presenters, and dates.</span></li><li><strong>Preview</strong><span>Verify learner steps and certificate data.</span></li><li><strong>Publish</strong><span>Copy one stable public link.</span></li></ol>
      </aside>
    </div>`;
  return adminShell('Dashboard', 'A clear view of activities, templates, responses, and certificates.', content, 'dashboard', routeLink('admin/activity/new/edit', 'New activity', 'btn primary'));
}

function adminActivities() {
  const data = state();
  const rows = data.publications.map((publication) => {
    const context = activityContext(data, publication);
    const responseCount = data.submissions.filter((item) => item.publicationId === publication.id).length;
    const publicUrl = `${location.origin}${location.pathname}#/learn/${publication.slug}`;
    return `
      <article class="activity-card">
        <div class="activity-card-main">
          <div class="activity-topline">${statusBadge(publication.status)}<span class="type-chip">${escapeHtml(ACTIVITY_TYPES[publication.activityType]?.label)}</span><span>Revision ${publication.revision}</span></div>
          <h2>${escapeHtml(context.course?.name)}</h2>
          <p>${escapeHtml(context.version?.name)} · ${escapeHtml(context.cohort?.name)} · ${escapeHtml(context.module?.name)}</p>
          <div class="activity-meta"><span>Deadline <strong>${formatDate(publication.deadline)}</strong></span><span>Objectives <strong>${publication.objectives.length}</strong></span><span>Responses <strong>${responseCount}</strong></span></div>
          ${publication.status === 'published' ? `<div class="published-link"><span>${escapeHtml(publicUrl)}</span><button data-action="copy-link" data-value="${escapeHtml(publicUrl)}">Copy</button></div>` : ''}
        </div>
        <div class="activity-card-actions">
          ${routeLink(`admin/activity/${publication.id}/edit`, 'Edit', 'btn secondary')}
          ${routeLink(`preview/${publication.id}`, 'Preview as learner', 'btn ghost')}
          <button class="btn ghost" data-action="duplicate-publication" data-id="${publication.id}">Duplicate</button>
          <button class="btn ${publication.status === 'published' ? 'danger-ghost' : 'primary'}" data-action="toggle-publish" data-id="${publication.id}">${publication.status === 'published' ? 'Unpublish' : 'Publish'}</button>
        </div>
      </article>`;
  }).join('');
  return adminShell(
    'Activities',
    'Reuse existing configurations or publish a new learner experience.',
    `<div class="filter-bar"><div><strong>${data.publications.length} activities</strong><span>${data.publications.filter((item) => item.status === 'draft').length} drafts need review</span></div>${routeLink('admin/activity/new/edit', 'Create from template', 'btn primary')}</div><section class="activity-list">${rows}</section>`,
    'activities',
    routeLink('admin/activity/new/edit', 'New activity', 'btn primary')
  );
}

function adminActivityEditor(id) {
  const data = state();
  const existing = data.publications.find((item) => item.id === id);
  const publication = existing || {
    id: '',
    slug: '',
    status: 'draft',
    courseId: data.courses[0].id,
    versionId: data.versions[0].id,
    cohortId: data.cohorts[0].id,
    moduleId: data.modules[0].id,
    evaluationTemplateId: data.templates.evaluations[0].id,
    testTemplateId: null,
    certificateTemplateId: 'cert-live-v1',
    activityType: 'live',
    deadline: '2027-12-31',
    objectives: ['', '', '', '']
  };
  const resolved = activityContext(data, publication);
  const content = `
    <form id="activity-form" class="editor-layout" data-id="${escapeHtml(publication.id)}">
      <div class="editor-main">
        <section class="editor-card">
          <div class="wizard-step"><span>1</span><div><h2>Activity structure</h2><p>Connect the activity to the correct course, version, cohort, and module.</p></div></div>
          <div class="form-grid two">
            <label>Course<select name="courseId">${selectOptions(data.courses, publication.courseId, (item) => item.name)}</select></label>
            <label>Version<select name="versionId">${selectOptions(data.versions, publication.versionId, (item) => `${byId(data.courses, item.courseId)?.name} — ${item.name}`)}</select></label>
            <label>Cohort<select name="cohortId">${selectOptions(data.cohorts, publication.cohortId, (item) => `${item.name} — ${item.location}`)}</select></label>
            <label>Module<select name="moduleId">${selectOptions(data.modules, publication.moduleId, (item) => `${item.name} — ${item.creditHours} CE` )}</select></label>
            <label>Activity location<input name="location" value="${escapeHtml(resolved?.cohort?.location || '')}" required></label>
            <label>CE credit hours<input type="number" min="0.25" step="0.25" name="creditHours" value="${escapeHtml(resolved?.module?.creditHours || '')}" required></label>
            <label>Activity start date<input type="date" name="startDate" value="${escapeHtml(resolved?.module?.startDate || '')}" required></label>
            <label>Activity end date<input type="date" name="endDate" value="${escapeHtml(resolved?.module?.endDate || '')}" required></label>
            <label class="span-two">Presenters (one per line)<textarea name="presenters" rows="4" required>${escapeHtml((resolved?.cohort?.presenters || []).join('\n'))}</textarea></label>
          </div>
        </section>
        <section class="editor-card">
          <div class="wizard-step"><span>2</span><div><h2>Workflow and deadline</h2><p>The activity type determines whether a scored test is required.</p></div></div>
          <div class="form-grid two">
            <label>Activity type<select name="activityType">${Object.entries(ACTIVITY_TYPES).map(([value, item]) => `<option value="${value}" ${value === publication.activityType ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
            <label>Completion deadline<input type="date" name="deadline" value="${escapeHtml(publication.deadline)}" required></label>
            <label>Evaluation template<select name="evaluationTemplateId">${selectOptions(data.templates.evaluations, publication.evaluationTemplateId, (item) => `${item.name} · v${item.version}`)}</select></label>
            <label>Test template<select name="testTemplateId"><option value="">Not required for Live</option>${selectOptions(data.templates.tests, publication.testTemplateId, (item) => `${item.name} · ${item.passPercent}% pass`)}</select></label>
            <label>Certificate template<select name="certificateTemplateId">${selectOptions(data.templates.certificates, publication.certificateTemplateId, (item) => item.name)}</select></label>
            <label>Public link slug<input name="slug" value="${escapeHtml(publication.slug)}" placeholder="generated-from-course-name"></label>
          </div>
        </section>
        <section class="editor-card">
          <div class="wizard-step"><span>3</span><div><h2>Learning objectives</h2><p>Enter one objective per line. At least four are required.</p></div></div>
          <label>Objectives<textarea name="objectives" rows="9" required>${escapeHtml(publication.objectives.join('\n'))}</textarea></label>
        </section>
      </div>
      <aside class="editor-aside">
        <section class="summary-card">
          <p class="eyebrow">Before publishing</p><h2>Review checklist</h2>
          <ul class="check-list"><li>Course hierarchy assigned</li><li>At least four objectives</li><li>Presenters come from cohort</li><li>Test added for Home Study/Hybrid</li><li>Certificate template selected</li><li>Deadline confirmed</li></ul>
          <button class="btn primary full" type="submit">Save activity</button>
          ${existing ? routeLink(`preview/${existing.id}`, 'Preview as learner', 'btn ghost full') : ''}
          ${routeLink('admin/activities', 'Cancel', 'text-action center-link')}
        </section>
      </aside>
    </form>`;
  return adminShell(existing ? 'Edit activity' : 'Create activity', existing ? 'Changes create a new activity revision without altering historical responses.' : 'Start with reusable templates and add only activity-specific information.', content, 'activities');
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
  return adminShell('Templates', 'Create a reliable baseline once, then reuse it across cohorts and modules.', content, 'templates');
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
      <div><button class="btn secondary" data-action="export-csv" data-id="${selected}">Export CSV</button><button class="btn ghost" data-action="print-report">Print summary</button></div>
    </section>
    <section class="report-filters">
      <label>Version<select class="report-jump-filter" data-field="versionId">${selectOptions(data.versions, context?.version?.id, (item) => item.name)}</select></label>
      <label>Cohort<select class="report-jump-filter" data-field="cohortId">${selectOptions(data.cohorts, context?.cohort?.id, (item) => item.name)}</select></label>
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
  return adminShell('Evaluation reports', 'Review aggregate outcomes by activity, cohort, and module.', content, 'reports');
}

function adminCertificates() {
  const data = state();
  const issued = data.certificates.map((certificate) => `
    <article class="certificate-record"><div><span class="status published">Issued</span><h3>${escapeHtml([certificate.learner.firstName, certificate.learner.lastName].filter(Boolean).join(' '))}</h3><p>${escapeHtml(certificate.snapshot.courseName)} · ${escapeHtml(certificate.snapshot.moduleName)}</p></div><div><strong>${escapeHtml(certificate.number)}</strong><small>${new Date(certificate.issuedAt).toLocaleDateString()}</small>${routeLink(`learn/${byId(data.publications, certificate.publicationId)?.slug}/certificate`, 'View', 'text-action')}</div></article>`).join('');
  const templateCards = data.templates.certificates.map((template) => `<article class="mini-template"><img src="${template.asset}" alt=""><div><strong>${escapeHtml(template.name)}</strong><span>${template.activityTypes.map((type) => ACTIVITY_TYPES[type].label).join(', ')}</span></div></article>`).join('');
  const content = `
    <section class="content-grid certificates-layout"><div class="content-card"><div class="section-heading"><div><h2>Issued certificates</h2><p>Generated only after the configured completion rules are met.</p></div></div>${issued || emptyState('No certificates issued yet', 'Complete a learner flow to create the first certificate.')}</div><aside class="content-card"><h2>Certificate templates</h2><div class="mini-template-list">${templateCards}</div></aside></section>`;
  return adminShell('Certificates', 'Review issued records and activity-specific certificate templates.', content, 'certificates');
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
      ${options.hideCourse ? '' : `<section class="learner-course"><p class="eyebrow">${escapeHtml(cohort?.name)} · ${escapeHtml(module?.name)}</p><h1>${escapeHtml(course?.name)}</h1><div><span>${module?.creditHours} CE Hours</span><span>${escapeHtml(cohort?.location)}</span><span>Due ${formatDate(publication.deadline)}</span></div></section>`}
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
  const steps = ACTIVITY_TYPES[publication.activityType].requiresTest
    ? [['Evaluation', 'Share required feedback'], ['Knowledge check', 'Pass 12 questions at 80%'], ['Certificate', 'Available after both steps']]
    : [['Evaluation', 'Share required feedback'], ['Attendance details', 'Confirm certificate information'], ['Certificate', 'Available after both steps']];
  const action = expired && !preview
    ? '<button class="btn primary" disabled>Completion window closed</button>'
    : progress.eligible
      ? routeLink(`${preview ? `preview/${publication.id}` : `learn/${publication.slug}`}/certificate`, 'View certificate', 'btn primary')
      : `<a class="btn primary" href="${learnerHref(context, 'evaluation/0', preview)}">${progress.submission ? (progress.requiresTest ? 'Continue to test' : 'Confirm attendance') : 'Start evaluation'}</a>`;
  const content = `
    <section class="learner-hero">
      <div><span class="type-chip">${escapeHtml(ACTIVITY_TYPES[publication.activityType].label)}</span><h1>${escapeHtml(course.name)}</h1><p>${escapeHtml(module.name)} · ${module.creditHours} continuing education hours</p></div>
      <div class="deadline-card ${expired ? 'expired' : ''}"><span>Completion deadline</span><strong>${formatDate(publication.deadline)}</strong><small>${expired ? 'This activity is closed.' : 'Your work saves on this device.'}</small></div>
    </section>
    <section class="learner-overview-grid">
      <article class="content-card"><h2>Your completion path</h2><div class="path-steps">${steps.map(([title, text], index) => `<div><i>${index + 1}</i><span><strong>${title}</strong><small>${text}</small></span></div>`).join('')}</div>${action}</article>
      <aside class="content-card activity-details"><h2>Activity details</h2><dl><div><dt>Version</dt><dd>${escapeHtml(context.version.name)}</dd></div><div><dt>Cohort</dt><dd>${escapeHtml(cohort.name)}</dd></div><div><dt>Module</dt><dd>${escapeHtml(module.name)}</dd></div><div><dt>Presenters</dt><dd>${escapeHtml(cohort.presenters.join(', '))}</dd></div><div><dt>Location</dt><dd>${escapeHtml(cohort.location)}</dd></div></dl></aside>
    </section>`;
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
  return `<fieldset class="question rating-question"><legend>${escapeHtml(text)}</legend><div class="star-scale">${scale.map(([number, label]) => `<label class="star-choice"><input type="radio" name="${escapeHtml(name)}" value="${number}" ${String(value) === number ? 'checked' : ''} required><span class="rating-label"><strong>${number}</strong>${escapeHtml(label)}</span><span class="star" aria-hidden="true">★</span></label>`).join('')}</div></fieldset>`;
}

function evaluationPages(context, draft) {
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
      title: 'Learning objectives',
      subtitle: 'Rate your ability to meet each activity-specific objective.',
      body: context.publication.objectives.map((objective, index) => ratingQuestion(`objective.${index}`, objective, draft.ratings?.[`objective.${index}`])).join('')
    },
    {
      title: 'Presenters',
      subtitle: 'Each presenter receives the same standardized rating questions.',
      body: presenterQuestions.join('')
    },
    {
      title: 'Environment and administration',
      subtitle: 'Rate the learning environment and program administration.',
      body: `<div class="subsection-title">Environment</div>${STANDARD_QUESTIONS.environment.map((question) => ratingQuestion(`environment.${question.id}`, question, draft.ratings?.[`environment.${question.id}`])).join('')}<div class="subsection-title">Administration</div>${STANDARD_QUESTIONS.administration.map((question) => ratingQuestion(`administration.${question.id}`, question, draft.ratings?.[`administration.${question.id}`])).join('')}`
    },
    {
      title: 'Feedback and certificate details',
      subtitle: 'Written comments are optional. Certificate identity fields are required.',
      body: `<div class="feedback-grid">${STANDARD_QUESTIONS.written.map((question) => `<label>${escapeHtml(question.text)}<textarea name="comment.${question.id}" placeholder="Enter your response (optional)">${escapeHtml(draft.comments?.[question.id] || '')}</textarea></label>`).join('')}</div><div class="subsection-title">Certificate information</div><div class="form-grid two"><label>First name<input name="firstName" value="${escapeHtml(draft.learner?.firstName || '')}" required></label><label>Last name<input name="lastName" value="${escapeHtml(draft.learner?.lastName || '')}" required></label><label>Credential<input name="credential" value="${escapeHtml(draft.learner?.credential || '')}" placeholder="LCSW, PhD, LMFT"></label><label>Email address<input type="email" name="email" value="${escapeHtml(draft.learner?.email || '')}" required></label><label class="span-two">Professional license number<input name="license" value="${escapeHtml(draft.learner?.license || '')}" required></label></div>`
    }
  ];
}

function learnerEvaluation(context, pageIndex, preview = false) {
  const draft = preview
    ? previewSession(context.publication.id).draft
    : (state().drafts[context.publication.id] || { ratings: {}, comments: {}, learner: {} });
  const pages = evaluationPages(context, draft);
  const page = pages[Math.min(Math.max(Number(pageIndex) || 0, 0), pages.length - 1)];
  const base = preview ? `preview/${context.publication.id}` : `learn/${context.publication.slug}`;
  const progress = `<div class="eval-progress"><div><span>Evaluation progress</span><strong>${Number(pageIndex) + 1} of ${pages.length}</strong></div><i><b style="width:${((Number(pageIndex) + 1) / pages.length) * 100}%"></b></i></div>`;
  const content = `${progress}<form id="learner-evaluation" data-id="${context.publication.id}" data-page="${pageIndex}" data-preview="${preview}"><section class="evaluation-card"><div class="evaluation-heading"><p class="eyebrow">Step ${Number(pageIndex) + 1}</p><h2>${escapeHtml(page.title)}</h2><p>${escapeHtml(page.subtitle)}</p></div><p class="rating-help"><span aria-hidden="true">★</span>Select one response for each statement.</p>${page.body}</section><div class="form-navigation">${Number(pageIndex) > 0 ? routeLink(`${base}/evaluation/${Number(pageIndex) - 1}`, 'Previous', 'btn ghost') : routeLink(base, 'Back', 'btn ghost')}<button class="btn primary" type="submit">${Number(pageIndex) === pages.length - 1 ? 'Submit evaluation' : 'Save and continue'}</button></div></form>`;
  return learnerBase(context, content, { preview, label: 'Evaluation' });
}

function learnerAttendance(context, preview = false) {
  const progress = progressFor(context, preview);
  if (!progress.submission) return learnerLanding(context, preview);
  const learner = progress.submission.learner || {};
  const content = `<form id="attendance-form" data-id="${context.publication.id}" data-preview="${preview}"><section class="evaluation-card narrow-card"><div class="evaluation-heading"><p class="eyebrow">Live attendance verification</p><h2>Confirm your certificate details</h2><p>This unscored step preserves the certificate-information check used for Live activities.</p></div><div class="form-grid two"><label>Full name<input value="${escapeHtml(`${learner.firstName || ''} ${learner.lastName || ''}`.trim())}" disabled></label><label>Professional license<input value="${escapeHtml(learner.license || '')}" disabled></label></div><label class="confirmation"><input type="checkbox" name="confirm" required><span>I confirm that I attended this activity and the information above is accurate.</span></label><button class="btn primary full" type="submit">Confirm and generate certificate</button></section></form>`;
  return learnerBase(context, content, { preview, label: 'Attendance verification' });
}

function learnerTest(context, preview = false) {
  const progress = progressFor(context, preview);
  if (!progress.submission) return learnerLanding(context, preview);
  if (progress.eligible) return learnerCertificate(context, preview);
  const template = context.testTemplate;
  if (!template || progress.attemptsRemaining <= 0) {
    const content = emptyState('Attempt limit reached', 'You have used all three attempts. The certificate remains locked. Contact the program administrator for help.', routeLink(learnerHref(context, '', preview).slice(2), 'Activity overview', 'btn ghost'));
    return learnerBase(context, content, { preview, label: 'Knowledge check' });
  }
  const last = progress.attempts.at(-1);
  const content = `${last ? `<div class="result-banner fail"><strong>${last.percent}% — not yet passed</strong><span>${progress.attemptsRemaining} attempt${progress.attemptsRemaining === 1 ? '' : 's'} remaining. Review your responses and try again.</span></div>` : ''}<form id="test-form" data-id="${context.publication.id}" data-preview="${preview}"><section class="evaluation-card"><div class="evaluation-heading"><p class="eyebrow">Knowledge check · Attempt ${progress.attempts.length + 1} of ${template.maxAttempts}</p><h2>Score 80% or higher</h2><p>Answer all ${template.questions.length} questions. Results are recorded after each attempt.</p></div><div class="test-list">${template.questions.map((question, index) => `<fieldset class="test-question"><legend><span>${index + 1}</span>${escapeHtml(question.text)}</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="${question.id}" value="${optionIndex}" required><span>${escapeHtml(option)}</span></label>`).join('')}</fieldset>`).join('')}</div><div class="form-navigation"><a class="btn ghost" href="${learnerHref(context, '', preview)}">Save for later</a><button class="btn primary" type="submit">Submit attempt</button></div></section></form>`;
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
  const content = `<section class="certificate-view"><div class="completion-banner"><span>Requirements complete</span><strong>Your certificate is ready</strong><p>${escapeHtml(context.course.name)} · ${context.module.creditHours} CE Hours · ${escapeHtml(certificate.number)}</p></div><div class="certificate-frame"><canvas id="certificate-canvas" width="1666" height="1162" aria-label="Certificate for ${escapeHtml(certificate.learner.firstName)} ${escapeHtml(certificate.learner.lastName)}"></canvas></div><div class="certificate-actions"><button class="btn primary" data-action="download-certificate" data-id="${certificate.id}">Download certificate</button><button class="btn ghost" data-action="print-certificate">Print</button><a class="btn ghost" href="${learnerHref(context, '', preview)}">Activity overview</a></div><dl class="certificate-details"><div><dt>Learner</dt><dd>${escapeHtml([certificate.learner.firstName, certificate.learner.lastName, certificate.learner.credential].filter(Boolean).join(' '))}</dd></div><div><dt>Module</dt><dd>${escapeHtml(certificate.snapshot.moduleName)}</dd></div><div><dt>Presenters</dt><dd>${escapeHtml(certificate.snapshot.presenters.join(', '))}</dd></div><div><dt>Location</dt><dd>${escapeHtml(certificate.snapshot.location)}</dd></div><div><dt>Issued</dt><dd>${new Date(certificate.issuedAt).toLocaleDateString()}</dd></div></dl></section>`;
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
  if (screen === 'test') return learnerTest(context, preview);
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
  else if (screen === 'activity') app.innerHTML = adminActivityEditor(parts[2]);
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
  const activityType = data.get('activityType');
  const result = store.savePublication({
    id: form.dataset.id || undefined,
    courseId: data.get('courseId'),
    versionId: data.get('versionId'),
    cohortId: data.get('cohortId'),
    moduleId: data.get('moduleId'),
    activityType,
    deadline: data.get('deadline'),
    location: data.get('location').trim(),
    creditHours: Number(data.get('creditHours')),
    startDate: data.get('startDate'),
    endDate: data.get('endDate'),
    presenters: String(data.get('presenters')).split('\n').map((item) => item.trim()).filter(Boolean),
    evaluationTemplateId: data.get('evaluationTemplateId'),
    testTemplateId: ACTIVITY_TYPES[activityType].requiresTest ? (data.get('testTemplateId') || state().templates.tests[0].id) : null,
    certificateTemplateId: ACTIVITY_TYPES[activityType].certificateTemplate,
    slug: data.get('slug'),
    objectives: String(data.get('objectives')).split('\n').map((item) => item.trim()).filter(Boolean),
    status: form.dataset.id ? byId(state().publications, form.dataset.id)?.status : 'draft'
  });
  if (!result.ok) {
    toast(result.errors.join(' '), 'error');
    return;
  }
  toast('Activity saved as a new revision.');
  location.hash = `#/admin/activity/${result.publication.id}/edit`;
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
    if (preview) previewSession(form.dataset.id).draft = draft;
    else store.saveDraft(form.dataset.id, draft);
    if (page < 4) {
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
    toast('Evaluation submitted.');
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
    const answers = Object.fromEntries(new FormData(form));
    const result = scoreTest(context.testTemplate, answers);
    const preview = form.dataset.preview === 'true';
    if (preview) previewSession(form.dataset.id).attempts.push({ ...result, answers });
    else store.recordAttempt(form.dataset.id, result, answers);
    if (result.passed) {
      const progress = progressFor(context, preview);
      if (!preview) store.issueCertificate(form.dataset.id, progress.submission.learner);
      toast(`Passed with ${result.percent}%. Certificate unlocked.`);
      location.hash = learnerHref(context, 'certificate', preview);
    } else {
      toast(`${result.percent}% — 80% is required.`, 'error');
      render();
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
  } else if (action === 'duplicate-publication') {
    const duplicate = store.duplicatePublication(id);
    toast('Activity duplicated as a draft.');
    location.hash = `#/admin/activity/${duplicate.id}/edit`;
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
