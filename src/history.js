const HISTORY_KEY = 'finger-color-history';
const MAX_SESSIONS = 200;

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveSession(summary) {
  const list = loadHistory();
  list.push({ savedAt: new Date().toISOString(), ...summary });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
  } catch {
    // Storage full or blocked. The PDF and CSV still work.
  }
}
