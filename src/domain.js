export const ACTIVITY_TYPES = {
  live: { label: 'Live', requiresTest: false, certificateTemplate: 'cert-live-v1' },
  'home-study': { label: 'Home Study', requiresTest: true, certificateTemplate: 'cert-study-v1' },
  hybrid: { label: 'Hybrid', requiresTest: true, certificateTemplate: 'cert-study-v1' }
};

export function byId(items, id) {
  return items.find((item) => item.id === id);
}

export function activityContext(state, publicationOrId) {
  const publication = typeof publicationOrId === 'string'
    ? byId(state.publications, publicationOrId)
    : publicationOrId;
  if (!publication) return null;
  const sourceCohort = byId(state.cohorts, publication.cohortId);
  const sourceModule = byId(state.modules, publication.moduleId);
  const cohort = sourceCohort ? {
    ...sourceCohort,
    name: publication.cohortName || sourceCohort.name,
    location: publication.location || sourceCohort.location,
    presenters: publication.presenters || sourceCohort.presenters
  } : null;
  const module = sourceModule ? {
    ...sourceModule,
    name: publication.moduleName || sourceModule.name,
    creditHours: Number(publication.creditHours ?? sourceModule.creditHours),
    startDate: publication.startDate || sourceModule.startDate,
    endDate: publication.endDate || sourceModule.endDate
  } : null;

  return {
    publication,
    course: byId(state.courses, publication.courseId),
    version: byId(state.versions, publication.versionId),
    cohort,
    module,
    evaluationTemplate: byId(state.templates.evaluations, publication.evaluationTemplateId),
    testTemplate: byId(state.templates.tests, publication.testTemplateId),
    certificateTemplate: byId(state.templates.certificates, publication.certificateTemplateId)
  };
}

export function validatePublication(state, publication) {
  const errors = [];
  const context = activityContext(state, publication);
  if (!context?.course) errors.push('Select a course.');
  if (!context?.version) errors.push('Select a version.');
  if (!context?.cohort) errors.push('Select a cohort.');
  if (!context?.module) errors.push('Select a module.');
  if (!publication.evaluationTemplateId) errors.push('Select an evaluation template.');
  if (!publication.deadline) errors.push('Set a completion deadline.');

  const type = ACTIVITY_TYPES[publication.activityType];
  if (!type) errors.push('Select a valid activity type.');
  if (type?.requiresTest) {
    const test = byId(state.templates.tests, publication.testTemplateId);
    if (!test) errors.push('Select a test template.');
    if (test && test.questions.length < 12) errors.push('Home Study and Hybrid tests require at least 12 questions.');
    if (test) {
      const objectives = (publication.objectives || []).filter(Boolean);
      const coveredSlots = Math.max(0, ...test.questions.map((question) => Number(question.objectiveIndex))) + 1;
      const uncovered = objectives.slice(0, coveredSlots).filter((_, objectiveIndex) => (
        test.questions.filter((question) => Number(question.objectiveIndex) === objectiveIndex).length < 3
      ));
      if (uncovered.length) errors.push('Tests require at least three questions for every learning objective.');
    }
  }
  return errors;
}

export function isExpired(publication, now = new Date()) {
  if (!publication?.deadline) return false;
  const deadline = new Date(`${publication.deadline}T23:59:59`);
  return Number.isFinite(deadline.getTime()) && deadline < now;
}

export function learnerProgress(state, publicationId) {
  const submission = [...state.submissions]
    .reverse()
    .find((item) => item.publicationId === publicationId && !item.id.startsWith('seed-'));
  const attempts = state.attempts.filter((item) => item.publicationId === publicationId);
  const passedAttempt = attempts.find((item) => item.passed);
  const attendanceConfirmed = (state.attendanceConfirmations || [])
    .some((item) => item.publicationId === publicationId);
  const context = activityContext(state, publicationId);
  const requiresTest = ACTIVITY_TYPES[context?.publication.activityType]?.requiresTest ?? false;
  const eligible = Boolean(submission && (requiresTest ? passedAttempt : attendanceConfirmed));
  return {
    submission,
    attempts,
    passedAttempt,
    attendanceConfirmed,
    requiresTest,
    eligible,
    attemptsRemaining: Math.max(0, (context?.testTemplate?.maxAttempts || 3) - attempts.length)
  };
}

export function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  }
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function scoreOpenAnswer(answer, keywords) {
  const text = String(answer || '').toLowerCase();
  const keys = normalizeKeywords(keywords);
  if (!keys.length || !text.trim()) return false;
  return keys.every((keyword) => text.includes(keyword));
}

export function isTestAnswerCorrect(question, answer) {
  if ((question?.type || 'mcq') === 'open') {
    return scoreOpenAnswer(answer, question.keywords || question.markingScheme || []);
  }
  return Number(answer) === Number(question?.correct);
}

export function scoreTest(template, answers) {
  const questions = template?.questions || [];
  const correct = questions.reduce((total, question) => (
    total + (isTestAnswerCorrect(question, answers?.[question.id]) ? 1 : 0)
  ), 0);
  const percent = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  return {
    correct,
    total: questions.length,
    percent,
    passed: percent >= (template?.passPercent || 80)
  };
}

export function makePublicationSnapshot(state, publicationId) {
  const context = activityContext(state, publicationId);
  if (!context) return null;
  return {
    publicationId,
    revision: context.publication.revision,
    activityType: context.publication.activityType,
    courseName: context.course?.name || '',
    versionName: context.version?.name || '',
    cohortName: context.cohort?.name || '',
    moduleName: context.module?.name || '',
    presenters: [...(context.cohort?.presenters || [])],
    location: context.cohort?.location || '',
    creditHours: context.module?.creditHours || 0,
    activityDates: [context.module?.startDate, context.module?.endDate],
    objectives: [...(context.publication.objectives || [])],
    cosponsor: context.publication.cosponsor || 'Sensorimotor Psychotherapy Institute',
    certificateTemplateId: context.publication.certificateTemplateId
  };
}

export function safeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function evaluationSections(template) {
  const sections = template?.sections;
  if (sections?.learning?.length) return sections;
  return null;
}

export function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
