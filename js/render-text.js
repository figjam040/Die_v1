// Hover boxes and their clamp, face hover text, art image loaders, pop
// numbers, the die roll animation, the card, mod and Nat text tables,
// and the card-play effect. Display only: nothing here writes gameState.

// ---------- HOVER TIPS ----------
// D-104/KI-41 — no element in the game carries a native `title` tooltip;
// every hover sentence lives in a `.hover-tip` child instead, shown by the
// generic `.hover-parent:hover .hover-tip` rule (index.html) unless the
// element already has its own more specific `:hover .hover-tip` rule (a
// die row, a die-action button) — adding `hover-parent` alongside one of
// those is harmless, both rules just agree.
function setHoverTip(el, text) {
  if (!el) return;
  el.classList.add('hover-parent');
  let tip = el.querySelector('.hover-tip');
  if (!tip) {
    tip = document.createElement('span');
    tip.className = 'hover-tip';
    el.appendChild(tip);
  }
  tip.innerHTML = '';
  (Array.isArray(text) ? text : [text]).forEach(function(line) {
    const div = document.createElement('div');
    div.textContent = line;
    tip.appendChild(div);
  });
}

// KI-46 — every showing hover box is shifted inward until it sits fully
// inside the window, via the CSS `translate` property so each tip's own
// `transform` placement is untouched. The pixel ratio between a translate
// and the box's on-screen move is measured, not assumed: <html> is zoomed
// (applyScale()) and the map composition zooms again on top of that.
const HOVER_TIP_EDGE_PX = 4;

function clampHoverTips() {
  const tips = document.querySelectorAll('.hover-tip');
  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    tip.style.translate = '';
    if (getComputedStyle(tip).visibility !== 'visible') continue;
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let dx = 0;
    let dy = 0;
    if (r.left < HOVER_TIP_EDGE_PX) dx = HOVER_TIP_EDGE_PX - r.left;
    else if (r.right > vw - HOVER_TIP_EDGE_PX) dx = vw - HOVER_TIP_EDGE_PX - r.right;
    if (r.top < HOVER_TIP_EDGE_PX) dy = HOVER_TIP_EDGE_PX - r.top;
    else if (r.bottom > vh - HOVER_TIP_EDGE_PX) dy = vh - HOVER_TIP_EDGE_PX - r.bottom;
    if (dx === 0 && dy === 0) continue;
    tip.style.translate = '100px 0px';
    const ratio = (tip.getBoundingClientRect().left - r.left) / 100 || 1;
    tip.style.translate = (dx / ratio) + 'px ' + (dy / ratio) + 'px';
  }
}

// How many letters of each mod's name a two-mod face's row shows, before
// the full name (via title). Drop to 5 if a future name stops fitting.
const TWO_MOD_NAME_CHARS = 6;

const ENEMY_BUFF_DISPLAY_NAME = {
  enemy_buff_poison: 'POISON',
  enemy_buff_wrath: 'WRATH',
  enemy_buff_drain: 'DRAIN',
  enemy_buff_seal: 'SEAL'
};

function modDisplayName(modId) {
  if (modId === 'NAT_ONE' || modId === 'ENEMY_NAT_ONE') return 'NAT 1';
  if (modId === 'NAT_TWENTY' || modId === 'ENEMY_NAT_TWENTY') return 'NAT 20';
  if (ENEMY_BUFF_DISPLAY_NAME[modId]) return ENEMY_BUFF_DISPLAY_NAME[modId];
  const mod = gameState.config.mods[modId];
  return mod ? mod.name : modId;
}

// Resolves a face to its hover description, or null if none exists —
// never invents one. Blank faces return null on purpose; the weight sits
// on faceTitleText()'s line, not here. buffPoisonStacks/enemyName/
// wrathAmount are the calling enemy's own act-scaled/per-enemy numbers,
// threaded through by renderDieList() rather than read from gameState
// here, so a map preview (a different enemy object) still shows correct text.
function faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount) {
  let text = null;
  if (face.modId === 'NAT_TWENTY' || face.modId === 'NAT_ONE') {
    text = NAT_DESCRIPTION[face.modId] || null;
    if (text && face.modId === 'NAT_TWENTY') text += ' Its weight caps at ' + GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT + '.';
  } else if (face.modId === 'ENEMY_NAT_TWENTY') {
    text = (enemyName || 'The boss') + ' starts its Charge next round.';
  } else if (face.modId === 'ENEMY_NAT_ONE') {
    if (enemyName === 'Cardinal') {
      text = 'Your heaviest loaded face triggers. Once per fight.';
    } else if (enemyName === 'Pontifex') {
      text = 'It loses all its Wrath. Once per fight.';
    } else if (enemyName === 'Hierophant') {
      text = 'Its attack is cancelled and it takes ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison, once per fight. This also happens when you roll a Nat 1.';
    } else {
      text = 'Its attack this round is cancelled and it takes ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison. Once per fight.';
    }
  } else if (face.modId === 'enemy_buff_poison') {
    text = 'You take ' + buffPoisonStacks + ' stacks of poison.';
  } else if (face.modId === 'enemy_buff_wrath') {
    text = 'From next round, every Attack deals ' + (wrathAmount || GAME_CONFIG.ENEMY_WRATH_AMOUNT) + ' more damage for the rest of the fight. Each trigger adds more.';
  } else if (face.modId === 'enemy_buff_drain') {
    text = 'You start next round with 1 less soul.';
    if (enemyName === 'Lector' && face.number === 6) {
      text += ' This also triggers when you roll a 6.';
    }
  } else if (face.modId === 'enemy_buff_seal') {
    text = 'Your heaviest loaded face counts as blank next round.';
  } else if (face.modId && MOD_DESCRIPTION[face.modId]) {
    text = MOD_DESCRIPTION[face.modId];
  }
  // A second mod (never possible on a Nat face) follows the first's text.
  if (face.modId2 && MOD_DESCRIPTION[face.modId2]) {
    text = (text ? text + ' / ' : '') + MOD_DESCRIPTION[face.modId2];
  }
  return text;
}

// The square's own name / weight / Bound line, the hover box's first line
// above faceHoverText()'s. Never a trigger count: the DIE layer alone shows
// that. Reads state only.
function faceTitleText(face, isPlayerDie) {
  const parts = [];
  if (face.modId === null) {
    parts.push('BLANK');
  } else if (face.modId2) {
    parts.push(modDisplayName(face.modId) + ' / ' + modDisplayName(face.modId2));
  } else {
    parts.push(modDisplayName(face.modId));
  }
  // Enemy faces never gain weight, so their tips don't print it (D-103).
  if (isPlayerDie) parts.push('weight ' + face.weight + (isFaceTwentyAtCap(face.number) ? ' MAX' : ''));
  if (isBoundFace(face)) parts.push('Bound');
  if (isPlayerDie && isFaceSealed(face.number)) parts.push('Sealed');
  return parts.join(' · ');
}

// The hover box a mod symbol under a face opens: that one mod's name and the
// face's weight, then that mod's own text.
function faceSymbolTipLines(face, modId) {
  const text = isFaceSealed(face.number) ? 'Counts as blank this round.' : MOD_DESCRIPTION[modId];
  return [modDisplayName(modId) + ' · weight ' + face.weight, text];
}

// D-128: one mod's box in a loaded face's hover — the Load offer's box:
// symbol, name, rarity in its tier colour, tags, text. A foot line keeps the
// face's weight and Bound, which the box replaced from the old title line.
const FACE_TIP_SYMBOL_PX = 48;

function faceModBox(face, modId) {
  const mod = gameState.config.mods[modId];
  const box = document.createElement('div');
  box.className = 'face-mod-box';
  attachArtIcon(box, 'mods', modId, FACE_TIP_SYMBOL_PX, 'face-tip-symbol');
  const tier = (mod.tier || '').toLowerCase();
  const rows = [
    ['face-tip-title', mod.name],
    ['face-tip-rarity', (tier || 'mod').toUpperCase()],
    ['face-tip-tags', offerTagText(mod.tags)],
    ['face-tip-text', MOD_DESCRIPTION[modId] || ''],
    ['face-tip-foot', 'weight ' + face.weight + (isFaceTwentyAtCap(face.number) ? ' MAX' : '') + (isBoundFace(face) ? ' · Bound' : '')]
  ];
  rows.forEach(function(r) {
    const line = document.createElement('div');
    line.className = r[0];
    line.textContent = r[1];
    box.appendChild(line);
  });
  box.querySelector('.face-tip-rarity').style.color = GAME_CONFIG.TIER_COLOURS[tier] || GAME_CONFIG.TIER_COLOURS.basic;
  return box;
}

// Placeholders for art that does not exist yet — /art/ is empty.
// A loaded image hides its box's text label; a failed load (onerror —
// no art files ship in this build) hides the image and shows the label.
function setArtImage(imgId, labelId, src, labelText) {
  const img = document.getElementById(imgId);
  const label = document.getElementById(labelId);
  if (!img || !label) return;
  label.textContent = labelText;
  if (img.getAttribute('data-art-src') !== src) {
    img.setAttribute('data-art-src', src);
    img.onload = function() { img.style.display = 'block'; label.style.display = 'none'; };
    img.onerror = function() { img.style.display = 'none'; label.style.display = ''; };
    img.src = src;
  }
}

// Card art — art/cards/ is empty, no image files ship in this build. A
// missing file leaves the img hidden and the box empty, no label, since a
// card's own name/text already sit outside this box.
function attachCardArtImg(container, cardId) {
  const img = document.createElement('img');
  img.className = 'card-art-img';
  img.alt = '';
  img.onerror = function() { img.style.display = 'none'; };
  img.src = 'art/cards/' + cardId + '.png';
  container.appendChild(img);
  return img;
}

// Mod/artifact icon at a fixed pixel size; a missing file hides the img and
// leaves the row's own text as it was.
function attachArtIcon(container, folder, id, px, className) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.style.width = px + 'px';
  img.style.height = px + 'px';
  img.onerror = function() { img.style.display = 'none'; };
  img.src = 'art/' + folder + '/' + id + '.png';
  container.appendChild(img);
  return img;
}

// ---------- POP NUMBERS — the drawing primitive only (F46) ----------
// Never called from a render function: state.js announces, beside the
// [STATE] log line for the same change. Keyed anchorId|kind so several
// hits on one target climb one total instead of stacking numbers.

const fxLivePops = {};

function fxLayer() {
  let layer = document.getElementById('fxLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fxLayer';
    document.body.appendChild(layer);
  }
  return layer;
}

function spawnFxNumber(anchorId, kind, delta) {
  // D-107: pops follow a spinning die icon — held, then replayed in order
  // the moment it stops (releaseDieRollDisplay()).
  if (dieRollHolding('player') || dieRollHolding('enemy')) {
    heldFxNumbers.push([anchorId, kind, delta]);
    return;
  }
  const anchor = document.getElementById(anchorId);
  if (!anchor) { return; }
  const cfg = GAME_CONFIG.DAMAGE_NUMBERS;
  const key = anchorId + '|' + kind;
  const live = fxLivePops[key];
  const total = (live ? live.total : 0) + delta;

  const el = live ? live.el : document.createElement('div');
  if (!live) {
    el.className = 'fx-number';
    el.dataset.fxKind = kind;
    fxLayer().appendChild(el);
  }
  el.style.color = cfg.COLOURS[kind] || 'var(--text)';
  el.textContent = (total > 0 ? '+' : '') + total;

  // applyScale() zooms <html>, so a rect comes back already multiplied by
  // that zoom while style.left is read in the zoomed context's own pixels
  // — divide back out or every pop lands off its readout.
  const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const rect = anchor.getBoundingClientRect();
  el.style.left = ((rect.left + rect.width / 2) / zoom) + 'px';
  el.style.top = ((rect.top + rect.height / 2) / zoom) + 'px';
  el.style.setProperty('--fx-rise', cfg.RISE_PX + 'px');

  // Restarts the rise from the top on every update, so a climbing total
  // fades FADE_MS after its last hit, not its first.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'fxRise ' + cfg.FADE_MS + 'ms steps(' + cfg.STEPS + ') forwards';

  if (live) clearTimeout(live.timer);
  fxLivePops[key] = {
    el: el,
    total: total,
    timer: setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      delete fxLivePops[key];
    }, cfg.FADE_MS)
  };
}

// ---------- DIE ROLL ANIMATION (D-107) ----------
// Display only: the phase machine never waits on it. refreshInspector()
// spots a fresh roll on the render it lands; that side's icon then steps
// through DIE_ROLL_ANIMATION's frames while its face row, the roll strip
// and every pop hold, all released together as the icon snaps upright.
// Frame numbers come from a display-only generator so gameplay's own
// Math.random sequence (seeded by tests/autoplay.js) is never consumed.

const dieRollAnims = { player: null, enemy: null };
const lastSeenRollSignatures = { player: null, enemy: null };
const heldFxNumbers = [];
let enemyRollDisplay = null;
let dieRollAnimSeed = (Date.now() % 2147483646) + 1;

function dieRollAnimRandom(dieSize, avoid) {
  let n;
  do {
    dieRollAnimSeed = (dieRollAnimSeed * 48271) % 2147483647;
    n = 1 + (dieRollAnimSeed % dieSize);
  } while (n === avoid && dieSize > 1);
  return n;
}

function dieRollHolding(side) {
  const anim = dieRollAnims[side];
  return !!anim && anim.stage === 'spin';
}

function shownPlayerRoll() {
  if (dieRollHolding('player')) return { faceNumber: null, outcome: null };
  return { faceNumber: gameState.turn.rolledFaceNumber, outcome: gameState.turn.rollOutcome };
}

// The enemy rolls at a round's end and the next START_OF_TURN clears the
// state's own copy at once, so its roll holds here through the round that
// follows — the round its Wrath/Drain/Seal land in — until it rolls again.
function shownEnemyRoll() {
  if (!enemyRollDisplay || dieRollHolding('enemy')) return { faceNumber: null, outcome: null };
  return { faceNumber: enemyRollDisplay.faceNumber, outcome: enemyRollDisplay.outcome };
}

function noteDieRollsForAnimation() {
  const turn = gameState.turn;
  const held = enemyRollDisplay;
  if (turn.round === 0 || (held && (held.die !== gameState.enemy.die || turn.round > held.round + 1))) {
    enemyRollDisplay = null;
  }
  const playerSig = turn.rolledFaceNumber === null ? null : turn.round + ':' + turn.rolledFaceNumber + ':' + turn.rollOutcome;
  const enemySig = turn.enemyRolledFaceNumber === null ? null : turn.round + ':' + turn.enemyRolledFaceNumber + ':' + turn.enemyRollOutcome;
  const inFight = gameState.run.screen === 'fight';
  if (playerSig !== null && playerSig !== lastSeenRollSignatures.player && inFight) {
    startDieRollAnimation('player', GAME_CONFIG.DIE_SIZE.PLAYER, turn.rolledFaceNumber);
  }
  if (enemySig !== null && enemySig !== lastSeenRollSignatures.enemy) {
    enemyRollDisplay = { faceNumber: turn.enemyRolledFaceNumber, outcome: turn.enemyRollOutcome, round: turn.round, die: gameState.enemy.die };
    if (inFight) { startDieRollAnimation('enemy', gameState.enemy.die.faces.length, turn.enemyRolledFaceNumber); }
  }
  lastSeenRollSignatures.player = playerSig;
  lastSeenRollSignatures.enemy = enemySig;
}

// FRAME_COUNT frames over DURATION_MS, each a new number, rotated a step
// further (the player's icon then holds for the landing gap); then upright on the rolled number (the release), one flash to
// --text for FLASH_MS, and SHAKE_CYCLES left-right shakes of SHAKE_PX.
function startDieRollAnimation(side, dieSize, rolledNumber) {
  const cfg = GAME_CONFIG.DIE_ROLL_ANIMATION;
  const frameMs = cfg.DURATION_MS / cfg.FRAME_COUNT;
  if (dieRollAnims[side]) { clearTimeout(dieRollAnims[side].timer); }
  const anim = { stage: 'spin', frame: 1, number: dieRollAnimRandom(dieSize, rolledNumber), rotation: cfg.ROTATE_STEP_DEG, shiftX: 0, flash: false, shakeStep: 0, timer: null };
  dieRollAnims[side] = anim;
  if (side === 'player') { playAudioEvent('die_rolling'); }
  function step() {
    if (dieRollAnims[side] !== anim) return;
    if (anim.stage === 'spin' && anim.frame < cfg.FRAME_COUNT) {
      anim.frame++;
      anim.number = dieRollAnimRandom(dieSize, anim.number);
      anim.rotation = anim.frame * cfg.ROTATE_STEP_DEG;
      anim.timer = setTimeout(step, frameMs);
      renderDieIcons();
    } else if (anim.stage === 'spin' && !anim.landing && side === 'player') {
      // The frames are done and the rattle stops; the player's icon holds its
      // last frame until ROLL_LAND_GAP_MS after the rattle's end.
      anim.landing = true;
      anim.timer = setTimeout(step, Math.max(0, DIE_RATTLE_END_MS + GAME_CONFIG.ROLL_LAND_GAP_MS - cfg.DURATION_MS));
    } else if (anim.stage === 'spin') {
      Object.assign(anim, { stage: 'flash', rotation: 0, flash: true });
      anim.timer = setTimeout(step, cfg.FLASH_MS);
      releaseDieRollDisplay(side);
    } else if (anim.shakeStep < cfg.SHAKE_CYCLES * 2) {
      Object.assign(anim, { stage: 'shake', flash: false, shiftX: (anim.shakeStep % 2 === 0 ? -1 : 1) * cfg.SHAKE_PX });
      anim.shakeStep++;
      anim.timer = setTimeout(step, cfg.SHAKE_STEP_MS);
      renderDieIcons();
    } else {
      dieRollAnims[side] = null;
      renderDieIcons();
    }
  }
  anim.timer = setTimeout(step, frameMs);
}

// The icon has stopped: the face row, roll strip and held pops catch up.
function releaseDieRollDisplay(side) {
  refreshInspector();
  if (side === 'player') {
    releaseHeldAudioEvents();
    paintRollHero();
    const hero = document.getElementById('rollHero');
    if (hero) { hero.classList.remove('roll-pulse'); void hero.offsetWidth; hero.classList.add('roll-pulse'); }
  }
  if (!dieRollHolding('player') && !dieRollHolding('enemy')) {
    // A pop whose readout a reward layer has since hidden is dropped, not
    // drawn at the page corner.
    heldFxNumbers.splice(0).forEach(function(a) {
      const anchor = document.getElementById(a[0]);
      if (anchor && anchor.getClientRects().length) { spawnFxNumber(a[0], a[1], a[2]); }
    });
  }
}

// Test/dev read: true once neither die icon is mid-animation.
function dieRollAnimationsIdle() {
  return !dieRollAnims.player && !dieRollAnims.enemy;
}

// One icon's current look: the spinning frame's number and turn, or the
// resting number (null pre-roll) upright, plus any flash or shake.
function dieIconFrame(side, restingNumber, restingColour) {
  const anim = dieRollAnims[side];
  if (!anim) return { number: restingNumber, colour: restingColour, stroke: null, transform: 'none', stage: 'idle' };
  const parts = [];
  if (anim.rotation) parts.push('rotate(' + anim.rotation + 'deg)');
  if (anim.shiftX) parts.push('translateX(' + anim.shiftX + 'px)');
  const spinning = anim.stage === 'spin';
  return {
    number: spinning ? anim.number : restingNumber,
    colour: (spinning || anim.flash) ? 'var(--text)' : restingColour,
    stroke: anim.flash ? 'var(--text)' : null,
    transform: parts.length ? parts.join(' ') : 'none',
    stage: anim.stage
  };
}

function dieIconWrapHtml(frame, dieSize, strokeColour) {
  return '<div class="die-icon-wrap" data-roll-anim="' + frame.stage + '" style="transform:' + frame.transform + '">' +
    dieIconSvg(dieSize, frame.stroke || strokeColour) +
    '<div class="die-icon-number" style="color:' + frame.colour + '">' +
    (frame.number === null ? '' : '<span class="die-icon-number-text">' + frame.number + '</span>') + '</div></div>';
}

// D-125: every player-read text is one or two short imperative sentences —
// a number before its noun, conditions at the front, no parentheses, never
// 'applied' or 'this run'. Tags (Bound, Growth) live on the tag line.
const CARD_EFFECT_TEXT = {
  strike: 'Deal 5 damage.',
  ward: 'Gain 5 block.',
  rite: 'Deal 6 damage. Gain 6 block.',
  rebuke: 'Deal 4 damage.',
  censure: 'Deal 14 damage.',
  judgement: 'Deal 20 damage.',
  vestment: 'Gain 13 block.',
  litany: 'Deal 7 damage. Gain 7 block.',
  scripture: 'Draw 2 cards.',
  communion: 'Gain 2 soul.',
  censer: 'Apply 4 stacks of poison.',
  purge: 'Deal 6 damage. If the enemy has poison, deal 10 instead.',
  interdict: "Gain 5 block. If the enemy's intent deals 12 or more damage this round, gain 10 instead.",
  bulwark: 'Gain 6 block. If the enemy is winding up or releasing, gain 16 instead.',
  reckoning: 'Deal 3 damage, plus 2 per stack of poison on the enemy.',
  retribution: 'Deal damage equal to your block, up to 12.',
  covenant: 'Deal 2 damage, plus 3 per weight on the rolled face.',
  rapture: 'Deal 12 damage. If a mod has triggered this turn, this costs 0 soul.',
  orison: 'Deal 5 damage. If you rolled a blank, deal 9 instead.',
  tenet: 'Deal 6 damage, plus 1 for each time the rolled face has triggered.',
  gradual: "Deal 3 damage, plus 1 per weight on your heaviest face that isn't blank.",
  vacancy: 'Deal 1 damage per blank face on your die.',
  lauds: 'Deal 4 damage, plus 3 per Growth mod on your die, up to 13.',
  chastise: 'Deal 7 damage.',
  cloister: 'Gain 7 block.',
  psalm: 'Draw 1 card.',
  reliquary: 'Gain 6 block. If you already had 10 or more block, deal 5 damage.',
  vindication: 'Deal damage equal to twice your block, up to 24.',
  myrrh: 'Gain 6 block, plus 1 per stack of poison on the enemy, up to 12.',
  exequy: "Deal damage equal to the enemy's stacks of poison, up to 12.",
  hosanna: "Deal 6 damage. If the enemy's intent this round is not an Attack, deal 12 instead.",
  gloria: 'Deal 30 damage.',
  oblation: 'Spend all your soul. Deal 7 damage per soul spent, up to 42.',
  tabernacle: 'Gain 2 block per blank face on your die.',
  jubilee: 'Deal 4 damage, plus 2 per weight added to your die, up to 24.',
  // Fallback only — getCardEffectText() below overrides this with the
  // live threnodyFace number; no real caller reads this map directly.
  threnody: 'Trigger the same face every time. If it is blank, gain 2 block.',
  reverberation: 'Trigger every blank face on your die.',
  kyrie: 'Deal 5 damage. If the rolled face has Bound, deal 10 instead.',
  novena: 'Trigger every loaded Bound face.',
  canticle: 'Gain 6 block. If the rolled face is loaded, it gains Bound for this fight.',
  kneel: 'Apply 3 stacks of awe.',
  compline: 'Gain 4 block. Apply 2 stacks of awe.',
  tremendum: 'Deal 4 damage, plus 2 per stack of awe on the enemy, up to 12.',
  mysterium: 'Deal 3 damage per stack of awe on the enemy, up to 12. The stacks of awe stay.',
  venom: 'Apply 2 stacks of poison. If the enemy has poison, apply 4 instead.',
  ballast: 'Deal 3 damage per weight on your heaviest face, up to 12.',
  refrain: 'Trigger the rolled face again.',
  second_sight: 'Roll your die again. The new face resolves as a roll.',
  cadence: 'Deal damage equal to twice the round number, up to 12.',
  watchword: 'Gain 5 block. If a Bound face triggered this round, gain 12 instead.',
  blight_weight: 'Apply 2 stacks of poison per weight on the rolled face, up to 8.'
};

// Every site that draws a card's effect text calls this instead of
// reading CARD_EFFECT_TEXT[cardId] directly, so Threnody's real,
// run-fixed face number shows everywhere.
function getCardEffectText(cardId) {
  if (cardId === 'threnody' && gameState.run.threnodyFace !== null) {
    return 'Trigger face ' + gameState.run.threnodyFace + ', the same face every time. If it is blank, gain 2 block.';
  }
  return CARD_EFFECT_TEXT[cardId] || '';
}

// Hover text for mods and Nat faces, written to what each mod's code does.
const MOD_DESCRIPTION = {
  consecrate: 'Gain 2 soul. Cards you play this turn give 3 block.',
  smite: 'Deal 16 damage.',
  penance: 'Deal 8 damage. Gain 8 block.',
  offering: 'Gain 2 soul. Draw 1 card.',
  blight: 'Apply 6 stacks of poison.',
  virulence: "Apply 3 stacks of poison. Double the enemy's stacks of poison.",
  sanctuary: 'Gain 16 block.',
  vigil: 'Deal 4 damage, plus 1 for every 3 blanks you have rolled this run. Also triggers whenever you roll a blank.',
  zeal: 'Deal 10 damage, plus 4 for each earlier trigger of this face.',
  fervour: 'Double your attack damage this turn.',
  ordain: 'Deal 10 damage. Add 1 weight to this face.',
  anthem: 'Deal 6 damage, plus 4 per weight on this face.',
  elevation: 'Deal 10 damage. If the next face up holds a mod, add 1 weight to it.',
  largesse: 'Gain 2 soul and 4 block.',
  tithe: 'Gain 1 block per blank face on your die.',
  congregation: 'Deal 8 damage. If another mod on your die has Growth, deal 16 instead.',
  cope: 'Gain 8 block, plus 2 for each earlier trigger of this face.',
  anathema: 'When this turn ends, deal damage equal to your block, up to 16.',
  thurible: 'Deal 8 damage. Apply 3 stacks of poison.',
  magnificat: 'Trigger your heaviest other loaded face.',
  unison: 'Deal 6 damage.',
  accord: 'Gain 10 block.',
  kinship: 'Apply 4 stacks of poison.',
  concord: 'Gain 1 soul and 3 block.',
  herald: 'Deal 6 damage. Another random loaded face without Bound gains Bound for this fight.',
  dread: 'Apply 4 stacks of awe.',
  genuflect: 'Gain 6 block. Apply 3 stacks of awe.'
};

const NAT_DESCRIPTION = {
  NAT_TWENTY: 'Trigger every loaded face, lowest first.',
  NAT_ONE: 'Lose 1 soul at the start of each of your next 3 turns. Once per fight, then a 1 is blank.'
  // ENEMY_NAT_ONE/ENEMY_NAT_TWENTY intentionally absent — their text needs
  // the current act's buffPoisonStacks number; faceHoverText() builds it inline.
};

const CARD_FX_TYPE = {
  strike: 'attack',
  ward: 'block',
  rite: 'both'
};

function triggerCardFx(cardName) {
  let cardId = null;
  for (const id in gameState.config.cards) {
    if (gameState.config.cards[id].name === cardName) { cardId = id; break; }
  }
  const fxType = CARD_FX_TYPE[cardId];
  if (!fxType) return;

  if (fxType === 'attack' || fxType === 'both') {
    flashElement('enemyPanel', 'fx-shake');
    flashElement('enemyHpValue', 'fx-pop-red');
  }
  if (fxType === 'block' || fxType === 'both') {
    flashElement('playerPanel', 'fx-pulse-blue');
    flashElement('playerBlockValue', 'fx-pop-blue');
  }
}
