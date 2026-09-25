// The map screen, shown between slots: both lanes' nodes and connectors,
// node states, dev-jump wiring, the Elite/Boss hover text (read from the
// slot's own enemy, never gameState.enemy), and the act background.
// A node click calls run-and-map.js's enterSlot()/chooseLane()/devJumpToSlot().

// D-97: draws art/background_act<N>.png when it exists, hidden otherwise.
function renderActBackground() {
  const img = document.getElementById('actBackgroundImg');
  if (!img) return;
  const src = 'art/background_act' + gameState.run.actNumber + '.png';
  if (img.getAttribute('data-bg-src') !== src) {
    img.setAttribute('data-bg-src', src);
    img.onload = function() { img.style.display = 'block'; };
    img.onerror = function() { img.style.display = 'none'; };
    img.src = src;
  }
}

// Node states: completed (--blank), current (--nat, solid), choice (--nat,
// dashed, the fork's two options), inert (--muted). KI-31: an entered slot
// reads as completed, so a second click cannot enter it again.
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
    existingTip.textContent += ' ' + devText;
  } else {
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    tip.textContent = devText;
    node.appendChild(tip);
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
    if (entry.kind === 'attack') { return 'Attack ' + entry.min + '–' + entry.max; }
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

  // D-98 — the map screen shows the top bar and the map only; the act
  // number already reads on the top bar's own #actStamp.
  const composition = document.createElement('div');
  // D-123: act 1's nine-slot lanes draw with shorter connectors.
  composition.className = 'map-composition' + (gameState.run.act.upper.length > 8 ? ' map-composition-long' : '');

  // START — a marker, not a clickable slot; reads 'current' until the
  // shared opening fight is done and 'completed' once it is.
  const openingSlot = gameState.run.act.opening;
  const startNode = document.createElement('div');
  startNode.className = 'map-node map-start-node ' + (openingSlot.completed ? 'map-node-completed' : 'map-node-current');
  startNode.textContent = 'Start';
  composition.appendChild(startNode);

  // OPENING — the shared fight both lanes pass through before the fork,
  // reusing the plain 'fight' slot type/dispatch exactly like every other
  // fight node (enterSlot('opening', null) mirrors enterSlot('boss', null)).
  const openingConnector = document.createElement('div');
  openingConnector.className = 'map-connector';
  composition.appendChild(openingConnector);

  const openingIsCurrent = gameState.run.currentSlot === 'opening';
  const openingNode = document.createElement('button');
  openingNode.className = 'map-node map-node-opening ' + mapNodeStateClass(openingSlot, openingIsCurrent, false);
  openingNode.textContent = openingSlot.label;
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

      const node = document.createElement('button');
      node.textContent = slot.label;

      // The fork is only a real choice once the shared opening fight is
      // behind the player.
      const isForkChoice = gameState.run.lane === null && index === 0 && openingSlot.completed;
      const cs = gameState.run.currentSlot;
      const isCurrent = cs && cs !== 'boss' && cs.lane === laneName && cs.index === index;

      node.className = 'map-node ' + mapNodeStateClass(slot, isCurrent, isForkChoice);

      // D-98 — the Elite node carries the same summary ELITE PREVIEW/ELITE
      // DIE used to print inline, now a hover-tip instead. Reads the
      // slot's own static enemy, never the live gameState.enemy (that
      // would go stale once any other fight is entered).
      if (slot.label === 'Elite' && slot.enemy) {
        const tip = document.createElement('span');
        tip.className = 'hover-tip';
        tip.textContent = enemyPreviewHoverText(slot.enemy);
        node.appendChild(tip);
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

  const bossBtn = document.createElement('button');
  const bossIsCurrent = gameState.run.currentSlot === 'boss';
  bossBtn.className = 'map-node map-node-boss ' + mapNodeStateClass(gameState.run.act.boss, bossIsCurrent, false);
  bossBtn.textContent = gameState.run.act.boss.label;
  // D-98 — same hover-tip treatment as the Elite node above.
  const bossTip = document.createElement('span');
  bossTip.className = 'hover-tip';
  bossTip.textContent = enemyPreviewHoverText(gameState.run.act.boss.enemy);
  bossBtn.appendChild(bossTip);
  if (bossIsCurrent && !gameState.run.act.boss.entered && !rewardPanelOpen) {
    bossBtn.addEventListener('click', function() { enterSlot('boss', null); });
  } else {
    attachDevJumpIfEligible(bossBtn, 'boss', null, rewardPanelOpen);
  }
  composition.appendChild(bossBtn);

  container.appendChild(composition);
}
