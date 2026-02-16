const screenLanding = document.getElementById('screen-landing');
const screenPlayers = document.getElementById('screen-players');
const screenGame = document.getElementById('screen-game');
const playersForm = document.getElementById('players-form');
const btnBack = document.getElementById('btn-back');
const btnStart = document.getElementById('btn-start');
const btnGameBack = document.getElementById('btn-game-back');
const btnUndo = document.getElementById('btn-undo');
const btnInstall = document.getElementById('btn-install');
const playersHeader = document.getElementById('players-header');
const roundValue = document.getElementById('round-value');
const throwIndicator = document.getElementById('throw-indicator');
const scoreboardGrid = document.getElementById('scoreboard-grid');
const dartboardSvg = document.getElementById('dartboard');

const DART_SEQUENCE = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const PLAYER_COLORS = ['#ff3b4a', '#0a91ff', '#34c759', '#f59e0b'];
const LIGHT_BOARD = '#a4acb7';
const DARK_BOARD = '#6d7481';
const YELLOW = '#f0e8c0';
const BULL = 'bull';
const MAX_ROUND = 10;
const THROWS_PER_TURN = 3;
const VIEWPORT_SHRINK_FACTOR = 0.96;

let playerCount = 0;
let gameState = null;
const historyStack = [];
const segmentsByTarget = new Map();
const svgNS = 'http://www.w3.org/2000/svg';
let deferredInstallPrompt = null;

function syncViewportHeight() {
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const adjustedHeight = Math.max(260, viewportHeight * VIEWPORT_SHRINK_FACTOR);
  document.documentElement.style.setProperty('--app-height', `${Math.round(adjustedHeight)}px`);
}

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function randShuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cloneGameState(state) {
  return {
    players: state.players.map((player) => ({ ...player })),
    activePlayerIndex: state.activePlayerIndex,
    round: state.round,
    throwsThisTurn: state.throwsThisTurn,
    rows: state.rows.map((row) => ({
      target: row.target,
      revealed: row.revealed,
      ticks: [...row.ticks],
      owner: row.owner,
      closed: row.closed,
    })),
    nonTargetsHit: new Set(state.nonTargetsHit),
  };
}

function labelForTarget(target) {
  return target === BULL ? 'B' : String(target);
}

function buildPlayerForm(count) {
  playerCount = count;
  playersForm.innerHTML = '';

  for (let i = 1; i <= count; i += 1) {
    const row = document.createElement('div');
    row.className = 'player-row';

    const field = document.createElement('div');
    field.className = 'player-field';

    const label = document.createElement('label');
    label.className = 'player-label';
    label.textContent = `Player ${i}`;
    label.htmlFor = `player-${i}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.id = `player-${i}`;
    input.name = `player-${i}`;
    input.placeholder = 'Enter name';
    input.autocomplete = 'off';

    field.appendChild(label);
    field.appendChild(input);

    const checkWrapper = document.createElement('label');
    checkWrapper.className = 'checkbox-wrapper';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox-input';
    checkbox.name = 'first-player';
    checkbox.value = i;

    const checkLabel = document.createElement('span');
    checkLabel.className = 'checkbox-label';
    checkLabel.textContent = 'First?';

    checkWrapper.appendChild(checkbox);
    checkWrapper.appendChild(checkLabel);

    row.appendChild(field);
    row.appendChild(checkWrapper);
    playersForm.appendChild(row);
  }
}

playersForm.addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (!event.target.classList.contains('checkbox-input')) return;
  playersForm.querySelectorAll('.checkbox-input').forEach((cb) => {
    if (cb !== event.target) cb.checked = false;
  });
});

function buildTickStack(count, color) {
  const wrapper = document.createElement('div');
  const clampedCount = Math.min(count, 3);
  wrapper.className = 'tick-stack';
  wrapper.style.color = color;

  const mark = document.createElement('div');
  mark.className = `tick-mark tick-mark-${clampedCount}`;

  const addStroke = (className) => {
    const stroke = document.createElement('span');
    stroke.className = `tick-stroke ${className}`;
    mark.appendChild(stroke);
  };

  if (clampedCount === 1) {
    addStroke('diag-neg center');
  } else if (clampedCount === 2) {
    addStroke('diag-neg center');
    addStroke('diag-pos center');
  } else {
    addStroke('diag-neg center inset');
    addStroke('diag-pos center inset');
  }

  wrapper.appendChild(mark);

  return wrapper;
}

function renderScoreboardHeader() {
  const playerColumnCount = gameState.players.length;
  playersHeader.style.gridTemplateColumns = `repeat(${playerColumnCount}, 1fr)`;
  playersHeader.innerHTML = '';

  gameState.players.forEach((player, idx) => {
    const header = document.createElement('div');
    header.className = 'player-header';
    if (idx === gameState.activePlayerIndex) header.classList.add('active');

    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = player.name;

    const score = document.createElement('div');
    score.className = 'player-score';
    score.textContent = String(player.score);

    header.appendChild(name);
    header.appendChild(score);
    playersHeader.appendChild(header);
  });

  renderThrowIndicator();
  roundValue.textContent = `${gameState.round}/${MAX_ROUND}`;
}

function renderThrowIndicator() {
  if (!throwIndicator) return;

  throwIndicator.innerHTML = '';
  const activeThrowIndex = Math.min(gameState.throwsThisTurn, THROWS_PER_TURN - 1);

  for (let i = 0; i < THROWS_PER_TURN; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'throw-dot';
    if (i < gameState.throwsThisTurn) dot.classList.add('completed');
    if (i === activeThrowIndex) dot.classList.add('active');
    throwIndicator.appendChild(dot);
  }

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  throwIndicator.setAttribute(
    'aria-label',
    `${activePlayer.name} throw ${activeThrowIndex + 1} of ${THROWS_PER_TURN}`,
  );
}

function renderScoreboardGrid() {
  const playerColumnCount = gameState.players.length;
  scoreboardGrid.innerHTML = '';

  gameState.rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'score-row';
    rowEl.style.gridTemplateColumns = `repeat(${playerColumnCount}, 1fr) 1.2fr`;

    gameState.players.forEach((player, playerIndex) => {
      const cell = document.createElement('div');
      cell.className = `player-cell ${playerIndex === 0 ? 'first-player-cell' : ''}`;
      const ticks = row.ticks[playerIndex];
      const ownedByCurrent = row.owner === playerIndex;

      if (ownedByCurrent) {
        cell.dataset.owned = 'true';
      }

      if (ticks > 0) {
        const color = ownedByCurrent ? player.color : player.color;
        cell.appendChild(buildTickStack(ticks, color));
      }

      rowEl.appendChild(cell);
    });

    const numberCell = document.createElement('div');
    numberCell.className = 'number-cell';
    if (row.revealed) {
      numberCell.textContent = labelForTarget(row.target);
    } else {
      numberCell.textContent = '?';
      const banner = document.createElement('div');
      banner.className = 'hidden-banner';
      numberCell.appendChild(banner);
    }
    rowEl.appendChild(numberCell);
    scoreboardGrid.appendChild(rowEl);
  });
}

function setSegmentFill(target, color) {
  const list = segmentsByTarget.get(target);
  if (!list) return;
  list.forEach((segment) => segment.setAttribute('fill', color));
}

function updateBoardColors() {
  DART_SEQUENCE.forEach((n) => setSegmentFill(n, LIGHT_BOARD));
  setSegmentFill(BULL, LIGHT_BOARD);

  gameState.rows.forEach((row) => {
    if (!row.revealed) return;

    if (row.closed || row.owner === null) {
      setSegmentFill(row.target, row.closed ? DARK_BOARD : YELLOW);
    } else {
      setSegmentFill(row.target, gameState.players[row.owner].color);
    }
  });

  gameState.nonTargetsHit.forEach((target) => setSegmentFill(target, DARK_BOARD));
}

function renderGame() {
  renderScoreboardHeader();
  renderScoreboardGrid();
  updateBoardColors();
  btnUndo.disabled = historyStack.length === 0;
}

function updateTurnProgress() {
  gameState.throwsThisTurn += 1;
  if (gameState.throwsThisTurn < THROWS_PER_TURN) return;

  gameState.throwsThisTurn = 0;
  const previousPlayer = gameState.activePlayerIndex;
  gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.players.length;
  if (gameState.activePlayerIndex <= previousPlayer) {
    gameState.round += 1;
  }
}

function checkGameFinished() {
  const allOwnedByOne = gameState.players.some((_, playerIndex) => {
    return gameState.rows.every((row) => row.closed || row.owner === playerIndex);
  });
  return gameState.round > MAX_ROUND || allOwnedByOne;
}

function scoreThrow(row, activePlayerIndex, hitMarks) {
  const marksForThisHit = row.revealed ? hitMarks : hitMarks + 1;
  if (!row.revealed) {
    row.revealed = true;
  }

  if (row.closed) return;

  const current = row.ticks[activePlayerIndex];
  const toClose = Math.max(0, 3 - current);
  const appliedToClose = Math.min(toClose, marksForThisHit);
  const overflowMarks = marksForThisHit - appliedToClose;

  if (appliedToClose > 0) {
    row.ticks[activePlayerIndex] += appliedToClose;
  }

  if (overflowMarks > 0) {
    const opponentsStillOpen = row.ticks.some((tick, i) => i !== activePlayerIndex && tick < 3);
    if (opponentsStillOpen) {
      const baseScore = row.target === BULL ? 25 : Number(row.target);
      gameState.players[activePlayerIndex].score += baseScore * overflowMarks;
    }
  }

  if (row.ticks[activePlayerIndex] === 3) {
    row.owner = activePlayerIndex;
  }

  const everyoneClosed = row.ticks.every((tick) => tick === 3);
  if (everyoneClosed) {
    row.closed = true;
  }
}

function hitTarget(target, hitMarks = 1) {
  if (checkGameFinished()) return;

  historyStack.push(cloneGameState(gameState));

  const row = gameState.rows.find((item) => item.target === target);
  if (!row) {
    gameState.nonTargetsHit.add(target);
    updateTurnProgress();
    renderGame();
    return;
  }

  scoreThrow(row, gameState.activePlayerIndex, hitMarks);
  updateTurnProgress();
  renderGame();
}

function arcPath(startDeg, endDeg, outerR, innerR) {
  const polar = (radius, angleDeg) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: radius * Math.cos(rad), y: radius * Math.sin(rad) };
  };

  const a = polar(outerR, startDeg);
  const b = polar(outerR, endDeg);
  const c = polar(innerR, endDeg);
  const d = polar(innerR, startDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;

  return [
    `M ${a.x} ${a.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${b.x} ${b.y}`,
    `L ${c.x} ${c.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${d.x} ${d.y}`,
    'Z',
  ].join(' ');
}

function buildDartboard() {
  segmentsByTarget.clear();
  dartboardSvg.innerHTML = '';

  const boardBase = document.createElementNS(svgNS, 'circle');
  boardBase.setAttribute('cx', '0');
  boardBase.setAttribute('cy', '0');
  boardBase.setAttribute('r', '215');
  boardBase.setAttribute('fill', '#000000');
  dartboardSvg.appendChild(boardBase);

  const rings = [
    { outer: 195, inner: 175, marks: 2 },
    { outer: 175, inner: 85, marks: 1 },
    { outer: 85, inner: 65, marks: 3 },
    { outer: 65, inner: 15, marks: 1 },
  ];

  const slice = 360 / DART_SEQUENCE.length;
  DART_SEQUENCE.forEach((number, i) => {
    const start = i * slice - slice / 2;
    const end = start + slice;
    rings.forEach((ring) => {
      const segment = document.createElementNS(svgNS, 'path');
      segment.setAttribute('d', arcPath(start, end, ring.outer, ring.inner));
      segment.setAttribute('class', 'dartboard-segment');
      segment.dataset.target = String(number);
      segment.setAttribute('fill', LIGHT_BOARD);
      segment.addEventListener('click', () => hitTarget(number, ring.marks));
      dartboardSvg.appendChild(segment);

      const list = segmentsByTarget.get(number) ?? [];
      list.push(segment);
      segmentsByTarget.set(number, list);
    });

    const angle = (((start + end) / 2) * Math.PI) / 180;
    const textR = 205;
    const tx = textR * Math.sin(angle);
    const ty = -textR * Math.cos(angle);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', tx.toFixed(2));
    label.setAttribute('y', ty.toFixed(2));
    label.setAttribute('class', 'dart-label');
    label.textContent = String(number);
    dartboardSvg.appendChild(label);
  });

  [65, 85, 175, 195].forEach((radius) => {
    const ring = document.createElementNS(svgNS, 'circle');
    ring.setAttribute('cx', '0');
    ring.setAttribute('cy', '0');
    ring.setAttribute('r', String(radius));
    ring.setAttribute('class', 'dartboard-ring');
    dartboardSvg.appendChild(ring);
  });

  const bullOuter = document.createElementNS(svgNS, 'circle');
  bullOuter.setAttribute('cx', '0');
  bullOuter.setAttribute('cy', '0');
  bullOuter.setAttribute('r', '15');
  bullOuter.setAttribute('class', 'dartboard-bull');
  bullOuter.setAttribute('fill', LIGHT_BOARD);
  bullOuter.addEventListener('click', () => hitTarget(BULL));
  dartboardSvg.appendChild(bullOuter);

  const bullInner = document.createElementNS(svgNS, 'circle');
  bullInner.setAttribute('cx', '0');
  bullInner.setAttribute('cy', '0');
  bullInner.setAttribute('r', '9');
  bullInner.setAttribute('class', 'dartboard-bull');
  bullInner.setAttribute('fill', LIGHT_BOARD);
  bullInner.addEventListener('click', () => hitTarget(BULL));
  dartboardSvg.appendChild(bullInner);

  segmentsByTarget.set(BULL, [bullOuter, bullInner]);
}

function startGame(playerNames, firstPlayerIndex) {
  const targetPool = [...DART_SEQUENCE, BULL];
  const targets = randShuffle(targetPool).slice(0, 7);

  gameState = {
    players: playerNames.map((name, idx) => ({
      name,
      color: PLAYER_COLORS[idx],
      score: 0,
    })),
    activePlayerIndex: firstPlayerIndex,
    round: 1,
    throwsThisTurn: 0,
    rows: targets.map((target) => ({
      target,
      revealed: false,
      ticks: Array(playerNames.length).fill(0),
      owner: null,
      closed: false,
    })),
    nonTargetsHit: new Set(),
  };

  historyStack.length = 0;
  buildDartboard();
  renderGame();
  showScreen(screenGame);
}

document.querySelectorAll('.outline-btn[data-players]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const count = Number.parseInt(btn.dataset.players, 10);
    buildPlayerForm(count);
    showScreen(screenPlayers);
  });
});

btnBack.addEventListener('click', () => {
  showScreen(screenLanding);
});

btnStart.addEventListener('click', () => {
  const playerNames = [];
  let firstPlayerIndex = 0;

  for (let i = 1; i <= playerCount; i += 1) {
    const nameInput = document.getElementById(`player-${i}`);
    const fallback = `Name ${i}`;
    const name = nameInput.value.trim() || fallback;
    playerNames.push(name);

    const checkbox = playersForm.querySelector(`.checkbox-input[value="${i}"]`);
    if (checkbox && checkbox.checked) {
      firstPlayerIndex = i - 1;
    }
  }

  startGame(playerNames, firstPlayerIndex);
});

btnGameBack.addEventListener('click', () => {
  showScreen(screenPlayers);
});

btnUndo.addEventListener('click', () => {
  const previous = historyStack.pop();
  if (!previous) return;

  gameState = previous;
  renderGame();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  btnInstall.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  btnInstall.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  btnInstall.classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}

syncViewportHeight();
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewportHeight);
}
