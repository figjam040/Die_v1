// log(), refreshInspector() (the one render entry point, calling the
// render functions in render-fight.js, render-map.js, render-layers.js
// and render-text.js), the registry inspector, the one card
// (renderCard()) and applyScale(). Forward-references dev-tools.js's
// devChromeOpen/forcePlayerRoll/forceEnemyRoll — safe per state.js's
// header note.

// ---------- LOGGING ----------

const LOG_PREFIX_CLASSES = [
  ['[PHASE]', 'log-phase'],
  ['[ROLL]', 'log-roll'],
  ['[MOD]', 'log-mod'],
  ['[CARD]', 'log-card'],
  ['[DRAW]', 'log-draw'],
  ['[START]', 'log-start'],
  ['[END]', 'log-end'],
  ['[LISTENER]', 'log-listener'],
  ['[STATE]', 'log-state'],
  ['[INIT COMPLETE]', 'log-init-complete'],
  ['[INIT]', 'log-init'],
  ['[ENEMY]', 'log-enemy'],
  ['[POISON]', 'log-poison'],
  ['[WIN]', 'log-win'],
  ['[LOSS]', 'log-loss'],
  ['[CLICK]', 'log-click'],
  ['[DEV]', 'log-dev']
];

function log(message) {
  const logEl = document.getElementById('log');
  const entry = document.createElement('div');
  entry.textContent = message;

  let matchedClass = 'log-default';
  for (let i = 0; i < LOG_PREFIX_CLASSES.length; i++) {
    if (message.indexOf(LOG_PREFIX_CLASSES[i][0]) === 0) {
      matchedClass = LOG_PREFIX_CLASSES[i][1];
      break;
    }
  }
  entry.className = matchedClass;

  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;

  if (message === '[PHASE] START_OF_TURN') {
    resetRollHero();
  } else if (message.indexOf('[ROLL] face: ') === 0) {
    const match = message.match(/^\[ROLL\] face: (\d+) modId: (.+)$/);
    if (match) { renderRollResult(match[1], match[2]); }
  } else if (message.indexOf('[CARD] played ') === 0) {
    const cardMatch = message.match(/^\[CARD\] played (.+) \(cost \d+\)$/);
    if (cardMatch) { triggerCardFx(cardMatch[1]); }
  } else if (message.indexOf('[MOD] ') === 0) {
    noteRollHeroValue(message);
  }
}

// ---------- STATE INSPECTOR ----------

function refreshInspector() {
  const contentEl = document.getElementById('inspectorContent');
  if (!contentEl) return;
  contentEl.textContent = JSON.stringify(gameState, null, 2);
  // Before any face row renders, so a fresh roll is held back from the
  // row on the very render that first sees it (D-107).
  noteDieRollsForAnimation();
  const actStampEl = document.getElementById('actStamp');
  if (actStampEl) { actStampEl.textContent = 'ACT ' + gameState.run.actNumber; }
  const appEl = document.querySelector('.app');
  const logToggleBtn = document.getElementById('logToggleBtn');
  if (appEl && logToggleBtn) {
    appEl.classList.toggle('log-open', gameState.ui.logOpen);
    logToggleBtn.textContent = gameState.ui.logOpen ? 'LOG ▾' : 'LOG ▸';
  }
  const logEl = document.getElementById('log');
  const logViewToggleBtn = document.getElementById('logViewToggleBtn');
  const logCloseBtn = document.getElementById('logCloseBtn');
  if (logEl && logViewToggleBtn) {
    logEl.classList.toggle('log-view-all', gameState.ui.logView === 'all');
    logViewToggleBtn.textContent = gameState.ui.logView === 'all' ? 'LOG: ALL' : 'LOG: PLAY';
  }
  if (logCloseBtn) { logCloseBtn.style.display = gameState.ui.logOpen ? 'inline-block' : 'none'; }
  renderRegistryInspector();
  renderStats();
  renderCardButtons();
  // the fight's own face row is the only face row on screen:
  // a die-action face-picking step wires directly onto it (no second row),
  // so its own pickConfig disables the dev force-roll click for that render.
  const playerDiePickConfig = currentPlayerDiePickConfig();
  renderDieList('playerDieList', gameState.die.faces, playerDiePickConfig ? null : forcePlayerRoll, playerDiePickConfig);
  const enemyTitleEl = document.getElementById('enemyPanelTitle');
  if (enemyTitleEl) {
    if (gameState.enemy.id === 'Boss') {
      enemyTitleEl.textContent = 'BOSS ☠';
    } else if (gameState.enemy.id === 'Elite') {
      enemyTitleEl.textContent = 'ELITE ★';
    } else {
      enemyTitleEl.textContent = 'ENEMY';
    }
  }
  // D-103 — the enemy's own face row under its art; a dieless enemy's
  // empty row collapses by CSS (:empty).
  const enemyFaces = gameState.enemy.hasDie ? gameState.enemy.die.faces : [];
  document.getElementById('enemyDieList').classList.toggle('enemy-face-row-d20', enemyFaces.length > GAME_CONFIG.DIE_SIZE.ELITE);
  renderDieList('enemyDieList', enemyFaces, forceEnemyRoll, null, gameState.enemy.buffPoisonStacks, gameState.enemy.name, gameState.enemy.wrathPerTrigger);
  renderDieIcons();
  renderArtBoxes();
  renderActBackground();
  renderTopBarTokens();
  renderThirdEyeButton();
  renderPhaseBadge();
  renderResultBanner();
  renderDieActionPanel();
  renderCardRewardPanel();
  renderArtifactRewardPanel();
  renderRiteScreen();
  renderEventScreen();
  renderShopPanel();
  renderMapScreen();
  renderInfoLayers();

  // the reward layer (die action/card/artifact/shop/The Font/the rite)
  // always shows over the fight screen, even when it was opened from the
  // map (a rite, its shop, an elite's artifact reward, The Font): the fight
  // screen carries the one face row these all share (D-116).
  const rewardLayerActive = dieActionStep !== null || cardRewardStep !== null ||
    artifactRewardStep !== null || shopStep !== null || eventStep !== null || riteStep !== null;
  document.getElementById('fightScreen').style.display = (gameState.run.screen === 'fight' || rewardLayerActive) ? 'flex' : 'none';
  document.getElementById('fightScreen').classList.toggle('reward-layer-active', rewardLayerActive);
  document.getElementById('mapScreen').style.display = (gameState.run.screen === 'map' && !rewardLayerActive) ? 'flex' : 'none';

  document.getElementById('devNextPhaseBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active');
  document.getElementById('devBeginRollBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active' && gameState.turn.phase === 'START_OF_TURN');
  document.getElementById('devRestartFightBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active' && gameState.run.outcome === 'active');
  document.getElementById('devSkipToDieActionBtn').disabled = !(gameState.run.status === 'active' && gameState.run.outcome === 'active');
  document.getElementById('devSkipToArtifactRewardBtn').disabled = !(gameState.run.status === 'active' && gameState.run.outcome === 'active');
  renderDevCardOptions();
  document.getElementById('endTurnBtn').disabled = !(gameState.run.status === 'active' && gameState.turn.phase === 'CARD_PHASE' && dieActionStep === null && cardRewardStep === null && riteStep === null && artifactRewardStep === null && shopStep === null);
  // End Turn belongs to the fight screen only — hidden entirely on the
  // map, not just disabled-but-visible.
  document.getElementById('endTurnBtn').style.display = (gameState.run.screen === 'fight') ? '' : 'none';
  // New Run works at any time, including while a panel is open — the
  // click handler dismisses it before resetting, so it isn't gated on
  // dieActionStep/cardRewardStep/riteStep the way endTurnBtn is.
  document.getElementById('startGameBtn').disabled = false;
  // A re-render replaces the hovered element's tip with a fresh, unshifted one.
  clampHoverTips();
}

// The listener registry inspector. Read-only — only reads
// gameState.registry.listeners and writes DOM text. Grouped by hook, then
// within each hook by clearOn ('permanent' first, then 'turn').
function renderRegistryInspector() {
  const contentEl = document.getElementById('registryInspectorContent');
  if (!contentEl) return;
  const hooks = Object.keys(gameState.registry.listeners);
  if (hooks.length === 0) {
    contentEl.innerHTML = '<div class="registry-empty">no hooks registered</div>';
    return;
  }
  const html = hooks.map(function(hook) {
    const listeners = gameState.registry.listeners[hook];
    const permanent = listeners.filter(function(l) { return l.clearOn === 'permanent'; });
    const turn = listeners.filter(function(l) { return l.clearOn === 'turn'; });
    const other = listeners.filter(function(l) { return l.clearOn !== 'permanent' && l.clearOn !== 'turn'; });
    function idList(group) {
      return group.length
        ? group.map(function(l) { return '<div class="registry-listener-id">' + l.id + '</div>'; }).join('')
        : '<div class="registry-listener-id registry-empty">(none)</div>';
    }
    return '<div class="registry-hook-group">' +
      '<div class="registry-hook-name">' + hook + ' (' + listeners.length + ')</div>' +
      '<div class="registry-clear-group">permanent (' + permanent.length + ')' + idList(permanent) + '</div>' +
      '<div class="registry-clear-group">turn (' + turn.length + ')' + idList(turn) + '</div>' +
      (other.length ? '<div class="registry-clear-group">other/unrecognised clearOn (' + other.length + ')' + idList(other) + '</div>' : '') +
      '</div>';
  }).join('');
  contentEl.innerHTML = html;
}

// ---------- THE ONE CARD (D-112) ----------
// Every card the player sees — hand, card reward, shop, CARDS layer, both
// removal pickers — is renderCard() at one of three sizes: 'offer', 'hand',
// 'mini'. A 2 px border and the rarity line in its tier's colour (D-111),
// the soul cost as filled dots top right (none at zero cost), never a cost
// in the name. The Ring 0 cards carry no tier and read basic.

function cardTier(card) {
  return (card && card.tier) || 'basic';
}

// opts: { size, button, footText, disabled, unaffordable, count, onClick }.
// onClick runs through offerCardHandleClick() (D-106) except on the hand,
// where a play is immediate.
function renderCard(cardId, opts) {
  const card = gameState.config.cardPool[cardId] || getCard(cardId);
  const size = opts.size || 'offer';
  const tier = cardTier(card);
  const colour = GAME_CONFIG.TIER_COLOURS[tier];
  const text = getCardEffectText(cardId);

  const el = document.createElement(opts.button ? 'button' : 'div');
  el.className = 'offer-card offer-card-' + size + (size === 'hand' ? ' hand-card-el' : '') +
    (opts.disabled ? ' offer-card-disabled' : '') + (opts.unaffordable ? ' unaffordable' : '');
  el.dataset.offerId = cardId;
  el.dataset.tier = tier;
  el.style.borderColor = colour;
  setHoverTip(el, card.name + ' — ' + text);

  const cost = document.createElement('div');
  cost.className = 'offer-card-cost';
  for (let i = 0; i < getCardCost(card); i++) {
    const dot = document.createElement('span');
    dot.className = 'offer-card-dot';
    cost.appendChild(dot);
  }
  el.appendChild(cost);

  if (opts.count > 1) {
    const count = document.createElement('span');
    count.className = 'offer-card-count';
    count.textContent = '×' + opts.count;
    el.appendChild(count);
  }

  const name = document.createElement('div');
  name.className = 'offer-card-name';
  name.textContent = card.name;
  el.appendChild(name);

  const tierLine = document.createElement('div');
  tierLine.className = 'offer-card-tier';
  tierLine.textContent = tier.toUpperCase();
  tierLine.style.color = colour;
  el.appendChild(tierLine);

  const art = document.createElement('div');
  art.className = 'offer-card-art';
  if (size === 'offer') {
    const label = document.createElement('span');
    label.className = 'offer-card-art-label';
    label.textContent = card.name.toUpperCase() + ' ART';
    art.appendChild(label);
    attachCardArtImg(art, cardId).addEventListener('load', function() { label.style.display = 'none'; });
  } else {
    attachCardArtImg(art, cardId);
  }
  el.appendChild(art);

  const tag = document.createElement('div');
  tag.className = 'offer-card-tag';
  tag.textContent = offerTagText(card.tags);
  el.appendChild(tag);

  const textEl = document.createElement('div');
  textEl.className = 'offer-card-text';
  textEl.textContent = text;
  el.appendChild(textEl);

  if (opts.footText) {
    const foot = document.createElement('div');
    foot.className = 'offer-card-foot';
    foot.textContent = opts.footText;
    el.appendChild(foot);
  }

  if (opts.onClick && !opts.disabled) {
    el.addEventListener('click', size === 'hand' ? opts.onClick : function() { offerCardHandleClick(el, opts.onClick); });
  } else if (!opts.onClick) {
    el.style.cursor = 'default';
  }
  return el;
}

// A card offer's spec (offerCardSpecForCard()) drawn as the one card.
function renderOfferCard(spec) {
  return renderCard(spec.id, { size: 'offer', footText: spec.footText, disabled: spec.disabled, onClick: spec.onClick });
}

// The owned deck as one card per distinct id, each with its copy count —
// the removal pickers and the CARDS layer. onPick gets the id's first index
// in ownedCards, the same copy a list of every copy would remove first.
function renderOwnedCardGrid(onPick) {
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  const owned = gameState.player.ownedCards;
  const ids = [];
  owned.forEach(function(id) { if (ids.indexOf(id) === -1) ids.push(id); });
  ids.forEach(function(id) {
    const count = owned.filter(function(o) { return o === id; }).length;
    grid.appendChild(renderCard(id, {
      size: 'mini',
      count: count,
      onClick: onPick ? function() { log('[CLICK] ' + getCard(id).name); onPick(owned.indexOf(id)); } : null
    }));
  });
  return grid;
}

// Fits the fight/map screen to the window: shrinks below the 1600x900
// design size, grows above it, capped at 2x so a very large monitor
// doesn't blow up text past readable size.
function applyScale() {
  const scale = Math.min(2, Math.max(1, 1.1 * Math.min(window.innerWidth / 1600, window.innerHeight / 900)));
  document.documentElement.style.zoom = String(scale);
}
