// The chat panel. Loaded only when the launcher is first pressed (see launcher.js), so the page
// does not pay for it up front.
//
// How one question is answered, in order:
//   1. urgent-symptom check (fixed text, on the device)
//   2. a strong match in the built-in answers (on the device)
//   3. the AI, through POST /api/chat
//   4. if the AI cannot be reached: the best built-in answer, or a "try again" message
// Model output is always shown as plain text, and the only actions it can offer come from a fixed list.

import { ACTIONS, cleanActions } from './actions.js';
import { byId } from './knowledge.js';
import { answerLocally, answerFor, NO_MATCH } from './faq.js';
import { urgency, URGENT_REPLY, hasKorean } from './safety.js';
import { buildSummary, summaryLines, explainLocally } from './result-summary.js';

const MAX_CHARS = 500;
const HISTORY_SENT = 6; // recent messages sent with each AI request

const T = {
  en: {
    title: 'finger-color assistant',
    sub: 'General information, not a diagnosis',
    welcome: "Hi! I'm the finger-color assistant. I can explain the tests, guide you through the steps, and help you read your result. What would you like help with?",
    notice: 'Common questions are answered on your device. Other questions are sent to Google Gemini, so please do not type names or other personal details.',
    placeholder: 'Ask about a test or a result',
    send: 'Send',
    close: 'Close the assistant',
    clear: 'Clear',
    lang: '한국어',
    langLabel: 'Switch to Korean',
    thinking: 'Thinking',
    tagDevice: 'Answered on this device',
    tagAi: 'AI answer. General information, not a diagnosis',
    tagSafety: 'Safety message',
    retry: 'Try again',
    errNetwork: 'I could not reach the AI just now.',
    errRate: (s) => `That was a lot of questions in a short time. Please wait ${s} seconds and try again.`,
    errCap: 'The free AI quota for today is used up. I can still answer the common questions below.',
    explainChip: 'Explain my result',
    noResult: 'There is no result to explain yet. Answer the questions in the Symptoms step first, then ask me again.',
    consentIntro: 'I can explain the result on your screen. These are the only lines I would use:',
    consentAi: 'Sending shares the lines above with Google Gemini. On the free tier Google may use them to improve its products.',
    onDevice: 'Explain on this device',
    viaAi: 'Send to the AI and explain',
    askExplain: 'Please explain my result in plain words.',
    sourcesLabel: 'Read more',
    chips: [
      ['what_is_app', 'How does finger-color work?'],
      ['how_raynaud', "How do I do the Raynaud's test?"],
      ['how_trigger', 'How does the trigger finger test work?'],
      ['camera_trouble', "Why isn't my camera detecting my hand?"],
    ],
  },
  ko: {
    title: 'finger-color 도우미',
    sub: '일반 정보이며 진단이 아니에요',
    welcome: '안녕하세요! finger-color 도우미예요. 테스트를 설명하고, 단계를 안내하고, 결과를 읽는 것을 도와드려요. 무엇을 도와드릴까요?',
    notice: '자주 묻는 질문은 이 기기에서 답해요. 그 밖의 질문은 Google Gemini로 전송되니 이름 같은 개인정보는 적지 마세요.',
    placeholder: '테스트나 결과를 물어보세요',
    send: '보내기',
    close: '도우미 닫기',
    clear: '지우기',
    lang: 'English',
    langLabel: '영어로 바꾸기',
    thinking: '생각하는 중',
    tagDevice: '이 기기에서 답함',
    tagAi: 'AI 답변. 일반 정보이며 진단이 아니에요',
    tagSafety: '안전 안내',
    retry: '다시 시도',
    errNetwork: '지금은 AI에 연결하지 못했어요.',
    errRate: (s) => `짧은 시간에 질문이 많았어요. ${s}초 뒤에 다시 시도해 주세요.`,
    errCap: '오늘의 무료 AI 사용량을 다 썼어요. 아래의 자주 묻는 질문에는 계속 답할 수 있어요.',
    explainChip: '내 결과 설명해 줘',
    noResult: '아직 설명할 결과가 없어요. 먼저 Symptoms 단계의 질문에 답한 뒤 다시 물어봐 주세요.',
    consentIntro: '화면에 있는 결과를 설명해 드릴 수 있어요. 제가 쓰는 내용은 아래 줄이 전부예요:',
    consentAi: '전송하면 위 내용이 Google Gemini와 공유돼요. 무료 등급에서는 Google이 제품 개선에 쓸 수 있어요.',
    onDevice: '이 기기에서 설명',
    viaAi: 'AI에 보내서 설명',
    askExplain: '내 결과를 쉬운 말로 설명해 줘.',
    sourcesLabel: '더 읽기',
    chips: [
      ['what_is_app', 'finger-color는 어떻게 작동해?'],
      ['how_raynaud', '레이노 테스트는 어떻게 해?'],
      ['how_trigger', '방아쇠 손가락 테스트는 어떻게 해?'],
      ['camera_trouble', '카메라가 내 손을 인식 못 해'],
    ],
  },
};

const RESULT_INTENT = /(explain|understand|read|interpret|what does)[^.?!]{0,30}result|my results?\b|결과[^.?!]{0,12}(설명|알려|해석|뜻|의미|봐)/i;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// app: { getContext(), getAssessment(), run(actionId) } from main.js.  launcher: the button that opened us.
export function createChat({ app, launcher, fetchImpl = (...a) => fetch(...a) }) {
  let lang = (navigator.language || '').startsWith('ko') ? 'ko' : 'en';
  let ai = 'unknown'; // 'unknown' | 'on' | 'off' (off = no key on the server, stop asking)
  let pending = false;
  const turns = []; // { role, text } kept in memory only, gone on reload

  // ---------- Build the panel ----------
  const panel = el('section', 'assist-panel on-cream hidden');
  panel.id = 'assist-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');

  const head = el('header', 'assist-head');
  const titles = el('div', 'assist-titles');
  const title = el('h2', 'assist-title');
  title.id = 'assist-title';
  panel.setAttribute('aria-labelledby', 'assist-title');
  const sub = el('p', 'assist-sub');
  titles.append(title, sub);
  const btnLang = el('button', 'assist-tool');
  btnLang.type = 'button';
  const btnClear = el('button', 'assist-tool');
  btnClear.type = 'button';
  const btnClose = el('button', 'assist-tool assist-close');
  btnClose.type = 'button';
  btnClose.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.append(titles, btnLang, btnClear, btnClose);

  const log = el('ol', 'assist-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.tabIndex = 0;

  const form = el('form', 'assist-form');
  const input = el('textarea', 'assist-input');
  input.rows = 1;
  input.maxLength = MAX_CHARS;
  input.id = 'assist-input';
  const btnSend = el('button', 'assist-send');
  btnSend.type = 'submit';
  btnSend.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  form.append(input, btnSend);
  panel.append(head, log, form);
  document.body.append(panel);

  // ---------- Small pieces ----------
  const t = () => T[lang];
  const scrollDown = () => (log.scrollTop = log.scrollHeight);

  function applyLang() {
    title.textContent = t().title;
    sub.textContent = t().sub;
    btnLang.textContent = t().lang;
    btnLang.setAttribute('aria-label', t().langLabel);
    btnLang.lang = lang === 'en' ? 'ko' : 'en';
    btnClear.textContent = t().clear;
    btnClose.setAttribute('aria-label', t().close);
    input.placeholder = t().placeholder;
    input.setAttribute('aria-label', t().placeholder);
    btnSend.setAttribute('aria-label', t().send);
    panel.lang = lang;
  }

  function bubble(role, text, { tag, actions = [], sources = [], extra } = {}) {
    const li = el('li', `assist-msg assist-${role}`);
    const body = el('div', 'assist-bubble');
    body.append(el('p', 'assist-text', text)); // textContent: nothing the model or user writes is ever run as HTML
    if (extra) body.append(extra);
    if (sources.length) {
      const p = el('p', 'assist-sources', t().sourcesLabel + ': ');
      sources.forEach((s, i) => {
        const a = el('a', '', s.title);
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        p.append(a, i < sources.length - 1 ? ', ' : '');
      });
      body.append(p);
    }
    const ids = cleanActions(actions, 2);
    if (ids.length) {
      const row = el('div', 'assist-actions');
      for (const id of ids) {
        const b = el('button', 'assist-action', ACTIONS[id][lang]);
        b.type = 'button';
        b.onclick = () => {
          const ok = app.run(id);
          if (ok !== false && window.matchMedia('(max-width: 640px)').matches) close(); // on a phone the sheet would hide where we went
        };
        row.append(b);
      }
      body.append(row);
    }
    if (tag) body.append(el('p', 'assist-tag', tag));
    li.append(body);
    log.append(li);
    // Show an answer from its first line, even when it is longer than the panel.
    if (role === 'bot') log.scrollTop = Math.max(0, li.offsetTop - log.offsetTop - 12);
    else scrollDown();
    return li;
  }

  function chips() {
    const li = el('li', 'assist-msg assist-chips');
    const add = (label, onPress) => {
      const b = el('button', 'assist-chip', label);
      b.type = 'button';
      b.onclick = onPress;
      li.append(b);
    };
    for (const [id, label] of t().chips) add(label, () => ask(label, { entryId: id }));
    add(t().explainChip, () => ask(t().explainChip, { explain: true }));
    log.append(li);
    scrollDown();
  }

  function welcome() {
    log.replaceChildren();
    turns.length = 0;
    bubble('bot', t().welcome);
    log.append(el('li', 'assist-notice', t().notice));
    chips();
  }

  function setPending(on) {
    pending = on;
    btnSend.disabled = on;
    log.querySelector('.assist-typing')?.remove();
    if (on) {
      const li = el('li', 'assist-msg assist-bot assist-typing');
      const b = el('div', 'assist-bubble');
      b.append(el('span', 'sr-only', t().thinking), el('span', 'assist-dots'));
      li.append(b);
      log.append(li);
      scrollDown();
    }
  }

  const say = (text, opts) => {
    turns.push({ role: 'assistant', text });
    return bubble('bot', text, opts);
  };

  // ---------- Answering ----------
  async function callAi(extra = {}) {
    const res = await fetchImpl('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: turns.slice(-HISTORY_SENT).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) })), lang, context: app.getContext(), ...extra }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.reply === 'string') {
      ai = 'on';
      return { ok: true, ...data };
    }
    // A missing endpoint (local dev, static hosting) or a missing key both mean: no AI here.
    if (res.status === 404 || res.status === 405 || data.error === 'ai_off') ai = 'off';
    return { ok: false, error: data.error || 'network', retryAfter: data.retryAfter };
  }

  function failure(out, question, opts) {
    const local = answerLocally(question, app.getContext(), lang);
    if (local) return say(local.text, { tag: t().tagDevice, actions: local.actions, sources: local.sources });
    if (ai === 'off') {
      say(NO_MATCH[lang], { tag: t().tagDevice });
      return chips();
    }
    const text = out.error === 'rate_limited' ? t().errRate(out.retryAfter || 60) : out.error === 'daily_cap' || out.error === 'quota' ? t().errCap : t().errNetwork;
    const retry = el('button', 'assist-action', t().retry);
    retry.type = 'button';
    retry.onclick = () => {
      retry.closest('.assist-msg').remove();
      respond(question, opts);
    };
    const row = el('div', 'assist-actions');
    row.append(retry);
    bubble('bot', text, { extra: out.error === 'daily_cap' || out.error === 'quota' ? undefined : row });
    if (out.error === 'daily_cap' || out.error === 'quota') chips();
  }

  function offerExplain() {
    const ctx = app.getContext();
    const r = app.getAssessment();
    if (!ctx.hasResult || !r || r.level === 'incomplete') return say(t().noResult, { tag: t().tagDevice, actions: ['go_symptoms'] });
    const summary = buildSummary(ctx.mode, r);
    const box = el('div', 'assist-consent');
    const ul = el('ul', 'assist-lines');
    for (const line of summaryLines(summary, lang)) ul.append(el('li', '', line));
    box.append(ul);
    const row = el('div', 'assist-actions');
    const device = el('button', 'assist-action', t().onDevice);
    device.type = 'button';
    const done = () => row.querySelectorAll('button').forEach((b) => (b.disabled = true));
    device.onclick = () => {
      done();
      say(explainLocally(summary, lang), { tag: t().tagDevice, actions: ['go_result'] });
    };
    row.append(device);
    if (ai !== 'off') {
      const send = el('button', 'assist-action', t().viaAi);
      send.type = 'button';
      send.onclick = async () => {
        if (pending) return;
        done();
        turns.push({ role: 'user', text: t().askExplain });
        setPending(true);
        let out;
        try {
          out = await callAi({ result: summary });
        } catch {
          out = { ok: false, error: 'network' };
        }
        setPending(false);
        if (out.ok) say(out.reply, { tag: t().tagAi, actions: out.actions });
        else say(explainLocally(summary, lang), { tag: t().tagDevice, actions: ['go_result'] }); // the AI failed: explain on the device instead
      };
      row.append(send);
      box.append(row, el('p', 'assist-fine', t().consentAi));
    } else box.append(row);
    bubble('bot', t().consentIntro, { extra: box });
  }

  async function respond(question, { entryId, explain } = {}) {
    const level = urgency(question);
    if (level) return say(URGENT_REPLY[level][lang], { tag: t().tagSafety });
    if (explain || RESULT_INTENT.test(question)) return offerExplain();
    if (entryId && byId[entryId]) {
      const a = answerFor(byId[entryId], lang);
      return say(a.text, { tag: t().tagDevice, actions: a.actions, sources: a.sources });
    }
    // A short question that clearly matches a built-in answer does not need the AI.
    const local = answerLocally(question, app.getContext(), lang);
    if (ai === 'off' || (local && local.score >= 2.6 && question.length <= 80)) {
      if (local) return say(local.text, { tag: t().tagDevice, actions: local.actions, sources: local.sources });
      say(NO_MATCH[lang], { tag: t().tagDevice });
      return chips();
    }
    setPending(true);
    let out;
    try {
      out = await callAi();
    } catch {
      out = { ok: false, error: 'network' };
    }
    setPending(false);
    if (out.ok) return say(out.reply, { tag: out.source === 'safety' ? t().tagSafety : t().tagAi, actions: out.actions });
    return failure(out, question, { entryId, explain });
  }

  function ask(text, opts = {}) {
    const question = String(text || '').trim().slice(0, MAX_CHARS);
    if (!question || pending) return; // one question at a time: no duplicate sends
    // Reply in the language the user wrote in.
    const typed = hasKorean(question) ? 'ko' : /[a-z]{3}/i.test(question) ? 'en' : lang;
    if (typed !== lang) {
      lang = typed;
      applyLang();
    }
    log.querySelectorAll('.assist-chips').forEach((n) => n.remove());
    turns.push({ role: 'user', text: question });
    bubble('user', question);
    respond(question, opts);
  }

  // ---------- Wiring ----------
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim() || pending) return;
    input.value = '';
    input.style.height = '';
    ask(text);
  };
  input.addEventListener('keydown', (e) => {
    // Enter sends, Shift+Enter makes a new line. While a Korean character is still being composed, Enter belongs to the keyboard.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = '';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  btnLang.onclick = () => {
    lang = lang === 'en' ? 'ko' : 'en';
    applyLang();
    if (turns.length === 0) welcome();
  };
  btnClear.onclick = () => {
    if (pending) return;
    welcome();
    input.focus();
  };
  btnClose.onclick = () => close();
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  function open() {
    panel.classList.remove('hidden');
    launcher.setAttribute('aria-expanded', 'true');
    document.body.dataset.assist = 'open';
    input.focus({ preventScroll: true });
    scrollDown();
  }
  function close() {
    panel.classList.add('hidden');
    launcher.setAttribute('aria-expanded', 'false');
    delete document.body.dataset.assist;
    launcher.focus({ preventScroll: true });
  }

  applyLang();
  welcome();
  return { open, close, toggle: () => (panel.classList.contains('hidden') ? open() : close()), ask };
}
