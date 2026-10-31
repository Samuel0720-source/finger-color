import Chart from 'chart.js/auto';

// One place for how every chart looks, so the three tests match.
export const INK = '#16231F';
export const MUTED = '#5A6964';
export const GRID = 'rgba(22, 35, 31, 0.08)';
export const FOCUS = '#0E6B63'; // the line that matters (middle finger)
export const OTHER = '#B7C2BE'; // the other fingers, for context only
export const ALERT = '#B3261E';

Chart.defaults.font.family = "'Instrument Sans Variable', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = MUTED;
Chart.defaults.borderColor = GRID;

export function lineStyle(isFocus) {
  return {
    borderColor: isFocus ? FOCUS : OTHER,
    backgroundColor: isFocus ? FOCUS : OTHER,
    borderWidth: isFocus ? 3 : 1.5,
    pointRadius: 0,
    tension: 0.25,
    order: isFocus ? 0 : 1, // draw the focus line on top
  };
}

export { Chart };
