import { LEVELS } from './assess/levels.js';

const STATUS = {
  yes: ['Present', 'st-yes'],
  no: ['Absent', 'st-no'],
  unknown: ['Not checked', 'st-unknown'],
};
const METHOD = { camera: 'Camera', test: 'Guided test', answer: 'Your answer' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The main result: what to do, why, and how your features compare with the condition's hallmarks.
export function renderResult(root, r, { onPdf } = {}) {
  const L = LEVELS[r.level];
  const score = r.score
    ? `<div class="score"><span>${esc(r.score.label)}</span><strong>${typeof r.score.value === 'number' ? `${r.score.value}<small> / ${r.score.max}</small>` : esc(r.score.value)}</strong></div>`
    : '';
  const rows = r.features
    .map((f) => {
      const [word, cls] = STATUS[f.status];
      return `<tr class="${cls}"><th scope="row">${esc(f.label)}</th><td><span class="status ${cls}">${word}</span></td><td>${METHOD[f.method]}</td><td>${esc(f.detail || '')}</td></tr>`;
    })
    .join('');
  const reasons = r.reasons.map((x) => `<li${x.level ? ` class="lv-${x.level}"` : ''}>${esc(x.text)}</li>`).join('');
  const actions = r.actions.map((x) => `<li>${esc(x)}</li>`).join('');

  root.innerHTML = `
    <div class="verdict lv-${r.level}">
      <div class="verdict-main">
        <span class="verdict-tag">${L.tag}</span>
        <h3>${r.level === 'incomplete' ? L.headline : esc(L.headline)}</h3>
        <p class="verdict-summary">${esc(r.summary.text)}</p>
      </div>
      ${score}
    </div>

    <div class="result-grid">
      <section>
        <h4>Feature check: ${esc(r.name)}</h4>
        <div class="table-scroll"><table class="data-table features">
          <thead><tr><th>Feature</th><th>Status</th><th>How checked</th><th>Detail</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p class="fine-print">${r.summary.present} present, ${r.summary.total - r.summary.known} not checked yet. Features checked by camera are based on engineering thresholds that have not yet been validated on real patients.</p>
      </section>
      <section>
        ${reasons ? `<h4>Why</h4><ul class="reasons">${reasons}</ul>` : ''}
        ${actions ? `<h4>What to do</h4><ul class="actions-list">${actions}</ul>` : ''}
        <h4>What this check cannot do</h4>
        <ul class="limits">${r.limits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${onPdf ? `<button type="button" class="btn btn-primary report-btn"${r.summary.known ? '' : ' disabled'}>Download report for your doctor (PDF)</button>` : ''}
        ${onPdf && r.level === 'incomplete' && r.summary.known ? '<p class="fine-print">The report will say the result is not complete yet. It still lists your answers and measurements.</p>' : ''}
      </section>
    </div>`;
  if (onPdf) root.querySelector('.report-btn').onclick = (e) => onPdf(e.currentTarget);
}
