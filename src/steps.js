// The check is three steps: symptoms, measure, result. One is on screen at a time.
// The step bar at the top works like tabs, and the buttons at the bottom of each step ([data-go]) move between them.

const STEPS = ['symptoms', 'measure', 'result'];

export function createSteps({ canLeave, onChange }) {
  const workspace = document.getElementById('workspace');
  const tabs = Object.fromEntries(STEPS.map((s) => [s, document.getElementById('tab-' + s)]));
  const panels = Object.fromEntries(STEPS.map((s) => [s, document.getElementById('panel-' + s)]));
  let current = 'symptoms';

  function show(step) {
    current = step;
    for (const s of STEPS) {
      const on = s === step;
      tabs[s].setAttribute('aria-selected', String(on));
      tabs[s].tabIndex = on ? 0 : -1;
      panels[s].classList.toggle('hidden', !on);
    }
    onChange?.(step);
  }

  // Returns false if a timed test is running and the step could not be left.
  function go(step, { scroll = true } = {}) {
    if (!STEPS.includes(step) || step === current) return true;
    if (!canLeave(current)) return false;
    show(step);
    // If the reader had scrolled down a long step, start the next one from its top.
    if (scroll && workspace.getBoundingClientRect().top < 0) workspace.scrollIntoView({ block: 'start' });
    return true;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });
  // Left and right arrows move between the step tabs, as tabs do everywhere else.
  workspace.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const next = STEPS[(STEPS.indexOf(current) + dir + STEPS.length) % STEPS.length];
    if (go(next, { scroll: false })) tabs[next].focus();
  });

  show(current);
  return {
    go,
    get current() {
      return current;
    },
    setMeta(step, text, state = '') {
      const el = document.getElementById('meta-' + step);
      el.textContent = text;
      tabs[step].dataset.state = state;
    },
  };
}
