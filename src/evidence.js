// "What has been tested so far": the numbers from the validation pilot, read from the same
// results.json that the analysis script writes. Nothing here is typed by hand, so the page cannot
// drift away from the report. Rules that are not met are shown as not met.

import results from '../docs/validation/report-02-pilot/data/trigger/results.json';

// Plain-language names for the pass rules in the protocol (VP-TF-001).
const RULES = {
  'AC-1': 'On average, the app angle is within 5° of a goniometer',
  'AC-2': '95% of angle readings are within 15° of a goniometer',
  'AC-3': 'The same hand gives the same reading on different days',
  'AC-4': 'Finds at least 80% of deliberate catches',
  'AC-5': 'Flags no more than 10% of smooth fists',
  'AC-6': 'Fewer than 1 in 5 test runs fail to score',
};
const STATE = { true: ['Met so far', 'ev-yes'], false: ['Not met yet', 'ev-no'], null: ['Not measured yet', 'ev-na'] };

export function mountEvidence(root) {
  if (!root || !results?.checks) return;
  const c = results.counts || {};
  const rows = Object.entries(results.checks)
    .map(([id, x]) => {
      const [word, cls] = STATE[String(x.pass)];
      return `<tr><th scope="row">${RULES[id] || x.rule}</th><td>${x.result}</td><td><span class="ev-state ${cls}">${word}</span></td></tr>`;
    })
    .join('');
  root.innerHTML = `
    <h3>What has been tested so far</h3>
    <p>Trigger finger test, pilot: ${c.people} healthy volunteers (one is the author), ${c.pairs} angle readings compared with a goniometer, and ${c.runs} test runs. The rules below were written down before any data was collected. This is far too few people to prove the test works; it shows where it stands and what still fails.</p>
    <div class="table-scroll"><table class="data-table evidence-table">
      <thead><tr><th>Rule set in advance</th><th>Result so far</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="fine-print">The known weak spot: with the palm toward the camera, a fully straight finger reads about 20° more bent than it is, which is why the second rule is not met. Raynaud's and carpal tunnel have not been measured on people yet, and no test here has been tried on patients.</p>`;
}
