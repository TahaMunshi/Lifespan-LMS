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

export function cloneStandardSections() {
  return structuredClone(STANDARD_QUESTIONS);
}

export function createSeedState() {
  return {
    schemaVersion: 6,
    templates: {
      evaluations: [
        {
          id: 'eval-standard-v1',
          name: 'Standard CE Evaluation',
          version: 1,
          status: 'active',
          dynamicSections: ['objectives', 'presenters', 'activity'],
          sections: cloneStandardSections()
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
          questions: []
        }
      ],
      certificates: [
        { id: 'cert-live-v1', name: 'Live Program Certificate', version: 2, activityTypes: ['live'] },
        { id: 'cert-study-v1', name: 'Home Study & Hybrid Certificate', version: 2, activityTypes: ['home-study', 'hybrid'] }
      ]
    },
    courses: [],
    versions: [],
    cohorts: [],
    modules: [],
    publications: [],
    submissions: [],
    attempts: [],
    attendanceConfirmations: [],
    certificates: [],
    drafts: {}
  };
}
