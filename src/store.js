import { cloneStandardSections, createSeedState } from './seed.js';
import {
  activityContext,
  makePublicationSnapshot,
  safeSlug,
  uid,
  validatePublication
} from './domain.js';

const STORAGE_KEY = 'lifespan-lms-prototype-v6';
let state = load();

function ensureEvaluationSections(template) {
  if (!template.sections) {
    template.sections = cloneStandardSections();
  }
  return template;
}

function migrate(saved) {
  if (!saved || typeof saved !== 'object') return null;
  saved.schemaVersion = 6;
  (saved.templates?.evaluations || []).forEach(ensureEvaluationSections);
  (saved.templates?.tests || []).forEach((template) => {
    if (!template.version) template.version = 1;
  });
  return saved;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.schemaVersion === 6) {
      (saved.templates?.evaluations || []).forEach(ensureEvaluationSections);
      return saved;
    }
    // Soft-migrate from v5
    const legacy = JSON.parse(localStorage.getItem('lifespan-lms-prototype-v5') || 'null');
    if (legacy) return migrate(legacy);
  } catch {
    // Fall through to a clean demo state.
  }
  return createSeedState();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uniqueSlug(candidate, ignoreId = null) {
  const base = safeSlug(candidate) || 'activity';
  let slug = base;
  let suffix = 2;
  while (state.publications.some((item) => item.id !== ignoreId && item.slug === slug)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

export const store = {
  getState() {
    return state;
  },

  reset() {
    state = createSeedState();
    persist();
  },

  savePublication(input) {
    const existing = state.publications.find((item) => item.id === input.id);
    const next = {
      ...(existing || {}),
      ...input,
      id: input.id || uid('pub'),
      slug: uniqueSlug(input.slug || input.name || 'activity', input.id),
      status: input.status || existing?.status || 'draft',
      revision: existing ? existing.revision + 1 : 1,
      createdAt: existing?.createdAt || new Date().toISOString(),
      publishedAt: existing?.publishedAt || null
    };
    const errors = validatePublication(state, next);
    if (errors.length) return { ok: false, errors };

    if (existing) {
      state.publications = state.publications.map((item) => item.id === next.id ? next : item);
    } else {
      state.publications.push(next);
    }
    persist();
    return { ok: true, publication: next };
  },

  duplicatePublication(publicationId) {
    const source = state.publications.find((item) => item.id === publicationId);
    if (!source) return null;
    const course = state.courses.find((item) => item.id === source.courseId);
    const duplicate = {
      ...structuredClone(source),
      id: uid('pub'),
      slug: uniqueSlug(`${source.slug}-copy`),
      status: 'draft',
      revision: 1,
      createdAt: new Date().toISOString(),
      publishedAt: null,
      duplicatedFrom: source.id
    };
    state.publications.push(duplicate);
    persist();
    return { ...duplicate, displayName: `${course?.name || 'Activity'} — Copy` };
  },

  createEvaluationTemplate(name = 'Activity Evaluation') {
    const template = {
      id: uid('eval'),
      name,
      version: 1,
      status: 'draft',
      dynamicSections: ['objectives', 'presenters', 'activity'],
      sections: cloneStandardSections()
    };
    state.templates.evaluations.push(template);
    persist();
    return template;
  },

  duplicateEvaluationTemplate(templateId, name) {
    const source = state.templates.evaluations.find((item) => item.id === templateId);
    if (!source) return null;
    ensureEvaluationSections(source);
    const duplicate = {
      ...structuredClone(source),
      id: uid('eval'),
      name: name || `${source.name} — Copy`,
      version: 1,
      status: 'draft',
      duplicatedFrom: source.id
    };
    state.templates.evaluations.push(duplicate);
    persist();
    return duplicate;
  },

  upsertActivityCatalog(input = {}) {
    const name = String(input.name || '').trim() || 'Untitled activity';
    const activityType = input.activityType || 'live';
    const location = String(input.location || '').trim() || 'TBD';
    const presenters = Array.isArray(input.presenters) ? input.presenters.filter(Boolean) : [];
    const creditHours = Number(input.creditHours) || 6;
    const startDate = input.startDate || '';
    const endDate = input.endDate || '';
    const typeLabel = activityType === 'home-study' ? 'Home Study' : activityType === 'hybrid' ? 'Hybrid' : 'Live';

    let course = state.courses.find((item) => item.id === input.courseId);
    if (!course) {
      course = { id: uid('course'), name };
      state.courses.push(course);
    } else {
      course.name = name;
    }

    let version = state.versions.find((item) => item.id === input.versionId);
    if (!version) {
      version = {
        id: uid('version'),
        courseId: course.id,
        name: typeLabel,
        activityType
      };
      state.versions.push(version);
    } else {
      version.courseId = course.id;
      version.name = typeLabel;
      version.activityType = activityType;
    }

    let cohort = state.cohorts.find((item) => item.id === input.cohortId);
    if (!cohort) {
      cohort = {
        id: uid('cohort'),
        versionId: version.id,
        name: startDate ? new Date(`${startDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Cohort',
        location,
        startDate,
        endDate,
        presenters: presenters.length ? presenters : ['Presenter']
      };
      state.cohorts.push(cohort);
    } else {
      cohort.versionId = version.id;
      cohort.location = location;
      cohort.startDate = startDate;
      cohort.endDate = endDate;
      cohort.presenters = presenters.length ? presenters : cohort.presenters;
      if (startDate) {
        cohort.name = new Date(`${startDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }

    let module = state.modules.find((item) => item.id === input.moduleId);
    if (!module) {
      module = {
        id: uid('module'),
        cohortId: cohort.id,
        name: typeLabel,
        creditHours,
        startDate,
        endDate
      };
      state.modules.push(module);
    } else {
      module.cohortId = cohort.id;
      module.name = typeLabel;
      module.creditHours = creditHours;
      module.startDate = startDate;
      module.endDate = endDate;
    }

    persist();
    return {
      courseId: course.id,
      versionId: version.id,
      cohortId: cohort.id,
      moduleId: module.id
    };
  },

  saveEvaluationTemplate(templateId, input) {
    const template = state.templates.evaluations.find((item) => item.id === templateId);
    if (!template) return { ok: false, errors: ['Evaluation template not found.'] };
    ensureEvaluationSections(template);
    if (input.name?.trim()) template.name = input.name.trim();
    if (input.sections) template.sections = input.sections;
    template.version = (template.version || 1) + 1;
    template.status = template.status || 'active';
    persist();
    return { ok: true, template };
  },

  renameEvaluationTemplate(templateId, name) {
    return this.saveEvaluationTemplate(templateId, { name }).ok;
  },

  saveTestTemplate(templateId, input) {
    const template = state.templates.tests.find((item) => item.id === templateId);
    if (!template) return { ok: false, errors: ['Test template not found.'] };
    if (input.name?.trim()) template.name = input.name.trim();
    if (input.passPercent != null) template.passPercent = Number(input.passPercent);
    if (input.maxAttempts != null) template.maxAttempts = Number(input.maxAttempts);
    if (Array.isArray(input.questions)) template.questions = input.questions;
    template.version = (template.version || 1) + 1;
    persist();
    return { ok: true, template };
  },

  createTestTemplate(name = 'New Knowledge Check') {
    const template = {
      id: uid('test'),
      name,
      version: 1,
      passPercent: 80,
      maxAttempts: 3,
      minimumQuestions: 12,
      questions: []
    };
    state.templates.tests.push(template);
    persist();
    return template;
  },

  duplicateTestTemplate(templateId) {
    const source = state.templates.tests.find((item) => item.id === templateId);
    if (!source) return null;
    const duplicate = {
      ...structuredClone(source),
      id: uid('test'),
      name: `${source.name} — Copy`,
      version: 1,
      duplicatedFrom: source.id
    };
    state.templates.tests.push(duplicate);
    persist();
    return duplicate;
  },

  renameTestTemplate(templateId, name) {
    const template = state.templates.tests.find((item) => item.id === templateId);
    if (!template || !String(name || '').trim()) return false;
    template.name = String(name).trim();
    template.version = (template.version || 1) + 1;
    persist();
    return true;
  },

  togglePublication(publicationId) {
    const publication = state.publications.find((item) => item.id === publicationId);
    if (!publication) return { ok: false, errors: ['Activity not found.'] };
    if (publication.status !== 'published') {
      const errors = validatePublication(state, publication);
      if (errors.length) return { ok: false, errors };
      publication.status = 'published';
      publication.publishedAt = new Date().toISOString();
    } else {
      publication.status = 'draft';
    }
    persist();
    return { ok: true, publication };
  },

  saveDraft(publicationId, draft) {
    state.drafts[publicationId] = {
      ...(state.drafts[publicationId] || {}),
      ...draft,
      updatedAt: new Date().toISOString()
    };
    persist();
  },

  clearDraft(publicationId) {
    delete state.drafts[publicationId];
    persist();
  },

  submitEvaluation(publicationId, response) {
    const snapshot = makePublicationSnapshot(state, publicationId);
    const submission = {
      id: uid('submission'),
      publicationId,
      publicationRevision: snapshot?.revision || 1,
      submittedAt: new Date().toISOString(),
      ...response,
      snapshot
    };
    state.submissions.push(submission);
    delete state.drafts[publicationId];
    persist();
    return submission;
  },

  recordAttempt(publicationId, result, answers) {
    const attempt = {
      id: uid('attempt'),
      publicationId,
      attemptNumber: state.attempts.filter((item) => item.publicationId === publicationId).length + 1,
      completedAt: new Date().toISOString(),
      ...result,
      answers
    };
    state.attempts.push(attempt);
    persist();
    return attempt;
  },

  confirmAttendance(publicationId) {
    const existing = (state.attendanceConfirmations || [])
      .find((item) => item.publicationId === publicationId);
    if (existing) return existing;
    const confirmation = {
      id: uid('attendance'),
      publicationId,
      confirmedAt: new Date().toISOString()
    };
    state.attendanceConfirmations ||= [];
    state.attendanceConfirmations.push(confirmation);
    persist();
    return confirmation;
  },

  issueCertificate(publicationId, learner) {
    const existing = state.certificates.find((item) => item.publicationId === publicationId);
    if (existing) return existing;
    const context = activityContext(state, publicationId);
    const certificate = {
      id: uid('certificate'),
      number: `LLI-${new Date().getFullYear()}-${String(state.certificates.length + 4182).padStart(6, '0')}`,
      publicationId,
      issuedAt: new Date().toISOString(),
      learner,
      snapshot: makePublicationSnapshot(state, publicationId),
      templateId: context?.publication.certificateTemplateId
    };
    state.certificates.push(certificate);
    persist();
    return certificate;
  }
};
