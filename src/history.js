const HISTORY_KEY = 'finger-color-history';
const MAX_SESSIONS = 200;

export function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(data) ? data.filter(s => s &&
      ['color', 'catching', 'tapping'].includes(s.test) &&
      Number.isFinite(Date.parse(s.savedAt)) &&
      (s.result === null || (Number.isFinite(s.result) && s.result >= 0))) : [];
  } catch {
    return [];
  }
}

export function saveSession(summary) {
  const list = loadHistory();
  list.push({ savedAt: new Date().toISOString(), ...summary });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
    return true;
  } catch {
    return false; // The caller tells the user to download a copy.
  }
}

