export function saveToken(roomId, token) {
  localStorage.setItem(`coloto:token:${roomId}`, token);
}

export function loadToken(roomId) {
  return localStorage.getItem(`coloto:token:${roomId}`);
}

export function forgetToken(roomId) {
  localStorage.removeItem(`coloto:token:${roomId}`);
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatDrawDate(value) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function ball(number, extra = '') {
  return `<span class="ball ${extra}">${number}</span>`;
}
