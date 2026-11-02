// Renders a condition's QUESTIONS as tap-friendly controls and keeps the answers.
// Answers stay in this tab only (sessionStorage): they are health information and are never uploaded.

const FINGER_LABELS = [
  ['thumb', 'Thumb'],
  ['index', 'Index'],
  ['middle', 'Middle'],
  ['ring', 'Ring'],
  ['pinky', 'Little'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function loadAnswers(key) {
  try {
    return JSON.parse(sessionStorage.getItem('answers-' + key)) || {};
  } catch {
    return {};
  }
}

export function saveAnswers(key, answers) {
  try {
    sessionStorage.setItem('answers-' + key, JSON.stringify(answers));
  } catch {
    // Private mode: answers still work until the page closes.
  }
}

export function mountQuestionnaire(root, key, questions, onChange) {
  const answers = loadAnswers(key);
  let html = '';
  let sectionOpen = false;
  questions.forEach((q, i) => {
    if (q.section) {
      if (sectionOpen) html += '</fieldset>';
      html += `<fieldset class="q-section" data-i="${i}"><legend>${esc(q.section)}</legend>${q.note ? `<p class="q-note">${esc(q.note)}</p>` : ''}`;
      sectionOpen = true;
      return;
    }
    const help = q.help ? `<span class="q-help">${esc(q.help)}</span>` : '';
    const flag = q.urgent ? '<span class="q-flag">Urgent sign</span>' : '';
    let control = '';
    if (q.type === 'fingers') {
      control = `<div class="chips" role="group" aria-label="${esc(q.text)}">${FINGER_LABELS.map(([v, l]) => `<button type="button" class="chip" data-q="${q.id}" data-v="${v}">${l}</button>`).join('')}</div>`;
    } else if (q.type === 'choice') {
      control = `<div class="seg-group" role="group" aria-label="${esc(q.text)}">${q.options.map(([v, l]) => `<button type="button" class="seg" data-q="${q.id}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
    } else {
      control = `<div class="seg-group" role="group" aria-label="${esc(q.text)}">${[['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']].map(([v, l]) => `<button type="button" class="seg" data-q="${q.id}" data-v="${v}">${l}</button>`).join('')}</div>`;
    }
    html += `<div class="q${q.urgent ? ' q-urgent' : ''}" data-i="${i}"><p class="q-text">${esc(q.text)} ${flag}${help}</p>${control}</div>`;
  });
  if (sectionOpen) html += '</fieldset>';
  html += `<div class="q-foot"><span class="q-progress" aria-live="polite"></span><button type="button" class="btn-link q-clear">Clear answers</button></div>`;
  root.innerHTML = html;

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]');
    if (!b) return;
    const id = b.dataset.q;
    const q = questions.find((x) => x.id === id);
    if (q.type === 'fingers') {
      const set = new Set(answers[id] || []);
      set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
      answers[id] = [...set];
    } else {
      answers[id] = answers[id] === b.dataset.v ? undefined : b.dataset.v; // tap again to clear
    }
    changed();
  });
  root.querySelector('.q-clear').onclick = () => {
    for (const k of Object.keys(answers)) delete answers[k];
    changed();
  };

  function changed() {
    saveAnswers(key, answers);
    sync();
    onChange(answers);
  }

  function sync() {
    let shown = 0;
    let done = 0;
    let sectionVisible = true;
    questions.forEach((q, i) => {
      const el = root.querySelector(`[data-i="${i}"]`);
      const visible = !q.showIf || q.showIf(answers);
      if (q.section) {
        sectionVisible = visible;
        el.classList.toggle('hidden', !visible);
        return;
      }
      el.classList.toggle('hidden', !visible || !sectionVisible);
      if (!visible || !sectionVisible) return;
      shown++;
      const v = answers[q.id];
      if (Array.isArray(v) ? v.length : v) done++;
      el.querySelectorAll('button[data-q]').forEach((b) => {
        const on = Array.isArray(v) ? v.includes(b.dataset.v) : v === b.dataset.v;
        b.setAttribute('aria-pressed', String(on));
      });
    });
    root.querySelector('.q-progress').textContent = `${done} of ${shown} answered`;
  }

  sync();
  return {
    answers,
    sync,
    set(id, v) {
      if (v === null || v === undefined) delete answers[id];
      else answers[id] = v;
      changed();
    },
  };
}
