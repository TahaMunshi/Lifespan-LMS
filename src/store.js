import { createSeedState } from './seed.js';
import { apiRequest, getAccessToken, learnerClientId, setAccessToken } from './api.js';

let state = createSeedState();
let user = null;

function applyPayload(payload) {
  if (payload?.state) state = payload.state;
  return payload;
}

async function mutate(path, body) {
  const payload = await apiRequest(path, { method: 'POST', body, auth: true });
  applyPayload(payload);
  return payload;
}

export const store = {
  getState() {
    return state;
  },

  getUser() {
    return user;
  },

  isAdmin() {
    return user?.role === 'admin';
  },

  clientId() {
    return learnerClientId();
  },

  async bootstrap() {
    try {
      const data = await apiRequest('/lms/state');
      state = data.state || createSeedState();
      user = data.user || null;
      if (!user && getAccessToken()) setAccessToken('');
      return { ok: true };
    } catch (error) {
      state = createSeedState();
      user = null;
      return { ok: false, error };
    }
  },

  async login(email, password) {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(data.accessToken);
    user = data.user;
    await this.bootstrap();
    return data;
  },

  async logout() {
    try {
      if (getAccessToken()) await apiRequest('/auth/logout', { method: 'POST', auth: true });
    } catch {
      // Still clear the local session.
    }
    setAccessToken('');
    user = null;
    await this.bootstrap();
  },

  async savePublication(input) {
    const payload = await mutate('/lms/publications', input);
    return { ok: true, publication: payload.publication };
  },

  async duplicatePublication(publicationId) {
    return mutate(`/lms/publications/${publicationId}/duplicate`);
  },

  async createEvaluationTemplate(name = 'Activity Evaluation') {
    return mutate('/lms/evaluations', { name });
  },

  async duplicateEvaluationTemplate(templateId, name) {
    return mutate(`/lms/evaluations/${templateId}/duplicate`, { name });
  },

  async upsertActivityCatalog(input = {}) {
    return mutate('/lms/catalog', input);
  },

  async saveEvaluationTemplate(templateId, input) {
    const payload = await mutate(`/lms/evaluations/${templateId}`, input);
    return { ok: true, template: payload.template };
  },

  async saveTestTemplate(templateId, input) {
    const payload = await mutate(`/lms/tests/${templateId}`, input);
    return { ok: true, template: payload.template };
  },

  async createTestTemplate(name = 'New Knowledge Check') {
    return mutate('/lms/tests', { name });
  },

  async duplicateTestTemplate(templateId) {
    return mutate(`/lms/tests/${templateId}/duplicate`);
  },

  async togglePublication(publicationId) {
    const payload = await mutate(`/lms/publications/${publicationId}/toggle`);
    return { ok: true, publication: payload.publication };
  },

  async saveDraft(publicationId, draft) {
    return mutate(`/lms/drafts/${publicationId}`, { ...draft, clientId: learnerClientId() });
  },

  async submitEvaluation(publicationId, response) {
    return mutate(`/lms/submissions/${publicationId}`, { ...response, clientId: learnerClientId() });
  },

  async recordAttempt(publicationId, result, answers) {
    return mutate(`/lms/attempts/${publicationId}`, { result, answers, clientId: learnerClientId() });
  },

  async confirmAttendance(publicationId) {
    return mutate(`/lms/attendance/${publicationId}`, { clientId: learnerClientId() });
  },

  async issueCertificate(publicationId, learner) {
    return mutate(`/lms/certificates/${publicationId}`, { learner, clientId: learnerClientId() });
  }
};
