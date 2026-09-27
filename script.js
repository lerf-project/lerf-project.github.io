const dialog = document.querySelector('#figure-dialog');
const zoomImage = document.querySelector('#zoom-image');
for (const link of document.querySelectorAll('[data-zoom]')) {
  link.addEventListener('click', event => {
    if (!dialog.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    zoomImage.src = link.href;
    zoomImage.alt = link.querySelector('img').alt;
    dialog.showModal();
  });
}
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }
});

// An explanatory replay of three examples from the paper, not live inference.
const examples = {
  allo: {
    referenceObject: 'the little girl',
    image: 'assets/allocentric.png', alt: 'A girl in an armchair, with a teddy bear on the left of the image.',
    question: 'Where is the teddy bear from the little girl’s perspective?',
    input: 'The requested viewpoint is the little girl’s.',
    decision: 'Ground the girl and invoke the renderer.',
    render: 'Make her front, left, and up directions visible.',
    reasoning: 'The bear is opposite the girl’s left axis.',
    answer: 'Answer: Right — from the little girl’s perspective.',
    origin: [511, 590], front: [545, 626], left: [808, 571], up: [495, 292],
    labels: [[552, 682], [820, 553], [512, 278]]
  },
  hypo: {
    referenceObject: 'hypothetical man on sofa',
    image: 'assets/hypothetical.png', alt: 'A dining room with a sofa at the right and a door at the back.',
    question: 'If you’re seated on the sofa, where is the door?',
    input: 'Imagine an observer seated on the sofa.',
    decision: 'Establish the imagined observer’s reference frame.',
    render: 'Draw axes at the imagined observer’s location.',
    reasoning: 'The door lies toward the observer’s right.',
    answer: 'Answer: Right — from the imagined seated viewpoint.',
    origin: [844, 581], front: [763, 601], left: [992, 615], up: [867, 361],
    labels: [[713, 649], [898, 666], [887, 350]]
  },
  ego: {
    image: 'assets/egocentric.png', alt: 'A robot and a girl reaching toward each other, with the robot’s hand lower in the image.',
    question: 'Is the robot’s hand above or below the little girl’s hand?',
    input: 'The question uses the camera’s viewpoint.',
    decision: 'Select NO_TOOL_CALL: no viewpoint shift is needed.',
    render: 'Bypass the renderer and keep the original image.',
    reasoning: 'Compare the hands directly in the image.',
    answer: 'Answer: Below — in the camera’s frame.'
  }
};
const demo = document.querySelector('.demo');
const stepButtons = [...document.querySelectorAll('button[data-step]')];
const caseButtons = [...document.querySelectorAll('button[data-case]')];
const playButton = document.querySelector('#play-demo');
const progress = document.querySelector('#demo-progress');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let selectedCase = 'allo';
let step = 0;
let playing = false;
let timer;
let demoVisible = false;
const caseOrder = ['allo', 'hypo', 'ego'];
// Preload the next scenes so transitions never reveal an empty image.
Object.values(examples).forEach(example => { const image = new Image(); image.src = example.image; });
function pause() {
  playing = false;
  clearTimeout(timer);
  demo.dataset.playing = 'false';
  playButton.textContent = '▶ Play';
  playButton.setAttribute('aria-label', 'Play demonstration');
}
function renderToolCall(example) {
  const output = document.querySelector('#tool-call-output');
  const pending = document.querySelector('#tool-call-pending');
  const code = document.querySelector('#tool-call-code');
  const note = document.querySelector('#tool-call-note');
  output.hidden = step === 0;
  pending.hidden = step !== 0;
  if (step === 0) {
    code.textContent = '';
    note.textContent = 'Predicted coordinates will be passed to the renderer.';
    return;
  }
  if (selectedCase === 'ego') {
    code.textContent = 'NO_TOOL_CALL';
    note.textContent = 'The camera-relative question is answered from the original image.';
    return;
  }
  const parameters = [
    ['reference_object', example.referenceObject],
    ['origin', `[${example.origin.join(', ')}]`],
    ['axis_up', `[${example.up.join(', ')}]`],
    ['axis_front', `[${example.front.join(', ')}]`],
    ['axis_left', `[${example.left.join(', ')}]`]
  ];
  code.textContent = ['<tool_call>', '<function=draw_reference_frame>',
    ...parameters.flatMap(([name, value]) => [`<parameter=${name}>`, value, '</parameter>']),
    '</function>', '</tool_call>'].join('\n');
  note.textContent = step === 3
    ? 'Shown here for inspection. The reasoning turn sees the rendered image, with numerical coordinates hidden.'
    : 'The renderer overlays these predicted axes on the original image.';
}
function renderStep(next) {
  step = next;
  demo.dataset.step = String(step);
  progress.value = String(step);
  progress.setAttribute('aria-valuetext', `Step ${step + 1}: ${stepButtons[step].querySelector('strong').textContent}`);
  document.querySelector('#step-count').textContent = `${step + 1} / 4`;
  stepButtons.forEach((button, i) => {
    button.parentElement.classList.toggle('current', i === step);
    button.parentElement.classList.toggle('complete', i < step);
    if (i === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  const example = examples[selectedCase];
  renderToolCall(example);
  document.querySelector('#scene-tag').textContent = selectedCase === 'ego'
    ? (step >= 1 ? 'Original image · no tool call' : 'Original image')
    : ['Original image', 'Predicted origin', 'Rendered reference frame', 'Reasoning with visual cues'][step];
  document.querySelector('#demo-answer').textContent = step === 3 ? example.answer : 'Follow the steps to see the answer.';
  document.querySelector('#frame-overlay').setAttribute('aria-hidden', String(selectedCase === 'ego' || step < 1));
  if (!playing) pause();
}
function changeCase(key) {
  clearTimeout(timer);
  selectedCase = key;
  const example = examples[key];
  demo.dataset.case = key;
  caseButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.case === key)));
  const img = document.querySelector('#scene-image');
  img.src = example.image;
  img.alt = example.alt;
  document.querySelector('#demo-question').textContent = example.question;
  document.querySelector('#stage-input').textContent = example.input;
  document.querySelector('#stage-decision').textContent = example.decision;
  document.querySelector('#stage-render').textContent = example.render;
  document.querySelector('#stage-answer').textContent = example.reasoning;
  document.querySelector('#render-heading').textContent = key === 'ego' ? 'Skip frame rendering' : 'Render the predicted axes';
  document.querySelectorAll('.axis-key > span').forEach((el, i) => { el.hidden = i === 3 ? key !== 'ego' : key === 'ego'; });
  if (key !== 'ego') {
    for (const id of ['origin-dot', 'origin-halo']) {
      document.getElementById(id).setAttribute('cx', example.origin[0]);
      document.getElementById(id).setAttribute('cy', example.origin[1]);
    }
    ['front', 'left', 'up'].forEach((axis, i) => {
      document.getElementById(`axis-${axis}`).setAttribute('d', `M${example.origin.join(' ')}L${example[axis].join(' ')}`);
      const label = document.getElementById(`label-${axis}`);
      label.setAttribute('x', example.labels[i][0]);
      label.setAttribute('y', example.labels[i][1]);
    });
  }
  renderStep(0);
  if (playing) scheduleNext();
}
function scheduleNext() {
  clearTimeout(timer);
  if (!playing || !demoVisible || document.hidden) return;
  timer = setTimeout(() => {
    if (!playing || !demoVisible || document.hidden) return;
    if (step < 3) {
      renderStep(step + 1);
      scheduleNext();
    } else {
      changeCase(caseOrder[(caseOrder.indexOf(selectedCase) + 1) % caseOrder.length]);
    }
  }, step === 3 ? 3200 : 2300);
}
function play() {
  if (playing) return pause();
  playing = true;
  demo.dataset.playing = 'true';
  playButton.textContent = 'Ⅱ Pause';
  playButton.setAttribute('aria-label', 'Pause demonstration');
  scheduleNext();
}
caseButtons.forEach(button => button.addEventListener('click', () => changeCase(button.dataset.case)));
stepButtons.forEach(button => button.addEventListener('click', () => { pause(); renderStep(Number(button.dataset.step)); }));
progress.addEventListener('input', () => { pause(); renderStep(Number(progress.value)); });
playButton.addEventListener('click', play);
document.querySelector('#restart-demo').addEventListener('click', () => { renderStep(0); if (playing) scheduleNext(); });
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  demo.classList.toggle('motion-suspended', document.hidden || !demoVisible);
  if (!document.hidden) scheduleNext();
});
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) pause(); });
// Start the loop on first view. Suspend offscreen without losing an explicit pause.
let introduced = false;
const observer = new IntersectionObserver(entries => {
  demoVisible = entries[0].isIntersecting;
  demo.classList.toggle('motion-suspended', !demoVisible || document.hidden);
  if (!demoVisible) clearTimeout(timer);
  else if (!introduced) {
    introduced = true;
    if (!reducedMotion.matches) play();
  } else scheduleNext();
}, { threshold: 0.2 });
changeCase('allo');
observer.observe(demo);
