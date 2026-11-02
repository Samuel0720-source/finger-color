// Guided self-tests for the CTS-6 items a person can do at home:
// Phalen (wrist flexion for 60 s), Tinel (tap over the carpal tunnel), and two-point discrimination (5 mm).
// Each one writes its result into the carpal tunnel answers: 'yes' (positive), 'no', or 'skip'.

const PHALEN_SECONDS = 60;

export function mountGuidedTests(root, { get, set }) {
  root.innerHTML = `
    <article class="guided" id="g-phalen">
      <header><h3>Phalen test</h3><span class="points">5 points if positive</span></header>
      <ol class="how-to">
        <li>Press the backs of both hands together in front of your chest, fingers pointing down.</li>
        <li>Let your wrists bend as far as is comfortable. Hold still.</li>
        <li>Press <b>Tingling started</b> the moment you feel tingling or numbness in your thumb, index, middle or ring finger.</li>
      </ol>
      <div class="timer-row">
        <span class="countdown" id="phalen-clock" aria-live="polite">60</span>
        <button class="btn btn-primary" id="phalen-start">Start 60-second timer</button>
        <button class="btn btn-warm" id="phalen-onset" disabled>Tingling started</button>
      </div>
      <div class="answer-row" role="group" aria-label="Phalen test result">
        <span>Result</span>
        <button class="seg" data-v="yes">Tingling in those fingers</button>
        <button class="seg" data-v="no">Nothing in 60 s</button>
        <button class="seg" data-v="skip">Skip</button>
      </div>
    </article>

    <article class="guided" id="g-tinel">
      <header><h3>Tinel test</h3><span class="points">4 points if positive</span></header>
      <ol class="how-to">
        <li>Turn the affected hand palm up.</li>
        <li>With two fingers of your other hand, tap firmly 6 times on the middle of the wrist crease, just below the palm.</li>
      </ol>
      <div class="answer-row" role="group" aria-label="Tinel test result">
        <span>Did tingling shoot into your thumb, index or middle finger?</span>
        <button class="seg" data-v="yes">Yes</button>
        <button class="seg" data-v="no">No</button>
        <button class="seg" data-v="skip">Skip</button>
      </div>
    </article>

    <article class="guided" id="g-twoPoint">
      <header><h3>Two-point test</h3><span class="points">4.5 points if positive · needs a helper</span></header>
      <ol class="how-to">
        <li>Bend a paper clip so its two tips are 5 mm apart. Check with a ruler.</li>
        <li>Close your eyes. Your helper lightly touches the pad of your index fingertip with either one tip or both tips, in random order, 10 times.</li>
        <li>Each time, say "one" or "two".</li>
      </ol>
      <div class="answer-row" role="group" aria-label="Two-point test result">
        <span>How many of the 10 did you get right?</span>
        <button class="seg" data-v="no">7 or more</button>
        <button class="seg" data-v="yes">6 or fewer</button>
        <button class="seg" data-v="skip">Skip</button>
      </div>
    </article>`;

  for (const id of ['phalen', 'tinel', 'twoPoint']) {
    const card = root.querySelector('#g-' + id);
    card.querySelectorAll('.seg').forEach((b) => {
      b.onclick = () => {
        set(id, b.dataset.v);
        if (id === 'phalen' && b.dataset.v !== 'yes') set('phalenOnset', null);
        sync();
      };
    });
  }

  // Phalen timer
  const clock = root.querySelector('#phalen-clock');
  const btnStart = root.querySelector('#phalen-start');
  const btnOnset = root.querySelector('#phalen-onset');
  let timer = null;
  let started = 0;
  const stopTimer = (msg) => {
    clearInterval(timer);
    timer = null;
    btnStart.textContent = 'Start 60-second timer';
    btnOnset.disabled = true;
    if (msg) clock.textContent = msg;
  };
  btnStart.onclick = () => {
    if (timer) return stopTimer('Stopped');
    started = performance.now();
    btnStart.textContent = 'Stop';
    btnOnset.disabled = false;
    clock.textContent = String(PHALEN_SECONDS);
    timer = setInterval(() => {
      const left = PHALEN_SECONDS - Math.floor((performance.now() - started) / 1000);
      clock.textContent = String(Math.max(0, left));
      if (left <= 0) {
        stopTimer('Done');
        if (get().phalen !== 'yes') {
          set('phalen', 'no');
          sync();
        }
      }
    }, 250);
  };
  btnOnset.onclick = () => {
    const s = Math.max(1, Math.round((performance.now() - started) / 1000));
    set('phalen', 'yes');
    set('phalenOnset', s);
    stopTimer(`${s} s`);
    sync();
  };

  function sync() {
    const a = get();
    for (const id of ['phalen', 'tinel', 'twoPoint']) {
      root.querySelectorAll(`#g-${id} .seg`).forEach((b) => b.setAttribute('aria-pressed', String(a[id] === b.dataset.v)));
      root.querySelector('#g-' + id).dataset.state = a[id] ? 'done' : '';
    }
  }
  sync();
  return { sync };
}
