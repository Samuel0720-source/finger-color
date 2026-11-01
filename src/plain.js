const NAMES = {
  thumb: 'Thumb',
  index: 'Index',
  middle: 'Middle',
  ring: 'Ring',
  pinky: 'Pinky',
};

const TONES = {
  'Near baseline': 'ok',
  Paler: 'pale',
  Darker: 'dark',
  Bluer: 'blue',
  Redder: 'red',
};

export const NORMAL_LIMIT = 3;
const BAR_FULL_SCORE = 20;

export function describeChange(diff) {
  const score = Math.hypot(diff.L, diff.a, diff.b);
  if (score < NORMAL_LIMIT) return { score, label: 'Near baseline' };

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

// The camera's average color of a fingertip, as a CSS color.
function css(rgb) {
  return rgb ? `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})` : 'transparent';
}

function swatches(normal, now) {
  return `<div class="swatches" aria-hidden="true">
      <span class="swatch ${normal ? '' : 'empty'}" style="background:${css(normal)}" title="Normal color"></span>
      <span class="swatch now ${now ? '' : 'empty'}" style="background:${css(now)}" title="Color now"></span>
    </div>`;
}

export function renderFingers(container, views) {
  container.innerHTML = views
    .map(({ name, change, now, normal }) => {
      const key = name === 'middle' ? '<span class="finger-key">Timed</span>' : '';
      if (!change) {
        return `<div class="finger">
          ${swatches(null, now)}
          <span class="finger-name">${NAMES[name]}${key}</span>
          <span class="finger-label muted">${now ? 'No normal color yet' : 'Waiting for hand'}</span>
        </div>`;
      }
      const width = Math.min(100, (change.score / BAR_FULL_SCORE) * 100);
      return `<div class="finger tone-${TONES[change.label]}">
        ${swatches(normal, now)}
        <span class="finger-name">${NAMES[name]}${key}</span>
        <span class="finger-label">${change.label}</span>
        <div class="bar"><div class="bar-fill" style="width: ${width}%"></div></div>
        <span class="finger-score">Color change ${change.score.toFixed(1)}</span>
      </div>`;
    })
    .join('');
}

