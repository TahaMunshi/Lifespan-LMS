import { createSeedState } from './seed.js';
import {
  activityContext,
  makePublicationSnapshot,
  safeSlug,
  uid,
  validatePublication
} from './domain.js';

const STORAGE_KEY = 'lifespan-lms-prototype-v4';
let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.schemaVersion === 4) return saved;
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

  duplicateEvaluationTemplate(templateId) {
    const source = state.templates.evaluations.find((item) => item.id === templateId);
    if (!source) return null;
    const duplicate = {
      ...structuredClone(source),
      id: uid('eval'),
      name: `${source.name} — Copy`,
      version: 1,
      status: 'draft',
      duplicatedFrom: source.id
    };
    state.templates.evaluations.push(duplicate);
    persist();
    return duplicate;
  },

  renameEvaluationTemplate(templateId, name) {
    const template = state.templates.evaluations.find((item) => item.id === templateId);
    if (!template || !name.trim()) return false;
    template.name = name.trim();
    template.version += 1;
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
