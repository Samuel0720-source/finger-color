const HISTORY_KEY = 'finger-color-history';
const MAX_SESSIONS = 200;

const HANDS = ['Left', 'Right'];

export function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(data) ? data.filter(s => s &&
      ['color', 'catching', 'tapping'].includes(s.test) &&
      Number.isFinite(Date.parse(s.savedAt)) &&
      (s.result === null || (Number.isFinite(s.result) && s.result >= 0)))
      // Stored data is untrusted (edited, or written by an older version): keep only a known hand.
      .map(s => ({ ...s, context: { ...(s.context && typeof s.context === 'object' ? s.context : {}), hand: HANDS.includes(s.context?.hand) ? s.context.hand : '' } })) : [];
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

