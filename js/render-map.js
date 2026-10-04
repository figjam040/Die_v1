// The map screen, shown between slots: both lanes' nodes and connectors,
// node states, dev-jump wiring, the Elite/Boss hover text (read from the
// slot's own enemy, never gameState.enemy), and the act background.
// A node click calls run-and-map.js's enterSlot()/chooseLane()/devJumpToSlot().

// D-97, D-159: draws art/background_act<N>.png when it exists, hidden
// otherwise; when art/background_act<N>_motion.js exists too, the moving
// canvas takes over from the still.
function renderActBackground() {
  const img = document.getElementById('actBackgroundImg');
  const canvas = document.getElementById('actBackgroundCanvas');
  if (!img || !canvas) return;
  const name = 'act' + gameState.run.actNumber;
  const src = 'art/background_' + name + '.png';
  if (img.getAttribute('data-bg-src') !== src) {
    img.setAttribute('data-bg-src', src);
    canvas.style.display = 'none';
    backdropMotionStop(canvas);
    img.onload = function() {
      img.style.display = 'block';
      backdropMotionStart(name, canvas,
        function() { canvas.style.display = 'block'; img.style.display = 'none'; },
        function() { canvas.style.display = 'none'; });
    };
    img.onerror = function() { img.style.display = 'none'; };
    img.src = src;
  }
}

// D-156: every map node is a small door, its icon by slot label; the Boss
// door is the larger one. The state class colours outer, icon and label.
const MAP_DOOR_ICONS = {
  Start: 'M24 12 L36 24 L24 36 L12 24 Z',
  Fight: 'M10 38 L36 12 M28 10 H38 V20 M38 38 L12 12 M10 20 V10 H20 M8 32 L16 40 M40 32 L32 40',
  Rite: 'M24 4 L30 14 L24 20 L18 14 Z M17 24 H31 V42 H17 Z M11 42 H37',
  Elite: 'M8 36 V14 L17 24 L24 8 L31 24 L40 14 V36 Z M8 42 H40',
  Anomaly: 'M4 24 L24 10 L44 24 L24 38 Z M20 20 H28 V28 H20 Z',
  Boss: 'M12 8 H36 V28 H31 V40 H17 V28 H12 Z M17 16 H22 V21 H17 Z M26 16 H31 V21 H26 Z M22 34 V40 M26 34 V40'
};

function mapDoorNode(tag, label, className) {
  const node = document.createElement(tag);
  node.className = className;
  node.dataset.kind = label;
  const px = label === 'Boss' ? 60 : 44;
  node.innerHTML = '<span class="map-door-outer"></span><span class="map-door-inner">' +
    '<svg class="map-door-icon" width="' + px + '" height="' + px + '" viewBox="0 0 48 48" fill="none" stroke="currentColor"' +
    ' stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"><path d="' + MAP_DOOR_ICONS[label] + '"/></svg>' +
    '<span class="map-door-label">' + label + '</span></span>';
  return node;
}

// Node states: completed, current and choice (the doors that can be
// clicked now; choice is the fork's two options), inert. KI-31: an entered
// slot reads as completed, so a second click cannot enter it again.
function mapNodeStateClass(slot, isCurrent, isChoice) {
  if (isCurrent && !slot.entered) { return 'map-node-current'; }
  if (isChoice) { return 'map-node-choice'; }
  if (slot.completed || slot.entered) { return 'map-node-completed'; }
  return 'map-node-inert';
}

// Dev-jump on a node that is not the real click target; inert once the run
// ends or while a reward panel sits over the map (KI-31).
function attachDevJumpIfEligible(node, laneName, index, rewardPanelOpen) {
  // Lives outside #devChrome, so a closed dev chrome disables these nodes directly.
  if (!devChromeOpen || gameState.run.outcome !== 'active' || rewardPanelOpen) {
    node.disabled = true;
    return;
  }
  node.disabled = false;
  node.classList.add('map-node-dev-jump');
  const devText = 'Dev: jump here — skips earlier slots, grants no rewards';
  // The Elite/Boss node may already carry its own preview hover-tip
  // (enemyPreviewHoverText()) — append to it rather than laying a second
  // absolutely positioned tip over the same spot.
  const existingTip = node.querySelector('.hover-tip');
  if (existingTip) {
    existingTip.appendChild(fillSentenceLines(document.createElement('div'), devText));
  } else {
    setHoverTip(node, devText);
  }
  node.addEventListener('click', function() { devJumpToSlot(laneName, index); });
}

// A lane reads committed (--nat), abandoned (--muted) or, before a pick, neutral.
function mapLaneStateClass(laneName) {
  if (gameState.run.lane === null) { return ''; }
  return (gameState.run.lane === laneName) ? 'map-lane-committed' : 'map-lane-abandoned';
}

// Names an enemy's pattern in plain words (e.g. "Attack 13–17, Afflict 4,
// Charge 27"). A Charge shows only its release value — the wind-up round
// deals no damage.
function formatPatternWords(pattern) {
  return pattern.map(function(entry) {
    if (entry.kind === 'attack') { return 'Attack ' + (entry.min === entry.max ? entry.min : entry.min + '–' + entry.max); }
    if (entry.kind === 'charge') { return 'Charge ' + entry.release; }
    if (entry.kind === 'afflict') { return 'Afflict ' + entry.stacks; }
    return '';
  }).join(', ');
}

// D-98: the Elite/Boss node's hover text, faces named as renderStats() names them.
function enemyPreviewHoverText(enemy) {
  const loaded = enemy.die.faces
    .filter(function(f) { return f.modId !== null; })
    .map(function(f) { return modDisplayName(f.modId) + ' ' + f.number; });
  return enemy.name + ' — HP ' + enemy.hp + '. ' + formatPatternWords(enemy.pattern) +
    '. Loaded: ' + (loaded.length ? loaded.join(', ') : 'none') + '.';
}

function renderMapScreen() {
  const container = document.getElementById('mapScreen');
  if (!container) return;
  // startNewRun() calls several state helpers (each of which triggers its
  // own refreshInspector()) before it finally sets gameState.run.act itself
  // — guard against rendering mid-setup, same early-return shape
  // renderDieList() already uses for its own not-ready-yet case.
  if (!gameState.run.act) { container.innerHTML = ''; return; }
  container.innerHTML = '';

  // KI-31: while any of these sits over the map, no node accepts a click —
  // otherwise the still-current node underneath (a Rite mid-panel, most of
  // all) can be entered a second time.
  const rewardPanelOpen = dieActionStep !== null || cardRewardStep !== null
    || artifactRewardStep !== null || shopStep !== null || riteStep !== null || eventStep !== null;

  // D-156 — the title Act N over the map; while the lane choice is open,
  // the two lines under it.
  const openingSlot = gameState.run.act.opening;
  const title = document.createElement('div');
  title.className = 'map-title';
  title.textContent = 'Act ' + gameState.run.actNumber;
  container.appendChild(title);
  if (gameState.run.lane === null && openingSlot.completed) {
    container.appendChild(screenSubLines('The road splits. Choose a door.'));
  }

  const composition = document.createElement('div');
  composition.className = 'map-composition';

  // START — a marker, not a clickable slot; reads 'current' until the
  // shared opening fight is done and 'completed' once it is.
  const startNode = mapDoorNode('div', 'Start', 'map-node map-start-node ' + (openingSlot.completed ? 'map-node-completed' : 'map-node-current'));
  composition.appendChild(startNode);

  // OPENING — the shared fight both lanes pass through before the fork,
  // reusing the plain 'fight' slot type/dispatch exactly like every other
  // fight node (enterSlot('opening', null) mirrors enterSlot('boss', null)).
  const openingConnector = document.createElement('div');
  openingConnector.className = 'map-connector';
  composition.appendChild(openingConnector);

  const openingIsCurrent = gameState.run.currentSlot === 'opening';
  const openingNode = mapDoorNode('button', openingSlot.label, 'map-node map-node-opening ' + mapNodeStateClass(openingSlot, openingIsCurrent, false));
  if (openingIsCurrent && !openingSlot.entered && !rewardPanelOpen) {
    openingNode.addEventListener('click', function() { enterSlot('opening', null); });
  } else {
    attachDevJumpIfEligible(openingNode, 'opening', null, rewardPanelOpen);
  }
  composition.appendChild(openingNode);

  const fork = document.createElement('div');
  fork.className = 'map-fork';
  composition.appendChild(fork);

  const lanesWrap = document.createElement('div');
  lanesWrap.className = 'map-lanes';

  ['upper', 'lower'].forEach(function(laneName) {
    const laneRow = document.createElement('div');
    const laneStateClass = mapLaneStateClass(laneName);
    laneRow.className = 'map-lane' + (laneStateClass ? ' ' + laneStateClass : '');

    gameState.run.act[laneName].forEach(function(slot, index) {
      if (index > 0) {
        const connector = document.createElement('div');
        connector.className = 'map-connector' + (laneStateClass ? ' ' + (laneStateClass === 'map-lane-committed' ? 'map-connector-committed' : 'map-connector-abandoned') : '');
        laneRow.appendChild(connector);
      }

      // The fork is only a real choice once the shared opening fight is
      // behind the player.
      const isForkChoice = gameState.run.lane === null && index === 0 && openingSlot.completed;
      const cs = gameState.run.currentSlot;
      const isCurrent = cs && cs !== 'boss' && cs.lane === laneName && cs.index === index;

      const node = mapDoorNode('button', slot.label, 'map-node ' + mapNodeStateClass(slot, isCurrent, isForkChoice));

      // D-98 — the Elite node carries the same summary ELITE PREVIEW/ELITE
      // DIE used to print inline, now a hover-tip instead. Reads the
      // slot's own static enemy, never the live gameState.enemy (that
      // would go stale once any other fight is entered).
      if (slot.label === 'Elite' && slot.enemy) {
        setHoverTip(node, enemyPreviewHoverText(slot.enemy));
      }

      if ((isCurrent || isForkChoice) && !slot.entered && !rewardPanelOpen) {
        node.addEventListener('click', function() {
          // A single click at the divergence both picks the lane and
          // enters that lane's first slot — there is no separate
          // "confirm the lane" step, since the two lanes' first slots are
          // the only choice a fork click could ever mean.
          if (isForkChoice) { chooseLane(laneName); enterSlot(laneName, index); }
          else { enterSlot(laneName, index); }
        });
      } else {
        attachDevJumpIfEligible(node, laneName, index, rewardPanelOpen);
      }

      laneRow.appendChild(node);
    });

    lanesWrap.appendChild(laneRow);
  });

  composition.appendChild(lanesWrap);

  const merge = document.createElement('div');
  merge.className = 'map-merge';
  composition.appendChild(merge);

  const bossIsCurrent = gameState.run.currentSlot === 'boss';
  const bossBtn = mapDoorNode('button', gameState.run.act.boss.label,
    'map-node map-node-boss ' + mapNodeStateClass(gameState.run.act.boss, bossIsCurrent, false));
  // D-98 — same hover-tip treatment as the Elite node above.
  setHoverTip(bossBtn, enemyPreviewHoverText(gameState.run.act.boss.enemy));
  if (bossIsCurrent && !gameState.run.act.boss.entered && !rewardPanelOpen) {
    bossBtn.addEventListener('click', function() { enterSlot('boss', null); });
  } else {
    attachDevJumpIfEligible(bossBtn, 'boss', null, rewardPanelOpen);
  }
  composition.appendChild(bossBtn);

  container.appendChild(composition);
  if (hasArtifact('third_eye')) { container.appendChild(buildThirdEyeMapIcon()); }
}
