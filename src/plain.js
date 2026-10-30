const NAMES = {
  thumb: 'Thumb',
  index: 'Index',
  middle: 'Middle',
  ring: 'Ring',
  pinky: 'Pinky',
};

const TONES = {
  Normal: 'ok',
  Paler: 'pale',
  Darker: 'dark',
  Bluer: 'blue',
  Redder: 'red',
};

export const NORMAL_LIMIT = 3;
const BAR_FULL_SCORE = 20;

export function describeChange(diff) {
  const score = Math.hypot(diff.L, diff.a, diff.b);
  if (score < NORMAL_LIMIT) return { score, label: 'Normal' };

  const options = [
    { label: 'Paler', size: diff.L },
    { label: 'Darker', size: -diff.L },
    { label: 'Bluer', size: -diff.b },
    { label: 'Redder', size: diff.a },
  ];
  let best = options[0];
  for (const option of options) {
    if (option.size > best.size) best = option;
  }
  return { score, label: best.label };
}

export function renderFingers(container, views) {
  container.innerHTML = views
    .map(({ name, change }) => {
      if (!change) {
        return `<div class="finger">
          <span class="finger-name">${NAMES[name]}</span>
          <span class="finger-label muted">Save your normal color first</span>
        </div>`;
      }
      const width = Math.min(100, (change.score / BAR_FULL_SCORE) * 100);
      return `<div class="finger tone-${TONES[change.label]}">
        <span class="finger-name">${NAMES[name]}</span>
        <span class="finger-label">${change.label}</span>
        <div class="bar"><div class="bar-fill" style="width: ${width}%"></div></div>
        <span class="finger-score">Change ${change.score.toFixed(1)}</span>
      </div>`;
    })
    .join('');
}