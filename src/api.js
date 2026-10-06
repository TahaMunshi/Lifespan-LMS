const TOKEN_KEY = 'lli-access-token';
const CLIENT_KEY = 'lli-learner-client-id';

function apiBase() {
  const configured = window.LLI_API_BASE || localStorage.getItem('lli-api-base') || '';
  if (configured) return String(configured).replace(/\/$/, '');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://localhost:3000';
  return 'http://localhost:3000';
}

export function learnerClientId() {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = `learner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAccessToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Learner-Client': learnerClientId() };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase()}/api/v1${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.message || 'Request failed');
    error.status = response.status;
    error.payload = json;
    throw error;
  }
  return json.data;
}

export { apiBase };
