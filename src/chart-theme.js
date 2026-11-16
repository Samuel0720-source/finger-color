import Chart from 'chart.js/auto';

// One place for how every chart looks, so the three tests match.
export const INK = '#0B1F3A';
export const MUTED = '#4D5A6D';
export const GRID = 'rgba(11, 31, 58, 0.1)';
export const FOCUS = '#0B1F3A'; // the line that matters (middle finger)
export const OTHER = '#BDB2A0'; // the other fingers, for context only
export const ALERT = '#B3261E';

Chart.defaults.font.family = "'Figtree Variable', system-ui, sans-serif";
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

