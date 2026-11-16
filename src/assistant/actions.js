// The only things the assistant is allowed to do in the app: move the user to a place that exists.
// The AI model returns ids from this list; anything else is dropped. No URLs or code are ever run.

export const ACTIONS = {
  open_raynaud: { en: "Open the Raynaud's check", ko: '레이노 체크 열기' },
  open_trigger: { en: 'Open the trigger finger check', ko: '방아쇠 손가락 체크 열기' },
  open_carpal: { en: 'Open the carpal tunnel check', ko: '손목터널 체크 열기' },
  go_symptoms: { en: 'Go to Symptoms', ko: 'Symptoms(증상) 단계로' },
  go_measure: { en: 'Go to Measure', ko: 'Measure(측정) 단계로' },
  go_result: { en: 'View the result', ko: 'Result(결과) 보기' },
  go_how: { en: 'How the check works', ko: '체크 원리 보기' },
  go_history: { en: 'Measurement history', ko: '측정 기록 보기' },
  go_privacy: { en: 'Privacy', ko: '개인정보 안내' },
  go_home: { en: 'Back to the top', ko: '맨 위로' },
};

export const ACTION_IDS = Object.keys(ACTIONS);

// Keep known ids only, no repeats, at most `max`.
export function cleanActions(list, max = 2) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id) => typeof id === 'string' && Object.hasOwn(ACTIONS, id)))].slice(0, max);
}
