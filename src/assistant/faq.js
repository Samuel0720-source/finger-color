// Answers common questions on the device, with no AI and no network.
// It scores each knowledge entry by how many of its key phrases appear in the question.

import { ENTRIES, byId, SOURCES } from './knowledge.js';
import { cleanActions } from './actions.js';

const HOW_BY_MODE = { raynaud: 'how_raynaud', trigger: 'how_trigger', carpal: 'how_carpal' };
const norm = (s) => String(s || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

export function answerFor(entry, lang) {
  const sources = [entry.source, entry.source2].filter(Boolean).map((id) => SOURCES[id]);
  return { id: entry.id, text: entry[lang] || entry.en, actions: cleanActions(entry.actions || [], 2), sources };
}

// ctx: { mode, step } from the app. Returns { id, text, actions, sources, score } or null when nothing fits.
export function answerLocally(question, ctx = {}, lang = 'en') {
  const q = norm(question);
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const e of ENTRIES) {
    let score = 0;
    for (const k of e.keys) if (q.includes(k)) score += 1 + k.length / 12; // longer phrases are stronger evidence
    if (score && e.mode && e.mode === ctx.mode) score += 0.75;
    if (score && e.first) score += 3; // "Do I have carpal tunnel?" is a diagnosis question before it is a carpal tunnel question
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  if (!best || bestScore < 1.2) return null;

  // "How do I start?" depends on where the user is: inside a check, give that check's own steps.
  if (best.id === 'steps' && ctx.step === 'measure' && HOW_BY_MODE[ctx.mode]) best = byId[HOW_BY_MODE[ctx.mode]];
  return { ...answerFor(best, lang), score: bestScore };
}

// Used when nothing matched and the AI cannot be reached.
export const NO_MATCH = {
  en: 'I do not have a ready answer for that, and the AI part of this assistant is not available right now. Try one of the questions below, or ask about how a test works, camera problems, or what a result means.',
  ko: '그 질문에는 준비된 답이 없고, 지금은 이 도우미의 AI 기능을 쓸 수 없어요. 아래 질문 중 하나를 눌러 보거나, 테스트 방법, 카메라 문제, 결과의 뜻에 대해 물어봐 주세요.',
};
