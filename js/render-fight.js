// The fight screen: phase badge, roll strip, result banner, the player and
// enemy face rows (weight, odds, symbols), intent icon, stats and status
// rows, art boxes, top-bar tokens, the two die icons and the hand's card
// buttons. refreshInspector() (rendering.js) calls each render function;
// each reads gameState and draws, and a click calls the game's own handler.

function renderPhaseBadge() {
  const badge = document.getElementById('phaseBadge');
  if (!badge) return;
  const phase = gameState.turn.phase;
  badge.textContent = phase.replace(/_/g, ' ');
  badge.className = 'phase-badge phase-' + phase.toLowerCase();
}

// The roll stage's own segments for the face just rolled: one per mod on
// that face, in load order. Each segment's `value` is filled in from that
// mod's own log line (see noteRollHeroValue) — nothing is recomputed here.
let rollHeroSegments = [];

// The first number a mod's own log line reports for its trigger, read in
// the four shapes every mod already logs. Returns null when that line
// carries no such number (a "registered" line, say).
function rollHeroValueFromLogLine(message) {
  const patterns = [/(\d+) damage/, /(\d+) block/, /\+(\d+) soul/, /(\d+) stacks of poison/];
  for (let i = 0; i < patterns.length; i++) {
    const m = message.match(patterns[i]);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function noteRollHeroValue(message) {
  const match = message.match(/^\[MOD\] ([a-z_]+): (.+)$/);
  if (!match) return;
  const seg = rollHeroSegments.find(function(s) { return s.modId === match[1] && s.value === null; });
  if (!seg) return;
  const value = rollHeroValueFromLogLine(match[2]);
  if (value === null) return;
  seg.value = value;
  paintRollHero();
}

// D-105 — the strip shows the name only: PENITENCE, BLANK, or the mod
// name(s) in trigger order, each with its own trigger badge. No '+N'
// value (the number still pops on the art/stat it lands on, D-87, and
// stays in the log) and no 'NAT 1' prefix — Penitence reads as itself.
// A Nat 20 still reads NAT 20, its segment carrying no other name.
function paintRollHero() {
  const hero = document.getElementById('rollHero');
  const numEl = document.getElementById('rollResultNumber');
  const labelEl = document.getElementById('rollResultLabel');
  if (!hero || !numEl || !labelEl) return;

  labelEl.innerHTML = '';
  numEl.textContent = '';
  // D-107: the strip follows the icon — nothing until it stops spinning.
  if (rollHeroSegments.length === 0 || dieRollHolding('player')) {
    hero.classList.add('roll-hero-empty');
    numEl.classList.remove('roll-hero-nat');
    labelEl.classList.remove('roll-hero-nat');
    labelEl.textContent = 'AWAITING ROLL';
    return;
  }

  hero.classList.remove('roll-hero-empty');
  const isNat = rollHeroSegments[0].isNat;
  numEl.classList.toggle('roll-hero-nat', isNat);
  labelEl.classList.toggle('roll-hero-nat', isNat);

  rollHeroSegments.forEach(function(seg, idx) {
    // seg.name wins when it says something (Penitence, Blank, a mod's own
    // name) — seg.natText (NAT 20) is only the fallback for the segment
    // that carries no name of its own.
    const nameText = seg.name || seg.natText;
    if (nameText) {
      const nameEl = document.createElement('span');
      nameEl.textContent = (idx > 0 ? ' ' : '') + nameText.toUpperCase();
      labelEl.appendChild(nameEl);
    }
    const count = rollHeroTriggerCount(seg);
    if (count > 0) {
      const countEl = document.createElement('span');
      countEl.className = 'roll-hero-count';
      countEl.textContent = '↻' + count;
      labelEl.appendChild(countEl);
    }
  });
}

// Read live at paint time, not captured when the roll landed, so the count
// shown already includes this trigger.
function rollHeroTriggerCount(seg) {
  if (seg.modId === null || seg.faceNumber == null) return 0;
  const face = getPlayerFace(seg.faceNumber);
  const modData = (face && face.modData) || {};
  return (seg.slot === 2 ? modData.triggerCount2 : modData.triggerCount) || 0;
}

function renderRollResult(faceNumberText, modIdRaw) {
  const hero = document.getElementById('rollHero');
  if (!hero) return;

  const modId = (modIdRaw === 'null') ? null : modIdRaw;
  const faceNumber = parseInt(faceNumberText, 10);
  const face = getPlayerFace(faceNumber);

  if (modId === 'NAT_ONE' || modId === 'ENEMY_NAT_ONE') {
    rollHeroSegments = [{ modId: null, name: 'Penitence', value: null, isNat: true, natText: 'NAT 1' }];
  } else if (modId === 'NAT_TWENTY' || modId === 'ENEMY_NAT_TWENTY') {
    rollHeroSegments = [{ modId: null, name: '', value: null, isNat: true, natText: 'NAT 20' }];
  } else if (modId === null) {
    rollHeroSegments = [{ modId: null, name: 'Blank', value: GAME_CONFIG.BLANK_ROLL_BLOCK, isNat: false }];
  } else {
    rollHeroSegments = [{ modId: modId, faceNumber: faceNumber, slot: 1, name: modDisplayName(modId), value: null, isNat: false }];
    if (face && face.modId2) {
      rollHeroSegments.push({ modId: face.modId2, faceNumber: faceNumber, slot: 2, name: modDisplayName(face.modId2), value: null, isNat: false });
    }
  }
  paintRollHero();

  hero.classList.remove('roll-pulse');
  void hero.offsetWidth;
  hero.classList.add('roll-pulse');
}

function resetRollHero() {
  rollHeroSegments = [];
  paintRollHero();
}

function renderResultBanner() {
  const banner = document.getElementById('resultBanner');
  if (!banner) return;
  if (gameState.run.status === 'win') {
    banner.textContent = 'VICTORY';
    banner.className = 'result-banner result-win';
    banner.style.display = 'inline-block';
  } else if (gameState.run.status === 'loss') {
    banner.textContent = 'DEFEAT';
    banner.className = 'result-banner result-loss';
    banner.style.display = 'inline-block';
  } else {
    banner.style.display = 'none';
  }
}

// D-124: the mod ids whose symbols sit under a face, load order. Blank and
// Nat faces carry none.
const FACE_SYMBOL_PX = 24;
const WEIGHT_LINE_PX_PER_POINT = 2;

function faceSymbolModIds(face) {
  if (face.modId === null || face.modId === 'NAT_ONE' || face.modId === 'NAT_TWENTY') return [];
  return face.modId2 ? [face.modId, face.modId2] : [face.modId];
}

// Per-container "committed" roll signature — lets a re-render triggered
// by something other than an actual new roll redraw the rolled row
// without restarting its flash animation. Commit is deferred to a
// microtask so the whole synchronous cascade one roll triggers is seen
// as one render, not many, before the next separate event (a click).
const lastSeenRollSignatureByContainer = {};

// Same per-container "already seen" idiom as above, for hopped faces —
// see renderDieList()'s hop block below.
const lastSeenHoppedFacesByContainer = {};

// Optional 4th arg — { isEligible(face), onPick(faceNumber), showBecomes }
// — turns the die rows themselves into the Load/Strengthen face picker.
// Optional 5th arg, buffPoisonStacks — the enemy's own act-scaled
// poison amount, passed straight through to faceHoverText() so an enemy
// die's poison/Nat faces can name the real number for the current act.
// Optional 6th/7th args, enemyName/wrathAmount, thread through the same
// way for Cardinal/Pontifex/Hierophant/Lector's own hover overrides.
function renderDieList(containerId, faces, forceRollFn, pickConfig, buffPoisonStacks, enemyName, wrathAmount) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const title = container.querySelector('.panel-title');
  container.innerHTML = '';
  if (title) container.appendChild(title);
  // An empty faces array (a dieless enemy) still clears out whatever rows
  // a previous fight's die left behind, leaving just the title.
  if (!faces.length) return;

  // Reference equality with the player's own live die, not a containerId
  // allowlist — true for playerDieList/dieActionDieList/the map's own
  // preview, false for the enemy die and the map's static previews.
  const showTriggerBadges = (faces === gameState.die.faces);

  // Sealed display, player die only: a face currently sealed dims and
  // shows "SEALED"; one queued to seal next round shows "SEALED NEXT
  // ROUND" with no dimming (still fully loaded/rollable this round).
  const isPlayerDie = showTriggerBadges;

  // this roll's own odds, read straight off rollDie()'s own
  // bag (pipeline.js). Player die only — nothing else needs it.
  const oddsByFace = isPlayerDie ? rollOdds(faces) : null;

  // The player's own die reads as one horizontal row of squares, face 1 at
  // the left; every other container keeps the vertical row list
  // — this is the only face row on screen; the die action/event reward
  // layer picks/lights faces on this same row instead of a row of its own.
  const isHorizontal = (containerId === 'playerDieList');

  const tracksRolledFace = (containerId === 'playerDieList' || containerId === 'enemyDieList');
  const isEnemyContainer = containerId === 'enemyDieList';
  // D-107: a face row lights its rolled face only once that side's die
  // icon stops spinning; the enemy's reads its held display roll, since
  // the state's own copy clears the instant the next round starts.
  const shownRoll = isEnemyContainer ? shownEnemyRoll() : shownPlayerRoll();
  const trackedRolledFaceNumber = shownRoll.faceNumber;
  const trackedRollOutcome = shownRoll.outcome;
  let isNewRollThisRender = false;
  if (tracksRolledFace) {
    const currentRollSignature = trackedRolledFaceNumber !== null
      ? trackedRolledFaceNumber + ':' + trackedRollOutcome
      : null;
    isNewRollThisRender = currentRollSignature !== null && currentRollSignature !== lastSeenRollSignatureByContainer[containerId];
    if (isNewRollThisRender) {
      // Commit after the current synchronous cascade unwinds — see the
      // comment above lastSeenRollSignatureByContainer's declaration.
      queueMicrotask(function() {
        lastSeenRollSignatureByContainer[containerId] = currentRollSignature;
      });
    } else {
      lastSeenRollSignatureByContainer[containerId] = currentRollSignature;
    }
  }

  // A face that fires WITHOUT being the rolled face (a Nat 20 sweep, a
  // Bound scan, an outside-roll trigger) hops to the same rolled-face
  // look, player die only. Same flash-once-then-sustained split.
  const tracksHoppedFaces = tracksRolledFace && !isEnemyContainer;
  const trackedHoppedFaces = (tracksHoppedFaces && !dieRollHolding('player')) ? gameState.turn.hoppedFaces : [];
  if (!lastSeenHoppedFacesByContainer[containerId]) { lastSeenHoppedFacesByContainer[containerId] = []; }
  const committedHoppedFaces = lastSeenHoppedFacesByContainer[containerId];
  const newlyHoppedThisRender = trackedHoppedFaces.filter(function(n) { return committedHoppedFaces.indexOf(n) === -1; });
  if (tracksHoppedFaces) {
    if (newlyHoppedThisRender.length > 0) {
      queueMicrotask(function() {
        lastSeenHoppedFacesByContainer[containerId] = trackedHoppedFaces.slice();
      });
    } else {
      lastSeenHoppedFacesByContainer[containerId] = trackedHoppedFaces.slice();
    }
  }

  // Display order flipped — NAT 20 at the top, descending to NAT 1.
  // Purely a rendering change: only a REVERSED COPY is iterated; the real
  // faces array is never mutated or reordered.
  faces.slice().reverse().forEach(function(face) {
    const row = document.createElement('div');
    row.className = 'die-row';
    if (face.modId === 'NAT_ONE' || face.modId === 'ENEMY_NAT_ONE') {
      row.classList.add('nat-one');
    } else if (face.modId === 'NAT_TWENTY' || face.modId === 'ENEMY_NAT_TWENTY') {
      row.classList.add('nat-twenty');
    } else if (face.modId !== null) {
      row.classList.add('loaded');
    }
    if (isPlayerDie && isFaceSealed(face.number)) {
      row.classList.add('die-row-sealed');
    }

    // The rolled-face highlight. isNewRollThisRender picks the animated
    // -flash class only on the render right after an actual new roll;
    // later re-renders of the same roll get the plain sustained class.
    // A blank rolled face holds the same way a loaded one does (D-10):
    // its own flash class on the new-roll render, then die-row-rolled
    // on every later render of that round.
    if (tracksRolledFace && trackedRolledFaceNumber === face.number) {
      if (trackedRollOutcome === 'blank') {
        row.classList.add(isNewRollThisRender ? 'die-row-rolled-blank-flash' : 'die-row-rolled');
      } else {
        row.classList.add(isNewRollThisRender ? 'die-row-rolled-flash' : 'die-row-rolled');
      }
    } else if (tracksHoppedFaces && trackedHoppedFaces.indexOf(face.number) !== -1) {
      row.classList.add(newlyHoppedThisRender.indexOf(face.number) !== -1 ? 'die-row-rolled-flash' : 'die-row-rolled');
    }

    // A genuine enemy Nat pulses its rolled row three times, on top of
    // whatever look it already has above.
    if (isEnemyContainer && trackedRolledFaceNumber === face.number && isNewRollThisRender && (trackedRollOutcome === 'nat_twenty' || trackedRollOutcome === 'nat_one')) {
      row.classList.add('die-row-enemy-nat-pulse');
    }

    const btn = document.createElement('button');
    btn.className = 'face-btn';

    const numSpan = document.createElement('span');
    numSpan.className = 'face-num';
    numSpan.textContent = face.number;
    btn.appendChild(numSpan);

    // DEV ONLY — force-roll click handler, only wired while dev chrome is
    // open. The Load/Strengthen picker is untouched: it passes forceRollFn
    // null and wires its click via pickConfig below instead. Remove before any real release.
    if (forceRollFn && devChromeOpen) {
      const faceNumber = face.number;
      btn.addEventListener('click', function() {
        forceRollFn(faceNumber);
      });
    }

    // Third Eye — while choosing, a click on the real player die's own
    // row picks that face for the roll instead of the dev force-roll path.
    if (containerId === 'playerDieList' && thirdEyeChoosing) {
      const faceNumber = face.number;
      btn.addEventListener('click', function() {
        thirdEyeChoosing = false;
        thirdEyeChooseFace(faceNumber);
      });
    }

    const modWrap = document.createElement('div');
    modWrap.className = 'die-mod-wrap';

    // A face holding two mods shows both names side by side on one line,
    // each with its own trigger count beside it. Single-mod and blank
    // faces are unchanged: one .die-mod span, then weight, then trigger badge.
    const isTwoMod = face.modId !== null && !!face.modId2;

    if (isTwoMod) {
      const modPair = document.createElement('span');
      modPair.className = 'die-mod-pair';
      const modData = face.modData || {};
      [
        { id: face.modId, count: modData.triggerCount || 0 },
        { id: face.modId2, count: modData.triggerCount2 || 0 }
      ].forEach(function(m, idx) {
        const nameSpan = document.createElement('span');
        // idx 1 (the second mod) gets its own class for the gap-before-it
        // CSS rule — :nth-of-type doesn't work since the first mod's own
        // trigger count is also a <span> and can sit between the two names.
        nameSpan.className = idx === 1 ? 'die-mod die-mod-second' : 'die-mod';
        // Truncated to an exact character count, no ellipsis — the full
        // name is still available on the row's own hover tip below
        // (faceTitleText() names both mods in full).
        const fullName = modDisplayName(m.id);
        nameSpan.textContent = fullName.slice(0, TWO_MOD_NAME_CHARS);
        modPair.appendChild(nameSpan);
        if (showTriggerBadges && m.count > 0) {
          const trig = document.createElement('span');
          trig.className = 'die-trigger-count die-trigger-count-inline';
          trig.textContent = '#' + m.count;
          modPair.appendChild(trig);
        }
      });
      modWrap.appendChild(modPair);
    } else {
      const modSpan = document.createElement('span');
      modSpan.className = 'die-mod';
      modSpan.textContent = face.modId === null ? '—' : modDisplayName(face.modId);
      modWrap.appendChild(modSpan);
    }

    if (face.weight > 1) {
      const weightSpan = document.createElement('span');
      weightSpan.className = 'die-weight';
      weightSpan.textContent = '×' + face.weight;
      modWrap.appendChild(weightSpan);
    }

    // Shown on every die-row container, not gated by showTriggerBadges —
    // a printed-Bound mod's badge is part of what the mod IS.
    if (isBoundFace(face)) {
      const boundSpan = document.createElement('span');
      boundSpan.className = 'die-weight die-bound-badge';
      boundSpan.textContent = 'Bound';
      modWrap.appendChild(boundSpan);
    }

    // Player die only. Zero triggers appends nothing. Single-mod faces
    // only — a two-mod face's counts render inline beside their own name above.
    if (!isTwoMod && showTriggerBadges && face.modId !== null) {
      const modData = face.modData || {};
      const count1 = modData.triggerCount || 0;
      if (count1 > 0) {
        const triggerSpan = document.createElement('span');
        triggerSpan.className = 'die-trigger-count';
        triggerSpan.textContent = '#' + count1;
        modWrap.appendChild(triggerSpan);
      }
    }

    if (isPlayerDie && isFaceSealed(face.number)) {
      const sealedSpan = document.createElement('span');
      sealedSpan.className = 'die-weight die-sealed-badge';
      sealedSpan.textContent = 'SEALED';
      modWrap.appendChild(sealedSpan);
    } else if (isPlayerDie && gameState.player.sealNextRound.indexOf(face.number) !== -1) {
      const sealedSpan = document.createElement('span');
      sealedSpan.className = 'die-weight die-sealed-badge';
      sealedSpan.textContent = 'SEALED NEXT ROUND';
      modWrap.appendChild(sealedSpan);
    }

    row.appendChild(btn);
    row.appendChild(modWrap);

    // D-130: weight shows as a line under the square, 2 px per weight above
    // 1 (none at weight 1), in the row's identity colour via CSS. The line
    // adds no layout height, so no square moves; the odds and the symbols
    // below are offset down by --weight-px instead.
    if (isHorizontal && face.weight > 1) {
      row.style.setProperty('--weight-px', (face.weight - 1) * WEIGHT_LINE_PX_PER_POINT + 'px');
      const weightLine = document.createElement('div');
      weightLine.className = 'face-weight-line';
      row.appendChild(weightLine);
    }

    // The horizontal face row's own one-line caption under each square.
    // this roll's odds replace the bare weight number; the
    // weight itself moved into the square's own title (faceTitleText()
    // already prints "weight N"). NAT 1/NAT 20 keep their labels, with the
    // percent beside them.
    let symbolStrip = null;
    if (isHorizontal) {
      const caption = document.createElement('div');
      caption.className = 'die-face-caption';
      const pctText = oddsByFace ? oddsByFace[face.number].pct.toFixed(1) + '%' : '';
      if (isPlayerDie && isFaceSealed(face.number)) {
        caption.textContent = 'SEALED';
      } else if (isPlayerDie && gameState.player.sealNextRound.indexOf(face.number) !== -1) {
        caption.textContent = 'SEALED NEXT ROUND';
      } else if (face.modId === 'NAT_ONE' || face.modId === 'ENEMY_NAT_ONE') {
        // KI-34: a non-breaking space keeps "NAT 1" from splitting mid-label;
        // the forced line break (white-space: pre-line) puts the percent on
        // its own line so neither clips inside the 56px column.
        caption.classList.add('die-face-caption-nat');
        caption.textContent = 'NAT 1' + (pctText ? '\n' + pctText : '');
      } else if (face.modId === 'NAT_TWENTY' || face.modId === 'ENEMY_NAT_TWENTY') {
        caption.classList.add('die-face-caption-nat');
        caption.textContent = 'NAT 20' + (pctText ? '\n' + pctText : '');
        if (isPlayerDie && isFaceTwentyAtCap(face.number)) caption.textContent += ' MAX';
      } else {
        caption.textContent = pctText;
        // ODDS_EMPHASIS (GAME_CONFIG) — a weight-above-1 face's percent
        // drops and grows, for as long as the weight stays above 1.
        // Re-renders from state on every refreshInspector(), a Strengthen
        // included.
        if (face.weight > 1) {
          caption.classList.add('die-face-caption-emphasis');
          caption.style.transform = 'translateY(' + GAME_CONFIG.ODDS_EMPHASIS.DROP_PX + 'px)';
          caption.style.color = GAME_CONFIG.ODDS_EMPHASIS.COLOUR;
        }
      }
      row.appendChild(caption);

      // D-124: the loaded face's mod symbol(s) in a strip under the caption,
      // absolutely placed so the square and caption above never move.
      // Appended after the row's own tip (below), so row.querySelector
      // ('.hover-tip') still finds the face's box first.
      symbolStrip = document.createElement('div');
      symbolStrip.className = 'face-symbol-strip';
      faceSymbolModIds(face).forEach(function(modId) {
        const symbol = document.createElement('span');
        symbol.className = 'face-symbol';
        attachArtIcon(symbol, 'mods', modId, FACE_SYMBOL_PX, 'face-symbol-img');
        setHoverTip(symbol, faceSymbolTipLines(face, modId));
        symbolStrip.appendChild(symbol);
      });
    }

    let pickEligible = false;
    if (pickConfig) {
      pickEligible = !!pickConfig.isEligible(face);
      row.classList.add(pickEligible ? 'die-row-pickable' : 'die-row-pick-inert');
      if (pickEligible) {
        const faceNumber = face.number;
        row.addEventListener('click', function() { pickConfig.onPick(faceNumber); });
      }
    }

    // A currently-Sealed face's hover replaces its usual mod description
    // entirely — that's the one true thing about it right now.
    const hoverText = (isPlayerDie && isFaceSealed(face.number))
      ? 'Counts as blank this round.'
      : faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount);
    // During the Strengthen picker, an eligible row's hover also shows
    // what the face becomes.
    // A now/becomes pair: the face's weight and odds as they are, then at one
    // more weight, odds read off the same bag rollOdds() builds.
    let nowText = null;
    let becomesText = null;
    if (pickConfig && pickConfig.showBecomes && pickEligible) {
      const heavier = faces.map(function(f) { return f.number === face.number ? Object.assign({}, f, { weight: f.weight + 1 }) : f; });
      nowText = 'weight ' + face.weight + ' · ' + oddsByFace[face.number].pct.toFixed(1) + '%';
      becomesText = 'weight ' + (face.weight + 1) + ' · ' + rollOdds(heavier)[face.number].pct.toFixed(1) + '%';
    }
    // D-104/KI-41 — no native title anywhere: this row's own .hover-tip
    // carries everything the old title used to, on every row, blank faces
    // included. D-125: two lines — name and weight, then the text.
    const titleText = faceTitleText(face, isPlayerDie);
    const blankText = isPlayerDie ? 'Gain ' + GAME_CONFIG.BLANK_ROLL_BLOCK + ' block.' : 'Nothing happens.';
    const baseHoverText = hoverText || blankText;
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    // D-128: a loaded, unsealed player face opens one box per mod, load
    // order left to right; every other face keeps the two-line hover.
    const modIds = (isPlayerDie && !isFaceSealed(face.number)) ? faceSymbolModIds(face).filter(function(id) { return gameState.config.mods[id]; }) : [];
    let becomesParent = tip;
    if (modIds.length) {
      tip.classList.add('face-tip-boxes');
      modIds.forEach(function(modId) { becomesParent = tip.appendChild(faceModBox(face, modId)); });
    } else {
      const titleLine = document.createElement('div');
      titleLine.className = 'face-tip-title';
      titleLine.textContent = titleText;
      tip.appendChild(titleLine);
      const currentLine = document.createElement('div');
      currentLine.className = 'face-tip-text';
      currentLine.textContent = baseHoverText;
      tip.appendChild(currentLine);
    }
    if (becomesText) {
      const nowLine = document.createElement('div');
      nowLine.className = 'face-tip-now';
      nowLine.textContent = 'Now: ' + nowText;
      becomesParent.appendChild(nowLine);
      const becomesLine = document.createElement('div');
      becomesLine.className = 'face-tip-becomes';
      becomesLine.textContent = 'Becomes: ' + becomesText;
      becomesParent.appendChild(becomesLine);
    }
    row.appendChild(tip);
    if (symbolStrip) row.appendChild(symbolStrip);

    container.appendChild(row);
  });
}

function flashElement(id, className) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

let lastEnemyHp = null;
let lastPlayerHp = null;

// Plain-text intent display for every pattern kind. #enemyIntentValue
// carries the primary label, #enemyIntentLabel the wind-up round's own
// live "damage taken / breakAt" counter (recomputed fresh every render
// from windupStartHp vs current hp) — empty for every other kind.
// One inline SVG per intent kind, 40px, stroke only. The kind word itself
// is the icon's title and aria-label — the panel prints only the number.
const INTENT_ICON_SHAPES = {
  ATTACK: '<line x1="50" y1="8" x2="50" y2="88"/><line x1="26" y1="62" x2="74" y2="62"/><line x1="40" y1="84" x2="60" y2="84"/>',
  CHARGE: '<polyline points="60,8 34,50 50,50 40,92 68,46 52,46 60,8"/>',
  RELEASE: '<polyline points="60,8 34,50 50,50 40,92 68,46 52,46 60,8"/><line x1="12" y1="50" x2="88" y2="50"/>',
  AFFLICT: '<path d="M50 8 C 70 40 80 56 80 66 A 30 30 0 0 1 20 66 C 20 56 30 40 50 8 Z"/>',
  BROKEN: '<polyline points="60,8 34,50 50,50 40,92 68,46 52,46 60,8"/>'
};

function renderIntentIcon(kindWord, sentence) {
  const el = document.getElementById('enemyIntentIcon');
  if (!el) return;
  if (!kindWord || !INTENT_ICON_SHAPES[kindWord]) {
    el.innerHTML = '';
    el.removeAttribute('aria-label');
    return;
  }
  const tipText = sentence || kindWord;
  el.setAttribute('aria-label', kindWord);
  el.innerHTML = '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" ' +
    'stroke-linecap="square" stroke-linejoin="miter">' +
    INTENT_ICON_SHAPES[kindWord] + '</svg>' +
    '<span class="hover-tip">' + tipText + '</span>';
}

// Which icon this round's intent wears, independent of whatever text a
// genuine enemy Nat puts in #enemyIntentValue.
function intentKindWord(enemy) {
  const entry = enemy.currentEntry;
  if (!entry) return null;
  if (entry.kind === 'attack') return 'ATTACK';
  if (entry.kind === 'afflict') return 'AFFLICT';
  if (entry.kind === 'charge') {
    if (enemy.chargeStage === 'windup') return 'CHARGE';
    if (enemy.chargeBroken) return 'BROKEN';
    return 'RELEASE';
  }
  return null;
}

function renderEnemyIntent() {
  const enemy = gameState.enemy;
  const entry = enemy.currentEntry;
  const valueEl = document.getElementById('enemyIntentValue');
  const labelEl = document.getElementById('enemyIntentLabel');
  const kindWord = intentKindWord(enemy);
  // Both the number's own hover box and the icon's hover box carry the
  // same sentence — the game-font .hover-tip box, never a native title.
  function setValue(text, sentence) {
    valueEl.innerHTML = String(text) + '<span class="hover-tip">' + (sentence || '') + '</span>';
    renderIntentIcon(kindWord, sentence);
  }
  // A genuine enemy Nat this round overrides whatever the pattern's own
  // intent text would otherwise show, for the rest of this round.
  if (gameState.turn.enemyRollOutcome === 'nat_twenty') {
    labelEl.textContent = '';
    setValue('NAT 20', 'Nat 20: forces the boss\'s Charge next round; loaded buff faces trigger only when rolled.');
    return;
  }
  if (gameState.turn.enemyRollOutcome === 'nat_one') {
    // Cardinal and Pontifex's own Nat 1 does not cancel the attack (see
    // GAME_CONFIG.ENEMIES/cards-mods.js) — showing "CANCELLED" for either
    // would be wrong, so only the cancelling (default/Hierophant) case
    // gets that wording.
    const cancels = gameState.enemy.name !== 'Cardinal' && gameState.enemy.name !== 'Pontifex';
    labelEl.textContent = '';
    setValue(cancels ? 'CANCELLED — NAT 1' : 'NAT 1', 'Nat 1: a designed effect happens instead of this round\'s own intent.');
    return;
  }
  if (!entry) {
    labelEl.textContent = '';
    setValue('—', '');
    return;
  }
  if (entry.kind === 'attack') {
    labelEl.textContent = '';
    const aweStacks = gameState.enemy.aweStacks;
    const aweNote = aweStacks > 0 ? ', lowered by ' + aweStacks + ' stacks of awe' : '';
    setValue(entry.rolledValue, 'Attack: deals ' + entry.rolledValue + ' damage this round' + aweNote + '. Block lowers it.');
  } else if (entry.kind === 'charge') {
    if (enemy.chargeStage === 'windup') {
      const taken = Math.max(0, enemy.windupStartHp - enemy.hp);
      labelEl.textContent = 'break ' + taken + ' / ' + entry.breakAt;
      setValue(entry.release, 'Charge: deals no damage this round. Next round the release deals ' + entry.release + '. If it takes ' + entry.breakAt + ' damage this round, the Charge breaks and the release deals nothing.');
    } else if (enemy.chargeBroken) {
      labelEl.textContent = '';
      setValue('BROKEN', 'The Charge broke this round. The release deals nothing.');
    } else {
      labelEl.textContent = '';
      setValue(entry.release, 'Release: deals ' + entry.release + ' damage this round. Block lowers it.');
    }
  } else if (entry.kind === 'afflict') {
    labelEl.textContent = '';
    setValue(entry.stacks, 'Afflict: deals no damage. Applies ' + entry.stacks + ' stacks of poison to the player.');
  }
}

function renderStats() {
  // A kill can leave gameState.enemy.hp negative (overkill is never
  // clamped in state) — displayed HP is clamped to 0 here, at render time only.
  document.getElementById('enemyHpValue').textContent = shownHp(gameState.enemy.hp) + ' / ' + gameState.enemy.maxHp;
  const nameEl = document.getElementById('enemyNameValue');
  if (nameEl) { nameEl.textContent = gameState.enemy.name || '—'; }
  // Pontifex's own panel line: reads the player's heaviest loaded face.
  const readLine = document.getElementById('enemyReadLine');
  if (readLine) {
    if (gameState.enemy.name === 'Pontifex') {
      readLine.style.display = '';
      const readValueEl = document.getElementById('enemyReadValue');
      readValueEl.textContent = 'Reads the heaviest face: Wrath +' + gameState.enemy.wrathPerTrigger + ' when the player rolls it.';
      setHoverTip(readValueEl, 'When the player rolls their heaviest loaded face, Wrath triggers.');
    } else {
      readLine.style.display = 'none';
    }
  }
  renderEnemyIntent();
  document.getElementById('enemyPoisonValue').textContent = gameState.enemy.poisonStacks;
  // Every loaded face on this enemy's own die, named with its face number.
  const loadedBuffs = gameState.enemy.die.faces
    .filter(function(f) { return f.modId !== null; })
    .map(function(f) { return modDisplayName(f.modId) + ' ' + f.number; });
  document.getElementById('enemyBuffsValue').textContent = loadedBuffs.length ? loadedBuffs.join(', ') : '—';
  document.getElementById('enemyActiveValue').textContent = gameState.enemy.activeBuffs.length ? gameState.enemy.activeBuffs.join(', ') : '—';
  // D-104/KI-41 — the enemy panel no longer prints "Loaded buffs"/"Active
  // this turn" as its own lines; hovering the enemy art shows the same
  // information instead, one loaded face per line, then a blank line,
  // then what's active this turn.
  const enemyArtBox = document.getElementById('enemyArtBox');
  if (enemyArtBox) {
    const activeText = 'Active this turn: ' + (gameState.enemy.activeBuffs.length ? gameState.enemy.activeBuffs.join(', ') : '—');
    setHoverTip(enemyArtBox, (loadedBuffs.length ? loadedBuffs : ['—']).concat([' ', activeText]));
  }
  const wrathLine = document.getElementById('enemyWrathLine');
  if (wrathLine) {
    if (gameState.enemy.wrath > 0) {
      wrathLine.style.display = '';
      document.getElementById('enemyWrathValue').textContent = '+' + gameState.enemy.wrath;
      setHoverTip(document.getElementById('enemyWrathValue'), 'Wrath: each Attack deals this much more.');
    } else {
      wrathLine.style.display = 'none';
    }
  }
  const drainLine = document.getElementById('playerDrainLine');
  if (drainLine) {
    if (gameState.player.drainNextRound > 0) {
      drainLine.style.display = '';
      document.getElementById('playerDrainValue').textContent = 'DRAIN −' + gameState.player.drainNextRound + ' SOUL';
      setHoverTip(document.getElementById('playerDrainValue'), 'Drain: ' + gameState.player.drainNextRound + ' less soul at the start of next round.');
    } else {
      drainLine.style.display = 'none';
    }
  }

  document.getElementById('playerBlockValue').textContent = gameState.player.block;
  document.getElementById('playerHpValue').textContent = shownHp(gameState.player.hp) + ' / ' + gameState.player.maxHp;
  document.getElementById('playerSoulValue').textContent = gameState.player.soul + ' / ' + gameState.player.maxSoul;
  const playerDebuffs = [];
  if (gameState.player.poisonStacks) playerDebuffs.push('poison x' + gameState.player.poisonStacks);
  if (gameState.player.penitenceActive) playerDebuffs.push('penitence');
  const playerDebuffsEl = document.getElementById('playerDebuffsValue');
  playerDebuffsEl.textContent = playerDebuffs.length ? playerDebuffs.join(', ') : '—';
  const poisonTip = 'Poison: at the end of your turn, every ' + GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK + ' block you hold removes 1 stack of poison. Then poison deals 1 damage per stack, ignoring block, and loses 1 stack.';
  setHoverTip(playerDebuffsEl, poisonTip);
  renderStatusRows(poisonTip);
  document.getElementById('playerDeckValue').textContent = gameState.player.deck.length;
  document.getElementById('playerDiscardValue').textContent = gameState.player.discard.length;

  document.getElementById('roundValue').textContent = gameState.turn.round;

  if (lastEnemyHp !== null && gameState.enemy.hp !== lastEnemyHp) {
    flashElement('enemyHpValue', 'fx-pop-red');
  }
  lastEnemyHp = gameState.enemy.hp;

  if (lastPlayerHp !== null && gameState.player.hp !== lastPlayerHp) {
    flashElement('playerHpValue', 'fx-pop-red');
  }
  lastPlayerHp = gameState.player.hp;
}

// One 28px square per state present on that side, each carrying the same
// sentence its own stat line already uses on its own hover tip.
function renderStatusRows(poisonTitle) {
  function icon(row, text, className, title) {
    const el = document.createElement('div');
    el.className = 'status-icon ' + className;
    el.textContent = text;
    setHoverTip(el, title);
    row.appendChild(el);
  }

  const playerRow = document.getElementById('playerStatusRow');
  if (playerRow) {
    playerRow.innerHTML = '';
    if (gameState.player.poisonStacks > 0) {
      icon(playerRow, 'P' + gameState.player.poisonStacks, 'status-poison', poisonTitle);
    }
    if (gameState.player.penitenceActive) {
      const turnsLeft = gameState.player.penitenceTurnsRemaining;
      icon(playerRow, 'PN', 'status-penitence', 'Penitence: lose 1 soul at the start of your turn. ' + turnsLeft + (turnsLeft === 1 ? ' turn left.' : ' turns left.'));
    }
    if (gameState.player.drainNextRound > 0) {
      icon(playerRow, 'D' + gameState.player.drainNextRound, 'status-drain', 'Drain: ' + gameState.player.drainNextRound + ' less soul at the start of next round.');
    }
    if (gameState.turn.sealedFaces.length > 0) {
      icon(playerRow, 'S', 'status-seal', 'Sealed: face ' + gameState.turn.sealedFaces.join(', ') + ' counts as blank this round.');
    }
  }

  const enemyRow = document.getElementById('enemyStatusRow');
  if (enemyRow) {
    enemyRow.innerHTML = '';
    if (gameState.enemy.poisonStacks > 0) {
      icon(enemyRow, 'P' + gameState.enemy.poisonStacks, 'status-poison', 'Poison: deals 1 damage per stack at the end of its turn, then loses 1 stack.');
    }
    if (gameState.enemy.wrath > 0) {
      icon(enemyRow, 'W' + gameState.enemy.wrath, 'status-wrath', 'Wrath: each Attack deals this much more.');
    }
    if (gameState.enemy.aweStacks > 0) {
      icon(enemyRow, 'A' + gameState.enemy.aweStacks, 'status-awe', 'Awe: lowers this enemy\'s next Attack by this many stacks, then loses 1 stack at the start of its round.');
    }
  }
}

function renderArtBoxes() {
  setArtImage('playerArtImg', 'playerArtLabel', 'art/ordained.png', 'ORDAINED ART');
  const enemyName = gameState.enemy.name;
  setArtImage('enemyArtImg', 'enemyArtLabel', 'art/' + (enemyName || '').toLowerCase() + '.png',
    (enemyName ? enemyName.toUpperCase() + ' ' : '') + 'ART');
}

// No gold mechanic exists in V1; the field is read if it is ever added.
// Shown only while Third Eye is held, unused this act, and a roll is
// actually pending — the one window thirdEyeChooseFace() itself accepts.
function renderThirdEyeButton() {
  const btn = document.getElementById('thirdEyeBtn');
  if (!btn) return;
  const eligible = hasArtifact('third_eye') && !gameState.run.thirdEyeUsedThisAct &&
    gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved;
  btn.style.display = eligible ? '' : 'none';
  btn.classList.toggle('choosing', thirdEyeChoosing);
  if (!eligible) { thirdEyeChoosing = false; }

  const rerollBtn = document.getElementById('secondChanceBtn');
  if (rerollBtn) {
    rerollBtn.style.display = (hasArtifact('second_chance') && !gameState.turn.secondChanceUsedThisFight &&
      gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved) ? '' : 'none';
  }
}

// D-114 — the coin icon beside the amount; the amount is the only part
// that ever changes, so the icon element is never rebuilt.
function renderTopBarTokens() {
  const goldEl = document.getElementById('goldValue');
  if (!goldEl) return;
  const goldIcon = document.getElementById('goldIcon');
  if (goldIcon && !goldIcon.dataset.wired) {
    goldIcon.dataset.wired = '1';
    const showFallback = function() {
      goldIcon.style.display = 'none';
      document.getElementById('goldFallback').style.display = '';
    };
    goldIcon.onerror = showFallback;
    if (goldIcon.complete && goldIcon.naturalWidth === 0) showFallback();
  }
  document.getElementById('goldAmount').textContent = gameState.run.gold === undefined ? '—' : gameState.run.gold;
  setHoverTip(goldEl, 'Gold: ' + (gameState.run.gold === undefined ? '—' : gameState.run.gold) + '. Spent in the shop after every rite.');

  const artifactRow = document.getElementById('artifactRow');
  if (!artifactRow) return;
  const slots = artifactRow.querySelectorAll('.artifact-slot');
  slots.forEach(function(slot, index) {
    const artifactId = gameState.run.artifacts[index];
    if (artifactId && gameState.config.artifacts[artifactId]) {
      const artifact = gameState.config.artifacts[artifactId];
      // The visible name lives in its own child span — slot.textContent
      // stays exactly the held artifact's name — with the hover tip as a
      // sibling span, appended after (setHoverTip), never inside it. The
      // icon is kept between renders so it never reloads; the name span is
      // hidden only once the icon has loaded.
      if (slot.dataset.artifactId !== artifactId) {
        slot.innerHTML = '';
        slot.dataset.artifactId = artifactId;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'artifact-slot-name';
        nameSpan.textContent = artifact.name;
        slot.appendChild(nameSpan);
        const img = document.createElement('img');
        img.className = 'artifact-slot-img';
        img.alt = '';
        img.onload = function() { nameSpan.style.visibility = 'hidden'; };
        img.onerror = function() { img.style.display = 'none'; };
        img.src = 'art/artifacts/' + artifactId + '.png';
        slot.appendChild(img);
      }
      setHoverTip(slot, artifact.name + ' — ' + artifact.text);
    } else {
      slot.innerHTML = '';
      delete slot.dataset.artifactId;
      slot.classList.remove('hover-parent');
    }
  });
}

// ---------- DIE ICONS ----------
// One outline per die size: 20 faces a hexagon d20, 12 a pentagon, 6 a
// square. Shape follows GAME_CONFIG.DIE_SIZE, never a bare literal.

const DIE_ICON_SHAPES = {
  20: '<polygon points="50,6 88,28 88,72 50,94 12,72 12,28"/>' +
      '<polygon points="50,26 76,70 24,70"/>' +
      '<line x1="50" y1="6" x2="50" y2="26"/><line x1="88" y1="28" x2="50" y2="26"/>' +
      '<line x1="12" y1="28" x2="50" y2="26"/><line x1="88" y1="72" x2="76" y2="70"/>' +
      '<line x1="12" y1="72" x2="24" y2="70"/><line x1="50" y1="94" x2="50" y2="70"/>',
  12: '<polygon points="50,8 91,38 76,88 24,88 9,38"/>' +
      '<polygon points="50,30 71,45 63,70 37,70 29,45"/>' +
      '<line x1="50" y1="8" x2="50" y2="30"/><line x1="91" y1="38" x2="71" y2="45"/>' +
      '<line x1="76" y1="88" x2="63" y2="70"/><line x1="24" y1="88" x2="37" y2="70"/>' +
      '<line x1="9" y1="38" x2="29" y2="45"/>',
  6: '<rect x="12" y="12" width="76" height="76"/><rect x="32" y="32" width="36" height="36"/>' +
     '<line x1="12" y1="12" x2="32" y2="32"/><line x1="88" y1="12" x2="68" y2="32"/>' +
     '<line x1="88" y1="88" x2="68" y2="68"/><line x1="12" y1="88" x2="32" y2="68"/>'
};

function dieIconSvg(dieSize, colourVar) {
  const shape = DIE_ICON_SHAPES[dieSize] || DIE_ICON_SHAPES[20];
  return '<svg viewBox="0 0 100 100" fill="none" stroke="' + colourVar + '" stroke-width="3">' + shape + '</svg>';
}

// Which identity colour the number inside the player's own d20 wears.
function playerDieIconColour() {
  const outcome = gameState.turn.rollOutcome;
  if (outcome === 'nat_twenty' || outcome === 'nat_one') return 'var(--nat)';
  if (outcome === 'mod') return 'var(--player-mod)';
  return 'var(--blank)';
}

function renderDieIcons() {
  const playerEl = document.getElementById('playerDieIcon');
  if (playerEl) {
    const rolled = shownPlayerRoll().faceNumber;
    const frame = dieIconFrame('player', rolled, playerDieIconColour());
    playerEl.innerHTML = dieIconWrapHtml(frame, GAME_CONFIG.DIE_SIZE.PLAYER, 'var(--text)');
    setHoverTip(playerEl, 'Your die: d' + GAME_CONFIG.DIE_SIZE.PLAYER +
      (frame.stage === 'spin' ? ', rolling.' : rolled === null ? ', not yet rolled this round.' : ', rolled ' + rolled + ' this round.'));
  }

  const enemyEl = document.getElementById('enemyDieIcon');
  if (!enemyEl) return;
  // D-29 — a normal with no die shows an empty outline, never a fake die.
  if (!gameState.enemy.hasDie || !gameState.enemy.die.faces.length) {
    enemyEl.innerHTML = '<div class="die-icon-empty"></div>';
    setHoverTip(enemyEl, 'This enemy carries no die.');
    return;
  }
  const size = gameState.enemy.die.faces.length;
  const shown = shownEnemyRoll();
  const rolled = shown.faceNumber;
  const outcome = shown.outcome;
  let word = '';
  let wordColour = 'var(--enemy-mod)';
  if (outcome === 'nat_twenty') { word = 'NAT 20'; wordColour = 'var(--nat)'; }
  else if (outcome === 'nat_one') { word = 'NAT 1'; wordColour = 'var(--nat)'; }
  else if (rolled !== null) {
    const face = gameState.enemy.die.faces[rolled - 1];
    if (face && face.modId !== null) word = modDisplayName(face.modId);
  }
  const frame = dieIconFrame('enemy', rolled, 'var(--enemy-mod)');
  enemyEl.innerHTML = dieIconWrapHtml(frame, size, 'var(--enemy-mod)') +
    '<div class="die-icon-side"><div style="color:' + wordColour + '">' + word + '</div>' +
    '<div style="color:var(--muted)">d' + size + '</div></div>';
  setHoverTip(enemyEl, 'Enemy die: d' + size + (frame.stage === 'spin' ? ', rolling.' : rolled === null ? ', not yet rolled this round.' : ', rolled ' + rolled + ' this round.'));
}

function renderCardButtons() {
  const handRow = document.getElementById('handRow');
  if (!handRow) return;
  handRow.innerHTML = '';
  const active = gameState.run.status === 'active';
  gameState.player.hand.forEach(function(cardId, index) {
    const card = getCard(cardId);
    const affordable = gameState.player.soul >= getCardCost(card);
    const btn = renderCard(cardId, {
      size: 'hand',
      button: true,
      unaffordable: !affordable,
      onClick: function() {
        log('[CLICK] ' + card.name);
        playCard(index);
      }
    });
    btn.disabled = !active;
    handRow.appendChild(btn);
  });
}
