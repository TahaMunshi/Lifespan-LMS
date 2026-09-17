export const STANDARD_QUESTIONS = {
  learning: [
    { id: 'apply', text: 'I will apply the knowledge/skills I learned.' },
    { id: 'needs', text: 'This program fulfilled my educational needs.' },
    { id: 'format', text: 'Activity format enhanced achievement of learning objectives.' },
    { id: 'effectiveness', text: 'This program improved my professional effectiveness and expertise.' },
    { id: 'inclusive', text: 'Cultural, racial, ethnic, socioeconomic, and gender differences were considered.' },
    { id: 'learned', text: 'How much did you learn in this program?', scale: ['Very little', '2', 'Some', '4', 'Great deal'] },
    { id: 'useful', text: 'How useful was the content of this CE program for your practice or other professional development?', scale: ['Not useful', '2', 'Moderately useful', '4', 'Extremely useful'] },
    { id: 'recommend', text: 'Would you recommend this program to others?', scale: ['No', '2', 'Maybe', '4', 'Yes'] },
    { id: 'confidence', text: 'What degree of confidence do you have that you will apply your “new” learning in your practice?', scale: ['0%', '25%', '50%', '75%', '100%'] }
  ],
  presenter: [
    { id: 'knowledge', text: 'Presenter was knowledgeable in the content material.' },
    { id: 'delivery', text: 'Presenter competently delivered the content in an accessible and organized manner.' },
    { id: 'depth', text: 'Presenter covered the stated objectives in depth.' },
    { id: 'interest', text: 'Presenter maintained my interest.' },
    { id: 'responsive', text: 'Presenter was responsive to questions, comments, and opinions.' },
    { id: 'clarity', text: 'Presenter clarified content and answered questions effectively.' },
    { id: 'consistent', text: 'Content was consistent with the objectives.' },
    { id: 'level', text: 'Content was appropriate for my professional level.' },
    { id: 'instructionLevel', text: 'Instruction was at a level appropriate to my professional level.' },
    { id: 'methods', text: 'Teaching methods were effective.' },
    { id: 'materials', text: 'Presentation materials (visual aids, handouts) clarified content.' }
  ],
  environment: [
    { id: 'digital', text: 'The digital materials were conducive to my learning.' },
    { id: 'interface', text: 'The web interface was reasonably convenient and accessible.' },
    { id: 'instructions', text: 'Instructions to access materials were clear.' },
    { id: 'av', text: 'The activity’s audio/visual support was good.' },
    { id: 'support', text: 'If applicable, tech support was helpful.' }
  ],
  administration: [
    { id: 'promo', text: 'Program promotional materials (ads, brochures, web pages) were accurate and informative.' },
    { id: 'requirements', text: 'Requirements for successful completion of the activity were clear.' },
    { id: 'registration', text: 'Registration procedures and confirmation were straightforward.' },
    { id: 'accuracy', text: 'Information on the accuracy and utility of the materials, the basis of such statements, the limitations of the content, and the severe and most common risks was made available and easily accessible.' },
    { id: 'bias', text: 'It was clear that the instructional content was free of commercial bias.' },
    { id: 'relationships', text: 'It was clear whether or not planners or presenters received commercial support or had relationships that could reasonably be construed as a conflict of interest.' },
    { id: 'research', text: 'It was clear whether or not the research and development of this activity’s content received commercial support.' },
    { id: 'disclosures', text: 'Disclosures of potential conflict of interest by faculty were clearly communicated.' }
  ],
  written: [
    { id: 'applications', text: 'Based upon information you received from this program, please list at least two applications that can be made to your clinical practice.' },
    { id: 'challenges', text: 'Are there any specific challenges that you encounter in your practice that you would like to see addressed in future programs?' },
    { id: 'topics', text: 'List three topics or experts you would find interesting and professionally relevant for future CME conferences.' },
    { id: 'likedMost', text: 'What did you like most about this conference?' },
    { id: 'likedLeast', text: 'What did you like least about this conference?' },
    { id: 'enhance', text: 'What can we do to enhance your CE experience?' }
  ]
};

const objectives = {
  sensorimotor: [
    'Determine three bodily cues that can indicate hopelessness, helplessness, and despair in session.',
    'Assess the role of the body in generating and maintaining depression in psychotherapy.',
    'Analyze the efficacy of working with the body to improve clinical outcomes.',
    'Demonstrate three body-oriented interventions for treating suicidality and related emotions.',
    'Distinguish the role of mindfulness from talk therapy in treatment.'
  ],
  attachment: [
    'Describe the core principles of attachment theory.',
    'Identify common attachment patterns in clinical presentations.',
    'Apply attachment concepts when assessing adult clients.',
    'Use attachment-informed interventions in treatment planning.'
  ],
  trauma: [
    'Recognize signs of dysregulation in trauma presentations.',
    'Apply stabilization techniques before trauma processing.',
    'Differentiate top-down and bottom-up interventions.',
    'Create a phased trauma-informed treatment plan.'
  ]
};

const testQuestions = [
  ['Which response best describes a body-oriented intervention?', ['Ignoring physical sensations', 'Tracking physical sensations safely', 'Avoiding grounding', 'Focusing only on diagnosis'], 1],
  ['A primary purpose of grounding is to:', ['Increase activation', 'Support present-moment orientation', 'Remove all emotion', 'Replace consent'], 1],
  ['Mindfulness in clinical care emphasizes:', ['Judgment', 'Present-moment awareness', 'Suppression', 'Distraction only'], 1],
  ['Before trauma processing, clinicians should first assess:', ['Marketing preferences', 'Stability and available resources', 'Room color', 'Handwriting'], 1],
  ['A sign of autonomic activation may include:', ['Changes in breath', 'A fixed diagnosis', 'Course enrollment', 'No body response'], 0],
  ['A collaborative intervention should:', ['Override the client', 'Respect pacing and consent', 'Ignore feedback', 'Guarantee an outcome'], 1],
  ['The window of tolerance describes:', ['A billing period', 'A workable range of arousal', 'A test deadline', 'A license category'], 1],
  ['Resource development is intended to:', ['Increase overwhelm', 'Support regulation and capacity', 'Prevent reflection', 'Replace treatment planning'], 1],
  ['Tracking asks a learner or client to notice:', ['Only thoughts', 'Moment-to-moment experience', 'Only past events', 'Administrative rules'], 1],
  ['Clinical pacing should be guided by:', ['The clock alone', 'Capacity and response', 'A fixed script', 'The presenter’s preference'], 1],
  ['An ethical trauma intervention includes:', ['Informed consent', 'Forced disclosure', 'Guaranteed recovery', 'Ignoring boundaries'], 0],
  ['Integration can be supported by:', ['Reflection and regulated practice', 'Avoiding all sensation', 'Increasing urgency', 'Removing choice'], 0]
].map(([text, options, correct], index) => ({
  id: `tq-${index + 1}`,
  objectiveIndex: index % 4,
  text,
  options,
  correct
}));

const baseState = {
  schemaVersion: 3,
  templates: {
    evaluations: [
      {
        id: 'eval-standard-v1',
        name: 'Standard CE Evaluation',
        version: 1,
        status: 'active',
        lockedSections: ['learning', 'presenter', 'environment', 'administration'],
        dynamicSections: ['objectives', 'presenters', 'activity'],
        questionSet: 'standard-ce'
      }
    ],
    tests: [
      {
        id: 'test-standard-v1',
        name: 'Standard Knowledge Check',
        version: 1,
        passPercent: 80,
        maxAttempts: 3,
        minimumQuestions: 12,
        questions: testQuestions
      }
    ],
    certificates: [
      { id: 'cert-live-v1', name: 'Live Program Certificate', version: 1, activityTypes: ['live'], asset: 'assets/certificate-green.png' },
      { id: 'cert-study-v1', name: 'Home Study & Hybrid Certificate', version: 1, activityTypes: ['home-study', 'hybrid'], asset: 'assets/certificate-navy.png' }
    ]
  },
  courses: [
    { id: 'course-sensorimotor', name: 'Words are Not Enough: Sensorimotor Interventions for Suicidality' },
    { id: 'course-attachment', name: 'Attachment Theory Across the Lifespan' },
    { id: 'course-trauma', name: 'Trauma and the Body: Sensorimotor Approaches' }
  ],
  versions: [
    { id: 'version-sensorimotor-live', courseId: 'course-sensorimotor', name: 'Live Workshop', activityType: 'live' },
    { id: 'version-attachment-home', courseId: 'course-attachment', name: 'Home Study', activityType: 'home-study' },
    { id: 'version-trauma-hybrid', courseId: 'course-trauma', name: '4-Module Hybrid', activityType: 'hybrid' }
  ],
  cohorts: [
    { id: 'cohort-sensorimotor-2026', versionId: 'version-sensorimotor-live', name: 'September 2026', location: 'Los Angeles, CA', startDate: '2026-09-12', endDate: '2026-09-13', presenters: ['Pat Ogden, PhD', 'Bonnie Goldstein, PhD'] },
    { id: 'cohort-attachment-2026', versionId: 'version-attachment-home', name: '2026 Online Cohort', location: 'Online', startDate: '2026-09-01', endDate: '2027-08-31', presenters: ['Marian Ellis, PhD'] },
    { id: 'cohort-trauma-2026', versionId: 'version-trauma-hybrid', name: 'Fall 2026', location: 'Hybrid — Los Angeles & Online', startDate: '2026-10-01', endDate: '2026-12-15', presenters: ['Pat Ogden, PhD', 'Laila Jorba, PhD'] }
  ],
  modules: [
    { id: 'module-sensorimotor', cohortId: 'cohort-sensorimotor-2026', name: 'Live Workshop', creditHours: 6, startDate: '2026-09-12', endDate: '2026-09-13' },
    { id: 'module-attachment', cohortId: 'cohort-attachment-2026', name: 'Complete Home Study', creditHours: 6, startDate: '2026-09-01', endDate: '2027-08-31' },
    { id: 'module-trauma-1', cohortId: 'cohort-trauma-2026', name: 'Module 1 — Foundations', creditHours: 6, startDate: '2026-10-01', endDate: '2026-10-02' }
  ],
  publications: [
    {
      id: 'pub-sensorimotor-live',
      slug: 'sensorimotor-live-2026',
      status: 'published',
      revision: 1,
      courseId: 'course-sensorimotor',
      versionId: 'version-sensorimotor-live',
      cohortId: 'cohort-sensorimotor-2026',
      moduleId: 'module-sensorimotor',
      evaluationTemplateId: 'eval-standard-v1',
      testTemplateId: null,
      certificateTemplateId: 'cert-live-v1',
      activityType: 'live',
      deadline: '2026-09-27',
      objectives: objectives.sensorimotor,
      createdAt: '2026-09-01T12:00:00Z',
      publishedAt: '2026-09-05T12:00:00Z'
    },
    {
      id: 'pub-attachment-home',
      slug: 'attachment-home-study-2026',
      status: 'published',
      revision: 1,
      courseId: 'course-attachment',
      versionId: 'version-attachment-home',
      cohortId: 'cohort-attachment-2026',
      moduleId: 'module-attachment',
      evaluationTemplateId: 'eval-standard-v1',
      testTemplateId: 'test-standard-v1',
      certificateTemplateId: 'cert-study-v1',
      activityType: 'home-study',
      deadline: '2027-08-31',
      objectives: objectives.attachment,
      createdAt: '2026-09-01T12:00:00Z',
      publishedAt: '2026-09-06T12:00:00Z'
    },
    {
      id: 'pub-trauma-hybrid',
      slug: 'trauma-hybrid-module-1',
      status: 'draft',
      revision: 1,
      courseId: 'course-trauma',
      versionId: 'version-trauma-hybrid',
      cohortId: 'cohort-trauma-2026',
      moduleId: 'module-trauma-1',
      evaluationTemplateId: 'eval-standard-v1',
      testTemplateId: 'test-standard-v1',
      certificateTemplateId: 'cert-study-v1',
      activityType: 'hybrid',
      deadline: '2026-12-29',
      objectives: objectives.trauma,
      createdAt: '2026-09-10T12:00:00Z',
      publishedAt: null
    }
  ],
  submissions: [],
  attempts: [],
  attendanceConfirmations: [],
  certificates: [],
  drafts: {}
};

const ratingKeys = [
  ...STANDARD_QUESTIONS.learning.map((q) => `learning.${q.id}`),
  ...STANDARD_QUESTIONS.environment.map((q) => `environment.${q.id}`),
  ...STANDARD_QUESTIONS.administration.map((q) => `administration.${q.id}`)
];

const reportSubmissions = Array.from({ length: 18 }, (_, index) => {
  const publicationId = index < 10 ? 'pub-sensorimotor-live' : 'pub-attachment-home';
  const objectiveCount = publicationId === 'pub-sensorimotor-live' ? objectives.sensorimotor.length : objectives.attachment.length;
  const presenterCount = publicationId === 'pub-sensorimotor-live'
    ? baseState.cohorts[0].presenters.length
    : baseState.cohorts[1].presenters.length;
  const base = 3 + (index % 3);
  const ratings = Object.fromEntries(ratingKeys.map((key, qIndex) => [key, Math.min(5, Math.max(1, base + ((qIndex + index) % 3) - 1))]));
  const presenterRatings = Object.fromEntries(Array.from({ length: presenterCount }, (_, presenterIndex) => (
    STANDARD_QUESTIONS.presenter.map((question, questionIndex) => [
      `presenter.${presenterIndex}.${question.id}`,
      Math.min(5, Math.max(1, base + ((questionIndex + presenterIndex + index) % 3) - 1))
    ])
  )).flat());
  return {
    id: `seed-submission-${index + 1}`,
    publicationId,
    publicationRevision: 1,
    submittedAt: `2026-09-${String(2 + index).padStart(2, '0')}T15:00:00Z`,
    ratings,
    objectiveRatings: Array.from({ length: objectiveCount }, (_, i) => 3 + ((i + index) % 3)),
    presenterRatings,
    comments: index % 4 === 0 ? { likedMost: 'The practical examples and clear clinical applications.' } : {},
    snapshot: {
      courseName: publicationId === 'pub-sensorimotor-live' ? baseState.courses[0].name : baseState.courses[1].name,
      objectives: publicationId === 'pub-sensorimotor-live' ? objectives.sensorimotor : objectives.attachment
    }
  };
});

baseState.submissions = reportSubmissions;

export function createSeedState() {
  return structuredClone(baseState);
}
