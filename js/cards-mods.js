// ============================================================
// CARDS-MODS.JS — BUILD 090 file split
// Card lookup/draw/play, and init() — every card, mod, and class
// definition, plus the Ordained's passive registrations. Cards and mods
// are not actually separable files in this codebase: they are all built
// inline inside one init() function, intermixed with class registration
// and the one-time dev-chrome reset. init() is kept intact and unsplit
// here rather than decomposed into buildCards()/buildMods()/buildClasses()
// helpers — that would be a real refactor of working code, not a file
// split, and this build's whole point is zero behaviour change.
// init() itself is never called until window's DOMContentLoaded fires
// (see bootstrap.js) — by then every other file, including rendering.js's
// renderDevModOptions() (called at init()'s own end) and run-and-map.js's
// startNewRun() (called at init()'s very end), has already executed and
// defined its globals in the one shared script scope. Depends on state.js,
// listener-registry.js, and pipeline.js (all three already loaded first).
// ============================================================

// ---------- CARD LOOKUP ----------

function getCard(id) { return gameState.config.cards[id]; }

// BUILD 058: a handful of cards (starting with Rapture) have a cost that
// depends on live gameState at play time rather than a fixed soulCost.
// Such cards carry an optional card.getCost(gameState) function; every
// other card keeps using its static soulCost unchanged.
function getCardCost(card) {
  return card.getCost ? card.getCost(gameState) : card.soulCost;
}

// ---------- CARD DRAWING ----------

function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (gameState.player.deck.length === 0) {
      if (gameState.player.discard.length === 0) {
        log('[DRAW] deck and discard both empty, cannot draw');
        return;
      }
      const reshuffled = shuffle(gameState.player.discard.slice());
      const reshuffledCount = reshuffled.length;
      updatePlayer({ deck: reshuffled, discard: [] });
      log('[DRAW] discard reshuffled into deck: ' + reshuffledCount + ' cards');
    }

    const deck = gameState.player.deck.slice();
    const cardId = deck.shift();
    updatePlayer({ deck: deck, hand: gameState.player.hand.concat([cardId]) });
    log('[DRAW] drew ' + getCard(cardId).name);
  }
}

// ---------- CARD PLAY ----------

function playCard(handIndex) {
  // BUILD 112 (KI-2): a card must never resolve once the run has stopped
  // being active — the same guard callListeners() (listener-registry.js)
  // already applies to every hook dispatch, extended here to the one
  // direct state-mutating entry point that doesn't go through a listener.
  if (gameState.run.status !== 'active') { log('[CARD] cannot play — run is not active'); return; }

  const cardId = gameState.player.hand[handIndex];
  const card = getCard(cardId);

  if (gameState.turn.phase !== 'CARD_PHASE') {
    log('[CARD] cannot play ' + card.name + ' outside CARD_PHASE');
    return;
  }

  const cost = getCardCost(card);

  if (gameState.player.soul < cost) {
    log('[CARD] not enough soul for ' + card.name + ' (cost ' + cost + ', have ' + gameState.player.soul + ')');
    return;
  }

  updatePlayer({ soul: gameState.player.soul - cost });

  // BUILD 094: card-play sound, announced before the card's own effect()
  // resolves — a card is "played" here, the one place playCard() commits
  // to it (soul already spent), so this is the natural announce point,
  // ahead of whatever damage/block sound that effect() goes on to trigger
  // a moment later (e.g. an attack card's click, then dealDamage()'s own
  // damage_enemy landing sound). Classification: card.type already
  // distinguishes attack/block/utility for every card in the pool; rite
  // and litany are the only two whose effect() calls both dealDamage() and
  // dealBlock() (grep-confirmed against every card's effect body), so
  // they're checked by id rather than adding a fourth card.type value
  // nothing else needs. Utility cards (draw/soul/poison — no damage or
  // block at all) get no card-play sound: the prompt names only attack/
  // block/hybrid, and utility fits none of them, the same "silence is
  // deliberate" the prompt states outright for draw.
  const cardSoundEvent = (cardId === 'rite' || cardId === 'litany') ? 'card_hybrid'
    : card.type === 'attack' ? 'card_attack'
    : card.type === 'block' ? 'card_block'
    : null;
  if (cardSoundEvent) { playAudioEvent(cardSoundEvent); }

  card.effect(gameState);
  callListeners('ON_CARD_PLAY', { card: card });

  const newHand = gameState.player.hand.slice();
  newHand.splice(handIndex, 1);
  updatePlayer({ hand: newHand, discard: gameState.player.discard.concat([cardId]) });

  log('[CARD] played ' + card.name + ' (cost ' + cost + ')');

  // BUILD 053: a card can kill the enemy mid-CARD_PHASE, but no phase
  // transition happens while cards are being played, so the existing
  // win/loss guard at the top of runPhase() never gets a chance to see
  // it until End Turn is clicked. Calling runPhase() with the CURRENT
  // phase re-enters that exact same guard immediately: it checks
  // enemy.hp <= 0 before anything else, sets run.status to 'win', logs
  // [WIN], opens the die action screen via openDieActionScreen() (the
  // identical victory path CHECK_WIN_LOSS already calls), and returns
  // without touching turn.phase or re-running any phase logic — so
  // nothing else about CARD_PHASE re-fires. The guard is itself gated
  // on run.status === 'active', so if this has already fired (or the
  // fight was already won/lost some other way), this call is a no-op
  // and the guard cannot run the victory path a second time.
  // BUILD 135: was its own inline run.status/enemy.hp check calling
  // runPhase() directly; now the same one-line call to phase-machine.js's
  // checkWinNow() every other player-side kill path uses (rolled mod
  // trigger, Nat 20 sweep, Bound scan) — identical guard, no behaviour
  // change, one fewer copy of it.
  checkWinNow();
}

// ---------- INIT ----------

function init() {

  // Ring 0 cards
  gameState.config.cards['strike'] = {
    id: 'strike', name: 'Strike', soulCost: 1, type: 'attack', classRestriction: null, tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 5, 'attack', 'strike');
    }
  };

  gameState.config.cards['ward'] = {
    id: 'ward', name: 'Ward', soulCost: 1, type: 'block', classRestriction: null, tags: [],
    effect: function(gameState) {
      const block = dealBlock(5, 'ward');
    }
  };

  gameState.config.cards['rite'] = {
    id: 'rite', name: 'Rite', soulCost: 2, type: 'attack', classRestriction: 'ordained', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 5, 'attack', 'rite');
      const block = dealBlock(6, 'rite');
    }
  };

  // Stage 1.11 substage 2 — real card pool, tier 1: the eight cards that
  // are just numbers on existing verbs and need no new engine capability.
  // Names are placeholders and will change. The seven conditional/die-
  // reading cards come in later substages. Registered in config.cards
  // exactly like strike/ward/rite (so getCard()/drawCards()/playCard()
  // work on them unchanged once added to a deck), then also referenced
  // (same object, not a copy) from config.cardPool, which is what the
  // reward screen actually draws its 3 offered options from. TEST_A/B/C
  // (BUILD 050) are deleted entirely — replaced, not kept alongside these.
  gameState.config.cards['rebuke'] = {
    id: 'rebuke', name: 'Rebuke', soulCost: 0, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 4, 'attack', 'rebuke');
    }
  };

  gameState.config.cards['censure'] = {
    id: 'censure', name: 'Censure', soulCost: 2, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 14, 'attack', 'censure');
    }
  };

  gameState.config.cards['judgement'] = {
    id: 'judgement', name: 'Judgement', soulCost: 3, type: 'attack', classRestriction: null, tier: 'uncommon', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 20, 'attack', 'judgement');
    }
  };

  gameState.config.cards['vestment'] = {
    id: 'vestment', name: 'Vestment', soulCost: 2, type: 'block', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const block = dealBlock(13, 'vestment');
    }
  };

  gameState.config.cards['litany'] = {
    id: 'litany', name: 'Litany', soulCost: 2, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 7, 'attack', 'litany');
      const block = dealBlock(7, 'litany');
    }
  };

  // Draws through the existing drawCards() path unchanged — same call
  // Offering's mod effect already uses.
  gameState.config.cards['scripture'] = {
    id: 'scripture', name: 'Scripture', soulCost: 1, type: 'utility', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      drawCards(2);
    }
  };

  // Grants soul through the exact same updatePlayer({ soul: ... }) call
  // the Offering mod already uses — no new helper.
  // BUILD 052: cost dropped from 1 to 0 (was a net +1 soul for a card
  // slot, below the 6-8 per soul band). Effect unchanged — still grants 2.
  gameState.config.cards['communion'] = {
    id: 'communion', name: 'Communion', soulCost: 0, type: 'utility', classRestriction: null, tier: 'uncommon', tags: ['soul'],
    effect: function(gameState) {
      updatePlayer({ soul: gameState.player.soul + 2 });
    }
  };

  // Applies poison through the exact same gameState.enemy.poisonStacks
  // field the Blight/Virulence mods and the dev poison applier already
  // write to — no new phase logic, no changes to the decay tick.
  gameState.config.cards['censer'] = {
    id: 'censer', name: 'Censer', soulCost: 1, type: 'utility', classRestriction: null, tier: 'common', tags: ['poison'],
    effect: function(gameState) {
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + 4 });
    }
  };

  // BUILD 052: tier 3, state-read conditionals — each reads live gameState
  // at play time (poison stacks or enemy intent) rather than a fixed number.
  gameState.config.cards['purge'] = {
    id: 'purge', name: 'Purge', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: ['poison'],
    effect: function(gameState) {
      const poisoned = gameState.enemy.poisonStacks > 0;
      const damage = dealDamage('enemy', poisoned ? 10 : 6, 'attack', 'purge');
      if (poisoned) {
        log('[CARD] purge: 10 damage, enemy poisoned');
      } else {
        log('[CARD] purge: 6 damage');
      }
    }
  };

  gameState.config.cards['interdict'] = {
    id: 'interdict', name: 'Interdict', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: [],
    // BUILD 141 (item B): reads getIncomingIntentDamage() (pipeline.js)
    // instead of the old flat gameState.enemy.intent >= 12 comparison — a
    // wind-up or a broken release deals 0 real damage this round, so this
    // now correctly reads 5 block there instead of 10, even though the
    // enemy's pattern entry for a charge still names a much bigger release
    // number.
    effect: function(gameState) {
      const heavyIntent = getIncomingIntentDamage() >= 12;
      const block = dealBlock(heavyIntent ? 10 : 5, 'interdict');
      if (heavyIntent) {
        log('[CARD] interdict: 10 block, intent 12+');
      } else {
        log('[CARD] interdict: 5 block');
      }
    }
  };

  gameState.config.cards['reckoning'] = {
    id: 'reckoning', name: 'Reckoning', soulCost: 1, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['poison'],
    effect: function(gameState) {
      const stacks = gameState.enemy.poisonStacks;
      const damage = dealDamage('enemy', 3 + (2 * stacks), 'attack', 'reckoning');
      log('[CARD] reckoning: ' + damage + ' damage, ' + stacks + ' poison stacks');
    }
  };

  // BUILD 055: tier 4 — Retribution, the anti-passivity hybrid. Reads
  // gameState.player.block live at play time, exactly like Purge and
  // Reckoning already read poison stacks. Capped at 12 (taste call, see
  // CLAUDE.md CONFIRMED WORKING): uncapped, a Consecrate turn reaches the
  // mid-20s to mid-30s off one 1-soul card, trivialising the current test
  // enemy while staying irrelevant against later, larger enemy HP pools.
  gameState.config.cards['retribution'] = {
    id: 'retribution', name: 'Retribution', soulCost: 1, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['bastion'],
    effect: function(gameState) {
      const block = gameState.player.block;
      const capped = block > 12;
      const rawDamage = capped ? 12 : block;
      const damage = dealDamage('enemy', rawDamage, 'attack', 'retribution');
      if (capped) {
        log('[CARD] retribution: ' + damage + ' damage (capped, block ' + block + ')');
      } else {
        log('[CARD] retribution: ' + damage + ' damage (block ' + block + ')');
      }
    }
  };

  // BUILD 057: tier 5 — Covenant, the first card to consume BUILD 056's
  // roll exposure. Reads gameState.turn.rolledFaceWeight directly (never
  // re-derives weight from gameState.die.faces) so it rewards Strengthen
  // concentration on whatever face actually came up this turn, regardless
  // of whether that face resolved as blank or a mod trigger.
  gameState.config.cards['covenant'] = {
    id: 'covenant', name: 'Covenant', soulCost: 1, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['mass'],
    effect: function(gameState) {
      const weight = gameState.turn.rolledFaceWeight;
      const damage = dealDamage('enemy', 2 + (3 * weight), 'attack', 'covenant');
      log('[CARD] covenant: ' + damage + ' damage (face weight ' + weight + ')');
    }
  };

  // BUILD 058: tier 5 — Rapture, the last card in the pool. getCost() is
  // read by both playCard()'s soul-affordability gate and
  // renderCardButtons()'s hand-card badge via the shared getCardCost()
  // helper, so the badge itself reflects the reduced cost on a mod turn,
  // not just the play logic. Damage always routes through
  // calculateDamage() tagged 'attack', unaffected by which cost branch
  // applied.
  //
  // BUILD 066: switched from reading gameState.turn.rollOutcome === 'mod'
  // to gameState.turn.modTriggeredThisTurn. rollOutcome alone can't carry
  // this condition on a Nat 20 turn — it reads 'nat_twenty' there, never
  // 'mod', regardless of how many loaded faces just triggered — so Rapture
  // needs a flag set at the actual trigger site rather than re-derived
  // from the roll result. modTriggeredThisTurn is set by the shared
  // mod_dispatch MOD_TRIGGER listener (see init()), the one dispatch path
  // both a normal single-face mod roll and Nat 20's onNatTwenty loop both
  // call through, so this stays true to "reuse the same dispatch path" —
  // no parallel state field duplicating what a mod trigger already means,
  // just the one flag that was previously implicit in rollOutcome === 'mod'
  // made explicit so it survives a Nat 20 turn too. Reset to false every
  // START_OF_TURN alongside rollOutcome/rolledFaceWeight.
  gameState.config.cards['rapture'] = {
    id: 'rapture', name: 'Rapture', soulCost: 2, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['soul'],
    getCost: function(gameState) {
      return gameState.turn.modTriggeredThisTurn ? 0 : 2;
    },
    effect: function(gameState) {
      const modTriggered = gameState.turn.modTriggeredThisTurn;
      const damage = dealDamage('enemy', 12, 'attack', 'rapture');
      if (modTriggered) {
        log('[CARD] rapture: ' + damage + ' damage (free, mod triggered)');
      } else {
        log('[CARD] rapture: ' + damage + ' damage (2 soul)');
      }
    }
  };

  // BUILD 059: tier 5 — Orison, the last card in the pool. Reads
  // gameState.turn.rollOutcome directly (never re-derives blankness from
  // the die, the face, or the blank passive listener) — this is what
  // correctly excludes NAT_ONE/NAT_TWENTY, which carry no loaded mod but
  // are not 'blank' in rollOutcome terms, from the 9-damage branch.
  // Damage always routes through calculateDamage() tagged 'attack'.
  gameState.config.cards['orison'] = {
    id: 'orison', name: 'Orison', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const isBlank = gameState.turn.rollOutcome === 'blank';
      const damage = dealDamage('enemy', isBlank ? 9 : 5, 'attack', 'orison');
      if (isBlank) {
        log('[CARD] orison: ' + damage + ' damage, blank roll');
      } else {
        log('[CARD] orison: ' + damage + ' damage');
      }
    }
  };

  // ---------- BUILD 131: checkpoint 3, sixteen new cards, no new engine
  // code — every one reads state a card already reads elsewhere (rolled
  // face weight/trigger count, block, poison stacks, soul) through the
  // exact same fields/helpers the existing pool already uses. Same
  // capped/uncapped two-branch log style Retribution/Tithe/Anathema
  // already use for every capped card below.

  // Tenet — tier uncommon, cost 2, tags Growth+Mass. Reads the rolled
  // face's own modData.triggerCount (BUILD 108, run-scoped, not
  // fight-scoped) — a blank roll's face carries no modData, so the read
  // falls through to 0 exactly as a non-triggering face already does for
  // Zeal/Cope's own accumulatedBonus/copeBonus reads. BUILD 139: no cap —
  // +1 per trigger instead of +3, for slower, uncapped growth. Faces 1 and
  // 20 carry this same triggerCount field (BUILD 138), so a Nat roll reads
  // that face's own count exactly like any other face.
  gameState.config.cards['tenet'] = {
    id: 'tenet', name: 'Tenet', soulCost: 2, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['growth', 'mass'],
    effect: function(gameState) {
      const faceNumber = gameState.turn.rolledFaceNumber;
      const face = faceNumber ? gameState.die.faces[faceNumber - 1] : null;
      const triggers = (face && face.modData && face.modData.triggerCount) || 0;
      const damage = dealDamage('enemy', 6 + triggers, 'attack', 'tenet');
      log('[CARD] tenet: ' + damage + ' damage (face triggered ' + triggers + ' times)');
    }
  };

  // Gradual — tier uncommon, cost 1, tags Mass. Scans every loaded face
  // (modId !== null) for the highest weight, same face.weight field
  // Covenant/Tabernacle read off a single rolled face, just maxed across
  // the whole die here instead. BUILD 139: no cap — +1 per weight instead
  // of +3, for slower, uncapped growth.
  gameState.config.cards['gradual'] = {
    id: 'gradual', name: 'Gradual', soulCost: 1, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['mass'],
    effect: function(gameState) {
      const heaviest = gameState.die.faces.reduce(function(max, f) {
        return (f.modId !== null && !isFaceSealed(f.number) && f.weight > max) ? f.weight : max;
      }, 0);
      const damage = dealDamage('enemy', 3 + heaviest, 'attack', 'gradual');
      log('[CARD] gradual: ' + damage + ' damage (heaviest loaded face weight ' + heaviest + ')');
    }
  };

  // Vacancy — tier common, cost 2, tags Mass. Counts blank (modId null)
  // faces among faces 2-19 (index 1-18), excluding the two Nat faces.
  gameState.config.cards['vacancy'] = {
    id: 'vacancy', name: 'Vacancy', soulCost: 2, type: 'attack', classRestriction: null, tier: 'common', tags: ['mass'],
    effect: function(gameState) {
      const blanks = gameState.die.faces.filter(function(f) {
        return f.number >= 2 && f.number <= 19 && f.modId === null;
      }).length;
      const raw = blanks;
      const capped = raw > 16;
      const damage = dealDamage('enemy', capped ? 16 : raw, 'attack', 'vacancy');
      if (capped) {
        log('[CARD] vacancy: ' + damage + ' damage (capped, ' + blanks + ' blank faces)');
      } else {
        log('[CARD] vacancy: ' + damage + ' damage (' + blanks + ' blank faces)');
      }
    }
  };

  // Lauds — tier common, cost 1, tags Growth. Counts loaded mods (both
  // slots) carrying the Growth tag across the whole die — a two-mod face
  // counts twice, same modId/modId2 scan Congregation already uses, just
  // tallied instead of booleaned.
  gameState.config.cards['lauds'] = {
    id: 'lauds', name: 'Lauds', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: ['growth'],
    effect: function(gameState) {
      function hasGrowthTag(modId) {
        const mod = gameState.config.mods[modId];
        return !!mod && !!mod.tags && mod.tags.indexOf('growth') !== -1;
      }
      let growthCount = 0;
      gameState.die.faces.forEach(function(f) {
        if (f.modId !== null && hasGrowthTag(f.modId)) { growthCount++; }
        if (f.modId2 && hasGrowthTag(f.modId2)) { growthCount++; }
      });
      const raw = 4 + (3 * growthCount);
      const capped = raw > 13;
      const damage = dealDamage('enemy', capped ? 13 : raw, 'attack', 'lauds');
      if (capped) {
        log('[CARD] lauds: ' + damage + ' damage (capped, ' + growthCount + ' loaded Growth mods)');
      } else {
        log('[CARD] lauds: ' + damage + ' damage (' + growthCount + ' loaded Growth mods)');
      }
    }
  };

  // Chastise — tier common, cost 1, no tags. Flat damage, same shape as Rebuke.
  gameState.config.cards['chastise'] = {
    id: 'chastise', name: 'Chastise', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 7, 'attack', 'chastise');
    }
  };

  // Cloister — tier common, cost 1, no tags. Flat block, same shape as Ward.
  gameState.config.cards['cloister'] = {
    id: 'cloister', name: 'Cloister', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const block = dealBlock(7, 'cloister');
    }
  };

  // Psalm — tier common, cost 0, no tags. Draws through the same
  // drawCards() path Scripture already uses.
  gameState.config.cards['psalm'] = {
    id: 'psalm', name: 'Psalm', soulCost: 0, type: 'utility', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      drawCards(1);
    }
  };

  // Reliquary — tier common, cost 1, tags Bastion. Reads block BEFORE its
  // own dealBlock() call adds to it, same "read live state before the
  // card's own effect changes it" shape as every other conditional card.
  gameState.config.cards['reliquary'] = {
    id: 'reliquary', name: 'Reliquary', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: ['bastion'],
    effect: function(gameState) {
      const blockBefore = gameState.player.block;
      const block = dealBlock(6, 'reliquary');
      if (blockBefore >= 10) {
        const damage = dealDamage('enemy', 5, 'attack', 'reliquary');
        log('[CARD] reliquary: ' + block + ' block, ' + damage + ' damage (block was ' + blockBefore + ')');
      } else {
        log('[CARD] reliquary: ' + block + ' block');
      }
    }
  };

  // Vindication — tier rare, cost 2, tags Bastion. Block is read only,
  // never spent — same read-not-spend shape Retribution/Anathema already
  // use, just doubled and capped higher.
  gameState.config.cards['vindication'] = {
    id: 'vindication', name: 'Vindication', soulCost: 2, type: 'attack', classRestriction: null, tier: 'rare', tags: ['bastion'],
    effect: function(gameState) {
      const block = gameState.player.block;
      const raw = 2 * block;
      const capped = raw > 24;
      const damage = dealDamage('enemy', capped ? 24 : raw, 'attack', 'vindication');
      if (capped) {
        log('[CARD] vindication: ' + damage + ' damage (capped, block ' + block + ')');
      } else {
        log('[CARD] vindication: ' + damage + ' damage (block ' + block + ')');
      }
    }
  };

  // Myrrh — tier uncommon, cost 1, tags Poison. Reads gameState.enemy.
  // poisonStacks, the same field Reckoning/Censer already read/write.
  gameState.config.cards['myrrh'] = {
    id: 'myrrh', name: 'Myrrh', soulCost: 1, type: 'block', classRestriction: null, tier: 'uncommon', tags: ['poison'],
    effect: function(gameState) {
      const stacks = gameState.enemy.poisonStacks;
      const raw = 6 + stacks;
      const capped = raw > 12;
      const block = dealBlock(capped ? 12 : raw, 'myrrh');
      if (capped) {
        log('[CARD] myrrh: ' + block + ' block (capped, ' + stacks + ' stacks of poison)');
      } else {
        log('[CARD] myrrh: ' + block + ' block (' + stacks + ' stacks of poison)');
      }
    }
  };

  // Exequy — tier rare, cost 0, tags Poison. Reads enemy poison stacks
  // without removing them, same read-only shape as Reckoning's own read.
  gameState.config.cards['exequy'] = {
    id: 'exequy', name: 'Exequy', soulCost: 0, type: 'attack', classRestriction: null, tier: 'rare', tags: ['poison'],
    effect: function(gameState) {
      const stacks = gameState.enemy.poisonStacks;
      const capped = stacks > 12;
      const damage = dealDamage('enemy', capped ? 12 : stacks, 'attack', 'exequy');
      if (capped) {
        log('[CARD] exequy: ' + damage + ' damage (capped, ' + stacks + ' stacks of poison)');
      } else {
        log('[CARD] exequy: ' + damage + ' damage (' + stacks + ' stacks of poison)');
      }
    }
  };

  // Hosanna — tier common, cost 1, tags none. BUILD 142 (item E) reworks
  // this card entirely: reads the enemy's own intent this round
  // (gameState.enemy.currentEntry — set by advanceEnemyIntentForRound(),
  // pipeline.js) instead of the player's remaining soul. A wind-up, a
  // release and an Afflict all count as "not an Attack" — only a literal
  // {kind:'attack'} entry gets the base 6.
  gameState.config.cards['hosanna'] = {
    id: 'hosanna', name: 'Hosanna', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const entry = gameState.enemy.currentEntry;
      const notAttack = !entry || entry.kind !== 'attack';
      const damage = dealDamage('enemy', notAttack ? 12 : 6, 'attack', 'hosanna');
      if (notAttack) {
        log('[CARD] hosanna: ' + damage + ' damage (enemy intent is not an Attack)');
      } else {
        log('[CARD] hosanna: ' + damage + ' damage');
      }
    }
  };

  // Gloria — tier uncommon, cost 4, tags Soul. Flat damage, no special
  // affordability code — renderCardButtons()'s existing soul >= cost check
  // already dims it on base soul 3, same as any other card.
  gameState.config.cards['gloria'] = {
    id: 'gloria', name: 'Gloria', soulCost: 4, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['soul'],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 30, 'attack', 'gloria');
    }
  };

  // Oblation — tier rare, cost 0, tags Soul. Spends whatever soul is left
  // (cost is 0, so gameState.player.soul here is the pre-play amount,
  // untouched by playCard()'s cost deduction) and zeroes it via the same
  // updatePlayer({ soul: ... }) path Communion/Largesse already use.
  gameState.config.cards['oblation'] = {
    id: 'oblation', name: 'Oblation', soulCost: 0, type: 'attack', classRestriction: null, tier: 'rare', tags: ['soul'],
    effect: function(gameState) {
      const spent = gameState.player.soul;
      const raw = 7 * spent;
      const capped = raw > 42;
      const damage = dealDamage('enemy', capped ? 42 : raw, 'attack', 'oblation');
      updatePlayer({ soul: 0 });
      if (capped) {
        log('[CARD] oblation: ' + damage + ' damage (capped, ' + spent + ' soul spent, soul now 0)');
      } else {
        log('[CARD] oblation: ' + damage + ' damage (' + spent + ' soul spent, soul now 0)');
      }
    }
  };

  // Tabernacle — tier common, cost 1, tags Mass. Reads gameState.turn.
  // rolledFaceWeight, the exact field Covenant already reads.
  gameState.config.cards['tabernacle'] = {
    id: 'tabernacle', name: 'Tabernacle', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: ['mass'],
    effect: function(gameState) {
      const weight = gameState.turn.rolledFaceWeight;
      const raw = 3 + (3 * weight);
      const capped = raw > 12;
      const block = dealBlock(capped ? 12 : raw, 'tabernacle');
      if (capped) {
        log('[CARD] tabernacle: ' + block + ' block (capped, face weight ' + weight + ')');
      } else {
        log('[CARD] tabernacle: ' + block + ' block (face weight ' + weight + ')');
      }
    }
  };

  // Jubilee — tier rare, cost 2, tags Growth+Mass. Weight added means the
  // total weight of all 20 faces minus 20 (every face starts at weight 1,
  // per DIE FACE OBJECT STRUCTURE, so the sum starts at exactly 20).
  gameState.config.cards['jubilee'] = {
    id: 'jubilee', name: 'Jubilee', soulCost: 2, type: 'attack', classRestriction: null, tier: 'rare', tags: ['growth', 'mass'],
    effect: function(gameState) {
      const totalWeight = gameState.die.faces.reduce(function(sum, f) { return sum + f.weight; }, 0);
      const weightAdded = totalWeight - 20;
      const raw = 4 + (2 * weightAdded);
      const capped = raw > 24;
      const damage = dealDamage('enemy', capped ? 24 : raw, 'attack', 'jubilee');
      if (capped) {
        log('[CARD] jubilee: ' + damage + ' damage (capped, ' + weightAdded + ' weight added)');
      } else {
        log('[CARD] jubilee: ' + damage + ' damage (' + weightAdded + ' weight added)');
      }
    }
  };

  // ---------- BUILD 132: checkpoint 3, trigger a face outside a roll
  // (prompt D) — Threnody and Reverberation both go through
  // triggerFaceOutsideRoll() (pipeline.js), the one shared function every
  // outside-roll piece uses; Magnificat (a mod) is defined further down
  // among the mods.

  // Threnody — tier uncommon, cost 2, tags Growth. BUILD 142 (item F)
  // reworks this card entirely: instead of always hitting the lowest-
  // numbered loaded face, it now always triggers the SAME face all run —
  // gameState.run.threnodyFace, a whole number from 2 to 19 rolled once at
  // run creation (startNewRun(), run-and-map.js) — through
  // triggerFaceOutsideRoll() (pipeline.js), which already treats a blank
  // OR Sealed face as blank (the 2-block roll), exactly like Reverberation.
  gameState.config.cards['threnody'] = {
    id: 'threnody', name: 'Threnody', soulCost: 2, type: 'utility', classRestriction: null, tier: 'uncommon', tags: ['growth'],
    effect: function(gameState) {
      const faceNumber = gameState.run.threnodyFace;
      const face = gameState.die.faces[faceNumber - 1];
      const loaded = face.modId !== null && !isFaceSealed(faceNumber);
      const triggered = triggerFaceOutsideRoll(faceNumber);
      if (!triggered) {
        log('[CARD] Threnody: face ' + faceNumber + ' could not trigger (already triggered outside a roll this round, or the round trigger cap was reached)');
        return;
      }
      if (loaded) {
        log('[CARD] Threnody: face ' + faceNumber + ' triggers.');
      } else {
        log('[CARD] Threnody: face ' + faceNumber + ' is blank, 2 block.');
      }
    }
  };

  // Reverberation — tier rare, cost 2, tags Mass. Re-triggers the face
  // rolled this round (gameState.turn.rolledFaceNumber, the same field
  // Covenant/Tabernacle already read): a loaded face triggers again through
  // triggerFaceOutsideRoll(), a blank face gives its 2 block again the same
  // way. Faces 1 and 20 are Nat stubs triggerFaceOutsideRoll() always
  // refuses, so a Nat roll is special-cased here instead: 6 block, direct.
  gameState.config.cards['reverberation'] = {
    id: 'reverberation', name: 'Reverberation', soulCost: 2, type: 'utility', classRestriction: null, tier: 'rare', tags: ['mass'],
    effect: function(gameState) {
      const faceNumber = gameState.turn.rolledFaceNumber;
      if (faceNumber === 1 || faceNumber === GAME_CONFIG.DIE_SIZE.PLAYER) {
        const block = dealBlock(6, 'reverberation');
        log('[CARD] reverberation: ' + block + ' block (rolled face ' + faceNumber + ' was a Nat face)');
        return;
      }
      const triggered = triggerFaceOutsideRoll(faceNumber);
      if (triggered) {
        log('[CARD] reverberation: face ' + faceNumber + ' triggered again');
      } else {
        log('[CARD] reverberation: face ' + faceNumber + ' could not trigger again (already triggered outside a roll this round, or the round trigger cap was reached)');
      }
    }
  };

  // ---------- BUILD 134: checkpoint 3, the remaining Bound pieces —
  // Kyrie, Novena, Canticle (cards); Concord, Herald (mods, defined further
  // down among the mods). Kyrie/Canticle read isBoundFace()/call
  // grantBoundToFace(), Novena calls triggerFaceOutsideRoll() once per
  // loaded Bound face — all three functions from the Bound engine
  // (pipeline.js, BUILD 133), no second copy of any of them here.

  // Kyrie — tier common, cost 1, tags Bound. 5 damage, 10 if the rolled
  // face is itself Bound (isBoundFace(), pipeline.js) — checked off
  // gameState.turn.rolledFaceNumber, the same field Reverberation/Covenant/
  // Tabernacle already read.
  gameState.config.cards['kyrie'] = {
    id: 'kyrie', name: 'Kyrie', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: ['bound'],
    effect: function(gameState) {
      const faceNumber = gameState.turn.rolledFaceNumber;
      const face = gameState.die.faces[faceNumber - 1];
      const bound = isBoundFace(face);
      const damage = dealDamage('enemy', bound ? 10 : 5, 'attack', 'kyrie');
      log('[CARD] kyrie: ' + damage + ' damage' + (bound ? ' (rolled face was Bound)' : ''));
    }
  };

  // Novena — tier rare, cost 2, tags Bound. Every loaded Bound face on the
  // die triggers, each through triggerFaceOutsideRoll() (pipeline.js) — the
  // same fast-sweep pacing runBoundScan() uses (playSweep()), since this is
  // structurally the same "many Bound faces fire together" shape, just
  // card-triggered instead of roll-triggered. No loaded Bound face at all
  // is a no-op, logged rather than thrown.
  gameState.config.cards['novena'] = {
    id: 'novena', name: 'Novena', soulCost: 2, type: 'utility', classRestriction: null, tier: 'rare', tags: ['bound'],
    effect: function(gameState) {
      const boundFaces = gameState.die.faces.filter(function(f) {
        return f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && isBoundFace(f);
      });
      if (boundFaces.length === 0) {
        log('[CARD] novena: no loaded Bound face to trigger');
        return;
      }
      log('[CARD] novena: ' + boundFaces.length + ' loaded Bound face' + (boundFaces.length === 1 ? '' : 's') + ' trigger' + (boundFaces.length === 1 ? 's' : ''));
      // BUILD 135: playCard()'s own post-effect() checkWinNow() call fires
      // before this sweep's dispatches do (they're staggered via setTimeout,
      // effect() returns immediately) — checkWinNow() as onComplete here is
      // what actually catches a kill from one of Novena's own triggers.
      playSweep(boundFaces.map(function(f) { return f.number; }), function(faceNumber) {
        triggerFaceOutsideRoll(faceNumber);
      }, checkWinNow);
    }
  };

  // Canticle — tier uncommon, cost 1, tags Bound. 6 block; if the rolled
  // face is loaded (a real mod, not a Nat stub), it gains Bound for this
  // fight via grantBoundToFace() (pipeline.js) — which itself refuses face
  // 1/face 20/a blank face, so this can never grant Bound to a Nat face.
  gameState.config.cards['canticle'] = {
    id: 'canticle', name: 'Canticle', soulCost: 1, type: 'block', classRestriction: null, tier: 'uncommon', tags: ['bound'],
    effect: function(gameState) {
      const block = dealBlock(6, 'canticle');
      const faceNumber = gameState.turn.rolledFaceNumber;
      const face = gameState.die.faces[faceNumber - 1];
      const loaded = face.modId !== null && face.modId !== 'NAT_ONE' && face.modId !== 'NAT_TWENTY' && !isFaceSealed(faceNumber);
      if (loaded) {
        const granted = grantBoundToFace(faceNumber);
        log('[CARD] canticle: ' + block + ' block' + (granted ? ', face ' + faceNumber + ' granted Bound for the fight' : ''));
      } else {
        log('[CARD] canticle: ' + block + ' block, rolled face not loaded, no Bound granted');
      }
    }
  };

  gameState.config.cardPool = {
    rebuke: gameState.config.cards['rebuke'],
    censure: gameState.config.cards['censure'],
    judgement: gameState.config.cards['judgement'],
    vestment: gameState.config.cards['vestment'],
    litany: gameState.config.cards['litany'],
    scripture: gameState.config.cards['scripture'],
    communion: gameState.config.cards['communion'],
    censer: gameState.config.cards['censer'],
    purge: gameState.config.cards['purge'],
    interdict: gameState.config.cards['interdict'],
    reckoning: gameState.config.cards['reckoning'],
    retribution: gameState.config.cards['retribution'],
    covenant: gameState.config.cards['covenant'],
    rapture: gameState.config.cards['rapture'],
    orison: gameState.config.cards['orison'],
    tenet: gameState.config.cards['tenet'],
    gradual: gameState.config.cards['gradual'],
    vacancy: gameState.config.cards['vacancy'],
    lauds: gameState.config.cards['lauds'],
    chastise: gameState.config.cards['chastise'],
    cloister: gameState.config.cards['cloister'],
    psalm: gameState.config.cards['psalm'],
    reliquary: gameState.config.cards['reliquary'],
    vindication: gameState.config.cards['vindication'],
    myrrh: gameState.config.cards['myrrh'],
    exequy: gameState.config.cards['exequy'],
    hosanna: gameState.config.cards['hosanna'],
    gloria: gameState.config.cards['gloria'],
    oblation: gameState.config.cards['oblation'],
    tabernacle: gameState.config.cards['tabernacle'],
    jubilee: gameState.config.cards['jubilee'],
    threnody: gameState.config.cards['threnody'],
    reverberation: gameState.config.cards['reverberation'],
    kyrie: gameState.config.cards['kyrie'],
    novena: gameState.config.cards['novena'],
    canticle: gameState.config.cards['canticle']
  };

  // Ordained class
  gameState.config.classes['ordained'] = {
    id: 'ordained',
    name: 'The Ordained',
    anchorModId: 'consecrate',
    // BUILD 066: Nat 20 — every loaded face on the player die triggers
    // this turn, ascending face number order. gameState.die.faces is
    // already stored in ascending-number order (face.number === index+1,
    // per DIE FACE OBJECT STRUCTURE), so filtering preserves that order
    // with no extra sort needed. Face 1 and face 20 are excluded by the
    // modId check (NAT_ONE/NAT_TWENTY are stub ids, not real mods) — face
    // 20 is the cause of this trigger, not a participant in it. Each
    // qualifying face fires through callListeners('MOD_TRIGGER', ...),
    // the exact same dispatch call a single rolled mod face already
    // makes in resolvePlayerRoll — no second copy of the trigger logic.
    onNatTwenty: function() {
      // BUILD 141 (item C): a Sealed face is excluded from the sweep — it
      // counts as blank this round, for every rule, Nat 20 included.
      const loadedFaces = gameState.die.faces.filter(function(f) {
        return f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !isFaceSealed(f.number);
      });
      log('[ROLL] Nat 20: ' + loadedFaces.length + ' loaded face' + (loadedFaces.length === 1 ? '' : 's') + ' trigger' + (loadedFaces.length === 1 ? 's' : ''));
      // BUILD 115: a two-mod face triggers both mods, in load order,
      // within that face's own turn in the ascending sequence — both
      // dispatches happen inside this same forEach iteration, before the
      // loop moves on to the next face.
      // BUILD 132: tagged natTwentySweep so mod_dispatch's own D-51 round-
      // trigger-cap counter (config.js's GAME_CONFIG.ROUND_TRIGGER_CAP)
      // skips these calls — the Nat 20 sweep is the one exemption the
      // prompt names, since it can trigger far more than ten faces in one
      // pass.
      // BUILD 133 (checkpoint 3, Bound engine) — fast sweep timing
      // (pipeline.js's playSweep()): each qualifying face's own dispatch
      // still fires both its slots together, in the same order, the instant
      // its own turn in the sweep plays — only WHEN it plays is staggered,
      // paced by the round's own trigger tally. Faces are looked up fresh
      // off gameState.die.faces at dispatch time (not the loadedFaces
      // snapshot above), in case an earlier trigger in this same sweep
      // wrote to another face (Ordain/Elevation's weight writes) before a
      // later one plays.
      // BUILD 135: checkWinNow() (phase-machine.js) as onComplete — a kill
      // partway through the sweep still lets every remaining loaded face in
      // it trigger (permanent growth included) before the fight is declared
      // won.
      playSweep(loadedFaces.map(function(f) { return f.number; }), function(faceNumber) {
        // BUILD 138: this is the one sweep path that dispatches directly
        // (callListeners) rather than through triggerFaceOutsideRoll(), so
        // it needs its own hop mark, at the same moment its dispatch fires.
        markFaceHopped(faceNumber);
        const f = gameState.die.faces[faceNumber - 1];
        callListeners('MOD_TRIGGER', { modId: f.modId, faceNumber: f.number, natTwentySweep: true });
        if (f.modId2) {
          callListeners('MOD_TRIGGER', { modId: f.modId2, faceNumber: f.number, natTwentySweep: true });
        }
      }, checkWinNow);
    },
    // BUILD 067: Nat 1 — Penitence. Fight-scoped (gameState.player.penitenceActive,
    // not turn-scoped). The actual 1-soul loss happens once per turn at
    // START_OF_TURN (after the soul reset), not here — this only arms the
    // effect and logs its onset.
    //
    // BUILD 084: Nat 1 now fires once per fight. BUILD 082's played run
    // rolled two Nat 1s in one boss fight and the second was a dead roll —
    // a log line and nothing else. It is no longer dead: after the first
    // one, face 1 resolves as a blank for the rest of the fight.
    //
    // The guard reads natOneFiredThisFight, NOT penitenceActive. That
    // distinction is the whole point now that Penitence expires after
    // PENITENCE_TURNS turns: a face 1 rolled after the expiry must still
    // come out a blank, and checking penitenceActive would instead re-arm
    // Penitence from scratch — precisely the stacking the ruling removes.
    onNatOne: function() {
      if (gameState.player.natOneFiredThisFight) {
        // The real blank passive, dispatched exactly the way
        // resolvePlayerRoll() dispatches a genuinely blank face: same
        // BLANK_ROLL hook, same listeners, same 2 block, same [BLANK] line.
        // No distinguishing tag — in the log this reads as an ordinary
        // blank roll, which is what it is.
        callListeners('BLANK_ROLL', {});
        return;
      }
      updatePlayer({
        natOneFiredThisFight: true,
        penitenceActive: true,
        penitenceTurnsRemaining: PENITENCE_TURNS
      });
      log('[ROLL] Penitence begins: 1 soul lost at the start of every turn for the next ' + PENITENCE_TURNS + ' turns');
    },
    onBlankRoll: function() {
      const block = dealBlock(GAME_CONFIG.BLANK_ROLL_BLOCK, 'blank_face');
      log('[BLANK] ' + block + ' block generated');
    },
    startingDeck: GAME_CONFIG.STARTING_DECK.slice()
  };

  // Register the Ordained blank-face passive as a listener
  registerListener('BLANK_ROLL', 'ordained_blank_passive', gameState.config.classes[gameState.player.classId].onBlankRoll, 'permanent');

  // BUILD 066: register the Ordained Nat 20 passive the same way — a
  // permanent listener registered once at init(), not per-turn, so
  // forcing face 20 repeatedly never accumulates duplicate listeners.
  registerListener('NAT_TWENTY', 'ordained_nat_twenty_passive', gameState.config.classes[gameState.player.classId].onNatTwenty, 'permanent');

  // BUILD 067: register the Ordained Nat 1 (Penitence) passive the same
  // way — a permanent listener registered once at init(), not per-turn,
  // mirroring the BUILD 066 NAT_TWENTY registration exactly.
  registerListener('NAT_ONE', 'ordained_nat_one_passive', gameState.config.classes[gameState.player.classId].onNatOne, 'permanent');

  // ---------- BUILD 141: poison answer (item A, KI-26) ----------
  // At START_OF_TURN, before poison ticks and before block clears, the
  // player's own held block answers their own poison: every
  // GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK (5) block still held removes
  // 1 stack of poison, capped at however many stacks the player actually
  // has. Block is read here, not spent — the existing block-clear step
  // later in START_OF_TURN (phase-machine.js) still zeroes it exactly as
  // before. Registered on the 'START_OF_TURN' hook rather than written
  // inline in phase-machine.js: runPhase()'s own callListeners(phase) call
  // fires unconditionally at the very top of the function, before any of
  // that phase's own if-branch logic runs (see EVENT HOOKS, CLAUDE.md) — so
  // this listener is guaranteed to run before the inline poison tick/block
  // clear code further down that same phase body, with no dependency on
  // listener registration order (there is only one listener on this hook).
  // Enemies are unaffected — they have no block field, so this never
  // touches gameState.enemy.
  registerListener('START_OF_TURN', 'poison_answer_passive', function() {
    const block = gameState.player.block;
    const poison = gameState.player.poisonStacks;
    const perStack = GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK;
    const removable = Math.floor(block / perStack);
    const stacksRemoved = Math.min(removable, poison);
    if (stacksRemoved > 0) {
      updatePlayer({ poisonStacks: poison - stacksRemoved });
      log('[POISON] ' + block + ' block held removes ' + stacksRemoved + (stacksRemoved === 1 ? ' stack of poison.' : ' stacks of poison.'));
    }
  }, 'permanent');

  // ---------- BUILD 097/098: the boss die's enemy half ----------
  // First real enemy mechanic — the boss is the only enemy that carried a
  // die at all until BUILD 098 gave the elite its own too (buildAct(),
  // run-and-map.js: 2 loaded poison faces, no Nat faces — Nat 20/Nat 1
  // stay boss-only). POISON faces have carried 'enemy_buff_poison' since
  // BUILD 075 but were never dispatched to anything until BUILD 097;
  // ENEMY_NAT_TWENTY was a stub and there was no enemy Nat 1 at all before
  // that build. Registered unconditionally here, not tied to
  // gameState.player.classId like the three Ordained passives just above —
  // these are the enemy's own die mechanics, not a player class passive,
  // so they exist regardless of which class is playing or which enemy
  // (elite or boss) is currently being fought. Same 'permanent'
  // registration shape as the player's own three passives, so forcing an
  // enemy face repeatedly never accumulates duplicate listeners.

  // A loaded enemy buff face triggering — currently the only real buff is
  // 'enemy_buff_poison' (boss die faces 5/10/15; elite die faces 7/14 as
  // of BUILD 098), which applies 5 poison stacks
  // to the player through the exact same gameState.player.poisonStacks
  // field every player-facing poison source (Blight/Virulence/Censer/the
  // dev poison applier) already writes to — no second poison system, per
  // the prompt's explicit instruction. The existing START_OF_TURN tick
  // (phase-machine.js) already decays whatever lands here identically to
  // any other player poison, with no changes needed there.
  // BUILD 125 (F31): the amount is no longer read live off
  // GAME_CONFIG.ENEMY_BUFF_POISON_STACKS — it's gameState.enemy.
  // buffPoisonStacks, fixed at enemy-slot creation (buildAct(),
  // run-and-map.js) by scaling that flat constant with the current act's
  // own ACT_INTENT_MULTIPLIER (Math.ceil'd), so a poison face applies more
  // the deeper the run goes without this listener needing to know about
  // acts at all.
  registerListener('ENEMY_BUFF_TRIGGER', 'enemy_buff_dispatch', function(data) {
    if (data.buffId === 'enemy_buff_poison') {
      const amount = gameState.enemy.buffPoisonStacks;
      const newStacks = gameState.player.poisonStacks + amount;
      updatePlayer({ poisonStacks: newStacks });
      log('[ENEMY] applied ' + amount + ' stacks of poison to player, now ' + newStacks + ' stacks of poison');
    } else if (data.buffId === 'enemy_buff_wrath') {
      // BUILD 141 (item C) — Wrath. Queues into wrathPending; moves into
      // the active wrath (added to every later Attack) at the next
      // START_OF_TURN (advanceEnemyIntentForRound(), pipeline.js), so this
      // round's already-shown Attack value never changes.
      // BUILD 142 (item C): reads this enemy's OWN per-trigger amount
      // (gameState.enemy.wrathPerTrigger, set at fight start from
      // GAME_CONFIG.ENEMIES[...].wrathPerTrigger, beginFightFromSlot()) —
      // was the flat GAME_CONFIG.ENEMY_WRATH_AMOUNT, which is now only the
      // default for an enemy with no amount of its own.
      const amount = gameState.enemy.wrathPerTrigger;
      const newPending = gameState.enemy.wrathPending + amount;
      updateEnemy({ wrathPending: newPending });
      log('[ENEMY] Wrath triggers: Attacks +' + amount + ' from next round.');
    } else if (data.buffId === 'enemy_buff_drain') {
      // BUILD 141 (item C) — Drain. Queues 1 onto drainNextRound; consumed
      // at the next START_OF_TURN's soul reset (phase-machine.js).
      const newDrain = gameState.player.drainNextRound + 1;
      updatePlayer({ drainNextRound: newDrain });
      log('[ENEMY] Drain triggers: 1 less soul next round.');
    } else if (data.buffId === 'enemy_buff_seal') {
      // BUILD 141 (item C) — Seal. Picks the player's heaviest loaded face
      // (excluding 1/20 and any face already Sealed this round —
      // pickHeaviestLoadedFaceForSeal(), pipeline.js) and queues it; the
      // queue moves into gameState.turn.sealedFaces at the next
      // START_OF_TURN (phase-machine.js), where it actually starts
      // counting as blank.
      const target = pickHeaviestLoadedFaceForSeal();
      if (target) {
        updatePlayer({ sealNextRound: gameState.player.sealNextRound.concat(target.number) });
        log('[ENEMY] Seal triggers: face ' + target.number + ' counts as blank next round.');
      } else {
        log('[ENEMY] Seal triggers: no loaded face to seal');
      }
    }
  }, 'permanent');

  // Enemy Nat 20 — every loaded buff face on the enemy die fires, ascending
  // by face number. Deliberate mirror of the Ordained's own onNatTwenty
  // above: the two Nat 20s are one mechanic seen from both sides. Not
  // capped, not once per fight — matches the player exactly. Same loop-
  // safety approach as the player's version: because gameState.enemy.
  // die.faces is already stored in ascending-number order (face.number ===
  // index+1), filtering preserves ascending order with no extra sort, and
  // each qualifying face fires through the exact same ENEMY_BUFF_TRIGGER
  // dispatch a single rolled buff face already uses above — no second copy
  // of the trigger logic. On the current boss die (three poison faces) this
  // fires enemy_buff_dispatch three times, applying 15 total poison.
  registerListener('ENEMY_NAT_TWENTY', 'boss_nat_twenty_passive', function() {
    // BUILD 142 (item C) — Cardinal and Pontifex each replace the generic
    // sweep-every-buff-face behaviour entirely with their own designed Nat
    // 20 (both named by gameState.enemy.name, set by beginFightFromSlot()).
    if (gameState.enemy.name === 'Cardinal') {
      const targets = pickTopLoadedFacesForSeal(2);
      if (targets.length === 0) {
        log('[ENEMY] Cardinal\'s Nat 20: no loaded face to seal');
      } else {
        updatePlayer({ sealNextRound: gameState.player.sealNextRound.concat(targets.map(function(f) { return f.number; })) });
        log('[ENEMY] Cardinal\'s Nat 20 seals face' + (targets.length === 1 ? '' : 's') + ' ' + targets.map(function(f) { return f.number; }).join(' and ') + '.');
      }
      return;
    }
    if (gameState.enemy.name === 'Pontifex') {
      updateEnemy({ pontifexDoubleAttackThisRound: true });
      log('[ENEMY] Pontifex\'s Nat 20: the Attack resolves twice.');
      return;
    }
    const loadedFaces = gameState.enemy.die.faces.filter(function(f) {
      return f.modId !== null && f.modId !== 'ENEMY_NAT_ONE' && f.modId !== 'ENEMY_NAT_TWENTY';
    });
    log('[ENEMY] Nat 20: ' + loadedFaces.length + ' loaded face' + (loadedFaces.length === 1 ? '' : 's') + ' trigger' + (loadedFaces.length === 1 ? 's' : ''));
    loadedFaces.forEach(function(f) {
      callListeners('ENEMY_BUFF_TRIGGER', { buffId: f.modId, faceNumber: f.number });
    });
  }, 'permanent');

  // Enemy Nat 1 — the die turns on its wielder. Two effects, both at once:
  // this turn's attack is cancelled entirely (enemyAttackCancelledThisTurn,
  // read once by ENEMY_ACT_PHASE later the same turn — phase-machine.js),
  // and the enemy applies its own poison to itself, routed through the
  // exact same gameState.enemy.poisonStacks field player cards already
  // poison the enemy through — no second poison system. BUILD 098
  // correction: this was originally 5 stacks per loaded poison face (15 on
  // the boss, ~65 total decay damage — roughly two thirds of the boss's
  // own HP from a single 5% roll); now a flat 5 regardless of how many
  // poison faces the die carries, per the prompt's explicit instruction.
  // The player-facing amount (5 per loaded face, enemy_buff_dispatch
  // above) is unchanged and was already correct — only the enemy's own
  // self-poison was ever the problem. Once per fight, mirroring the
  // player's own Nat 1
  // (BUILD 084) exactly: after it fires, face 1 resolves as a plain blank
  // (the same log line resolveEnemyRoll()'s own blank branch already uses,
  // no distinguishing tag) for the rest of the fight, gated on
  // gameState.enemy.natOneFiredThisFight rather than re-deriving anything
  // from a "cancelled" flag, for the identical reason BUILD 084 gates the
  // player's own version on natOneFiredThisFight and not penitenceActive.
  registerListener('ENEMY_NAT_ONE', 'boss_nat_one_passive', function() {
    if (gameState.enemy.natOneFiredThisFight) {
      log('[ENEMY ROLL] blank');
      return;
    }
    // BUILD 142 (item C) — Cardinal and Pontifex each replace the generic
    // cancel-attack-and-self-poison behaviour entirely with their own
    // designed Nat 1; neither cancels the attack, neither self-poisons.
    if (gameState.enemy.name === 'Cardinal') {
      updateEnemy({ natOneFiredThisFight: true });
      const target = pickHeaviestLoadedFaceForSeal();
      if (target) {
        triggerFaceOutsideRoll(target.number);
        log('[ENEMY] Cardinal\'s Nat 1: face ' + target.number + ' triggers.');
      } else {
        log('[ENEMY] Cardinal\'s Nat 1: no loaded face to trigger');
      }
      return;
    }
    if (gameState.enemy.name === 'Pontifex') {
      updateEnemy({ natOneFiredThisFight: true, wrath: 0, wrathPending: 0 });
      log('[ENEMY] Pontifex\'s Nat 1: Wrath lost.');
      return;
    }
    updateEnemy({ natOneFiredThisFight: true });
    updateTurn({ enemyAttackCancelledThisTurn: true });
    // BUILD 098: correction to BUILD 097 — this was 5 stacks PER loaded
    // poison face (15 on the boss, ~65 total decay damage, roughly two
    // thirds of the boss's own HP from a 5% roll). Flat 5 stacks
    // regardless of how many poison faces the die carries, per the
    // prompt's explicit instruction — the player-facing amount (5 per
    // loaded face, applied by enemy_buff_dispatch above) is unchanged and
    // was already correct; only the enemy's OWN self-poison was ever the
    // problem. The cancelled attack above is untouched.
    const newStacks = gameState.enemy.poisonStacks + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON;
    updateEnemy({ poisonStacks: newStacks });
    log('[ENEMY] Nat 1: attack cancelled, ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison applied to itself, now ' + newStacks + ' stacks of poison');
  }, 'permanent');

  // Mods — empty
  gameState.config.mods = {};

  // Generic mod dispatcher — resolves config.mods[modId] and runs its effect on MOD_TRIGGER.
  // data (which includes faceNumber) is now forwarded into effect() — every
  // existing mod's effect is declared as function() with no parameters, so
  // this extra argument is silently ignored there, zero behaviour change.
  // Ordain is the first mod that needs it, to know which specific face to
  // add weight to (it can't just scan config.mods for its own id, since the
  // same mod can be loaded on more than one face at once).
  // BUILD 066: sets modTriggeredThisTurn on every real mod trigger, whether
  // reached via a normal single-face roll or looped by Nat 20's
  // onNatTwenty passive — this is the one place both paths funnel through,
  // so it's also the one place Rapture's "did a mod trigger this turn"
  // condition can be read from without re-deriving it from rollOutcome
  // (which reads 'nat_twenty', not 'mod', on a Nat 20 turn).
  registerListener('MOD_TRIGGER', 'mod_dispatch', function(data) {
    const mod = gameState.config.mods[data.modId];
    if (mod) {
      updateTurn({ modTriggeredThisTurn: true });
      // BUILD 095: mod-trigger sound (Chain B's climbing identity) — this
      // is the one dispatch point both a natural single-face roll and
      // Nat 20's onNatTwenty() loop already funnel every mod trigger
      // through, so it's the correct place to announce it exactly once
      // per mod, whatever that mod's own effect() then does.
      playAudioEvent('mod_trigger');
      // BUILD 132 (D-51): bump the round-scoped trigger cap counter — every
      // real MOD_TRIGGER dispatch counts, whether reached via a normal
      // roll, triggerFaceOutsideRoll() (pipeline.js), or here; the one
      // exemption is Nat 20's own sweep (onNatTwenty above), which tags its
      // calls natTwentySweep so this funnel can skip counting them.
      if (!data.natTwentySweep) {
        updateTurn({ roundTriggerCount: gameState.turn.roundTriggerCount + 1 });
      }
      // BUILD 108: bump this specific mod's own trigger count — same funnel
      // reasoning as modTriggeredThisTurn/the mod_trigger sound above, so a
      // Nat 20 counts each qualifying face once per pass, same as a normal
      // roll. Folded into the triggering face's own modData (BUILD 103's
      // separate gameState.die.triggerCounts array is gone — see STATE
      // SCHEMA / MULTI-MOD FACES, CLAUDE.md); data.modId tells us which of
      // this face's (up to two) mod slots just fired, so a face holding two
      // different mods increments only the one that actually triggered, not
      // its neighbour. Merges into any existing modData (e.g. Zeal's own
      // accumulatedBonus) rather than replacing it — the same merge Zeal's
      // own effect below must also use, for the same reason. Read by
      // renderDieList()'s trigger-count badge.
      const faceIndex = data.faceNumber - 1;
      const face = gameState.die.faces[faceIndex];
      const existingModData = face.modData || {};
      const newModData = Object.assign({}, existingModData);
      if (face.modId === data.modId) {
        newModData.triggerCount = (existingModData.triggerCount || 0) + 1;
      } else if (face.modId2 === data.modId) {
        newModData.triggerCount2 = (existingModData.triggerCount2 || 0) + 1;
      }
      const newFaces = gameState.die.faces.slice();
      newFaces[faceIndex] = Object.assign({}, face, { modData: newModData });
      updateDie({ faces: newFaces });
      mod.effect(data);
    }
  }, 'permanent');

  // Consecrate — Ordained anchor mod
  gameState.config.mods['consecrate'] = {
    id: 'consecrate',
    name: 'Consecrate',
    tags: ['soul'],
    effect: function() {
      updatePlayer({ soul: gameState.player.soul + 2 });
      log('[MOD] consecrate: +2 soul this turn');
      registerListener('ON_CARD_PLAY', 'consecrate_block_per_card', function(data) {
        const block = dealBlock(3, 'consecrate');
        log('[MOD] consecrate: 3 block for ' + data.card.name);
      }, 'turn');
    }
  };

  // Smite — pool mod. No conditions, no scaling, no persistence.
  gameState.config.mods['smite'] = {
    id: 'smite',
    name: 'Smite',
    tier: 'common',
    tags: [],
    effect: function() {
      const damage = dealDamage('enemy', 16, 'attack', 'smite');
      log('[MOD] smite: ' + damage + ' damage');
    }
  };

  // Penance — pool mod. No conditions, no scaling, no persistence.
  gameState.config.mods['penance'] = {
    id: 'penance',
    name: 'Penance',
    tier: 'common',
    tags: ['bastion'],
    effect: function() {
      const damage = dealDamage('enemy', 8, 'attack', 'penance');
      const block = dealBlock(8, 'penance');

      log('[MOD] penance: ' + damage + ' damage, ' + block + ' block');

      // Same card-play feedback Rite (attack + block in one card) already gets.
      flashElement('enemyPanel', 'fx-shake');
      flashElement('enemyHpValue', 'fx-pop-red');
      flashElement('playerPanel', 'fx-pulse-blue');
      flashElement('playerBlockValue', 'fx-pop-blue');
    }
  };

  // Offering — pool mod. Enabler: soul + a card, both usable this turn since
  // MOD_TRIGGER fires in ROLL_PHASE, always before CARD_PHASE. The soul
  // grant doesn't need turn-scoped listener cleanup — like Consecrate's own
  // soul grant, it never persists because START_OF_TURN unconditionally
  // resets soul to maxSoul every turn. The drawn card needs no special
  // handling either — it sits in hand normally and is discarded at
  // END_PLAYER_TURN like any other card.
  gameState.config.mods['offering'] = {
    id: 'offering',
    name: 'Offering',
    tier: 'common',
    tags: ['soul'],
    effect: function() {
      updatePlayer({ soul: gameState.player.soul + 2 });
      log('[MOD] offering: +2 soul this turn, draw 1');
      drawCards(1);
    }
  };

  // Blight — pool mod. Applies poison to the enemy via the existing
  // gameState.enemy.poisonStacks field, the same one the dev poison
  // applier writes to and START_OF_TURN's tick reads from. No new phase
  // logic, no changes to the decay tick.
  gameState.config.mods['blight'] = {
    id: 'blight',
    name: 'Blight',
    tier: 'common',
    tags: ['poison'],
    effect: function() {
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + 6 });
      log('[MOD] blight: applied 6 stacks of poison');
    }
  };

  // Virulence — pool mod. Applies 3 poison, then doubles whatever poison
  // is currently on the enemy (including the 3 just applied). Same
  // poisonStacks field as Blight and the dev poison applier; no new
  // phase logic, no changes to the decay tick.
  gameState.config.mods['virulence'] = {
    id: 'virulence',
    name: 'Virulence',
    tier: 'rare',
    tags: ['poison'],
    effect: function() {
      const afterApply = gameState.enemy.poisonStacks + 3;
      const doubled = afterApply * 2;
      updateEnemy({ poisonStacks: doubled });
      log('[MOD] virulence: applied 3 stacks of poison, doubled to ' + doubled + ' stacks of poison');
    }
  };

  // Sanctuary — pool mod. No conditions, no scaling, no persistence. Block
  // goes through generateBlock() (Law 1's block equivalent) and updatePlayer,
  // the same path the blank passive, Ward, Rite, and Penance already use.
  gameState.config.mods['sanctuary'] = {
    id: 'sanctuary',
    name: 'Sanctuary',
    tier: 'common',
    tags: ['bastion'],
    effect: function() {
      const block = dealBlock(16, 'sanctuary');
      log('[MOD] sanctuary: ' + block + ' block');

      // Same block-only feedback Ward's card play already gets.
      flashElement('playerPanel', 'fx-pulse-blue');
      flashElement('playerBlockValue', 'fx-pop-blue');
    }
  };

  // Vigil — pool mod. Rewards holding cards back rather than dumping the
  // whole hand, so it must read hand size at END_PLAYER_TURN (after the
  // player has played cards), not at roll time when hand size is always the
  // fixed post-draw 5. Uses the same turn-scoped registerListener pattern
  // Consecrate's block-per-card listener already uses, so it cannot persist
  // past this turn or double-fire — clearListeners('turn') at the next
  // START_OF_TURN removes it exactly like any other turn-scoped effect.
  gameState.config.mods['vigil'] = {
    id: 'vigil',
    name: 'Vigil',
    tier: 'uncommon',
    tags: ['bastion'],
    effect: function() {
      log('[MOD] vigil: registered, block scales with cards held at end of turn');
      registerListener('END_PLAYER_TURN', 'vigil_block_per_card_held', function() {
        const cardsHeld = gameState.player.hand.length;
        const block = dealBlock(5 * cardsHeld, 'vigil');
        log('[MOD] vigil: ' + cardsHeld + ' cards held, granted 5x' + cardsHeld + ' block');
      }, 'turn');
    }
  };

  // Zeal — pool mod. Deals 10 damage on trigger, then permanently increases
  // its own damage by 4 for the rest of the run on every subsequent trigger.
  // BUILD 062: the counter used to live as a plain field directly on this
  // mod's own config.mods object (accumulatedBonus), incremented in place
  // inside effect() — a deliberate Law 3 exception, since registerListener()
  // has no dedup and calling it from inside effect() on every trigger would
  // have accumulated a duplicate registration per trigger, forever. That
  // still left config mutating at runtime, contradicting STATE HELPERS
  // ("config is set once at init and never changed"). The counter now lives
  // on the triggering face's own modData field instead — the same kind of
  // per-instance persistent value Ordain's weight already is, and reached
  // via the same clone-then-write pattern through updateDie() Ordain already
  // uses, so it's a Law 3-compliant state change. A face without modData
  // (never triggered Zeal before) is treated as bonus 0. Because the value
  // lives per-face rather than per-mod, Zeal loaded onto two different faces
  // accrues independently on each — consistent with the counter being a
  // property of "this specific face that keeps triggering", not a global
  // run counter. resetFight() never touches gameState.die, so this persists
  // across Restart Fight exactly as the old config field did.
  gameState.config.mods['zeal'] = {
    id: 'zeal',
    name: 'Zeal',
    tier: 'uncommon',
    tags: ['mass', 'growth'],
    effect: function(data) {
      const faceNumber = data.faceNumber;
      const face = gameState.die.faces[faceNumber - 1];
      // BUILD 108: mod_dispatch (above) now always creates modData (to hold
      // this trigger's own triggerCount) before calling this effect(), even
      // on a face's very first trigger — so modData being truthy no longer
      // implies accumulatedBonus is set. Read the field itself, not just
      // its container.
      const bonus = (face.modData && face.modData.accumulatedBonus) || 0;
      const damage = dealDamage('enemy', 10 + bonus, 'attack', 'zeal');

      const newBonus = bonus + 4;
      const newFaces = gameState.die.faces.slice();
      // BUILD 108: merge into the face's existing modData rather than
      // replacing it wholesale — mod_dispatch (above) already wrote this
      // trigger's own triggerCount/triggerCount2 into modData before
      // calling this effect(), and a bare { modData: { accumulatedBonus } }
      // literal here would silently drop that count on every single Zeal
      // trigger.
      newFaces[faceNumber - 1] = Object.assign({}, face, { modData: Object.assign({}, face.modData, { accumulatedBonus: newBonus }) });
      updateDie({ faces: newFaces });

      log('[MOD] zeal: ' + damage + ' damage (bonus +' + bonus + ', face ' + faceNumber + ' now +' + newBonus + ')');
    }
  };

  // Fervour — pool mod. First mod to use the DAMAGE_MULTIPLIER stage of the
  // pipeline (calculateDamage()'s multiplier step was already fully
  // implemented per Law 1 but never exercised by any mod until now). Pure
  // setup — no direct damage on trigger — it registers a turn-scoped
  // DAMAGE_MULTIPLIER listener that doubles calculateDamage() calls tagged
  // 'attack' only, leaving 'poison'-tagged calls (and anything else) at
  // x1, so poison ticks are never silently doubled by a buff meant for
  // outgoing attacks. clearOn: 'turn' means clearListeners('turn') at the
  // next START_OF_TURN removes it automatically, exactly like Consecrate's
  // and Vigil's own turn-scoped listeners already do — no special
  // expiry logic needed. Logs its own "hit doubled" line each time the
  // multiplier actually fires on an attack, so the doubling is visible in
  // the log stream itself, not just inferable from a bigger damage number.
  gameState.config.mods['fervour'] = {
    id: 'fervour',
    name: 'Fervour',
    tier: 'rare',
    tags: ['mass'],
    effect: function() {
      log('[MOD] fervour: attacks double damage this turn');
      registerListener('DAMAGE_MULTIPLIER', 'fervour_double_attacks', function(sourceType) {
        if (sourceType === 'attack') {
          log('[MOD] fervour: hit doubled');
          return 2;
        }
        return 1;
      }, 'turn');
    }
  };

  // Ordain — pool mod. Deals 10 damage, then permanently adds 1 weight to
  // the specific face it triggered from. rollDie() already reads
  // gameState.die.faces fresh on every call, so a mid-fight weight change
  // is picked up correctly on the very next roll with no new logic needed
  // there. BUILD 107: the weight write itself now goes through the shared
  // strengthenFace() helper (pipeline.js) — the same one the post-fight
  // Strengthen die action calls — instead of duplicating its
  // clone-then-write pattern here. Reading face.weight fresh each time
  // (not a separately tracked counter) means this naturally stacks with
  // Strengthen or with repeated Ordain triggers on the same face — each
  // trigger just adds 1 to whatever the weight already is.
  gameState.config.mods['ordain'] = {
    id: 'ordain',
    name: 'Ordain',
    tier: 'uncommon',
    tags: ['mass', 'growth'],
    effect: function(data) {
      const damage = dealDamage('enemy', 10, 'attack', 'ordain');

      const faceNumber = data.faceNumber;
      const newWeight = strengthenFace(faceNumber);

      log('[MOD] ordain: ' + damage + ' damage, face ' + faceNumber + ' weight now ' + newWeight);
    }
  };

  // Anthem — pool mod (BUILD 113). 6 damage, plus 4 per point of weight on
  // its own face (weight 1 -> 10, weight 2 -> 14, weight 3 -> 18). Reuses
  // two existing paths rather than writing anything new: dealDamage()
  // tagged 'attack' (the exact call Smite already makes), so Fervour's
  // turn-scoped DAMAGE_MULTIPLIER doubles it exactly as it doubles Smite;
  // and gameState.turn.rolledFaceWeight (Covenant's own read, set by
  // resolvePlayerRoll() at roll time — never re-derived from
  // gameState.die.faces). Anthem only reads weight; it writes nothing, so
  // it needs no registerListener() call of its own — like Smite/Penance,
  // it fires through the existing MOD_TRIGGER mod_dispatch listener above,
  // which already announces 'mod_trigger' and bumps the trigger-count
  // badge for every mod, Anthem included, with no new code.
  gameState.config.mods['anthem'] = {
    id: 'anthem',
    name: 'Anthem',
    tier: 'common',
    tags: ['mass'],
    effect: function() {
      const weight = gameState.turn.rolledFaceWeight;
      const damage = dealDamage('enemy', 6 + (4 * weight), 'attack', 'anthem');
      log('[MOD] anthem: ' + damage + ' damage');
    }
  };

  // Elevation — pool mod (thirteenth mod). 10 damage; the face directly
  // above this one (faceNumber + 1) permanently gains +1 weight, but only
  // if that face is loaded (modId !== null) and is not face 20 — face 20's
  // modId is always the NAT_TWENTY stub, never a real mod, and Strengthen
  // handles face 20's weight separately (see DIE FACE OBJECT STRUCTURE), so
  // this mod must not touch it. If the face above is blank, unloaded, or is
  // face 20, only the 10 damage happens: no weight write, no error. Like
  // Ordain, the weight write goes through the shared strengthenFace()
  // helper (pipeline.js) — the only place any face's weight is ever written.
  gameState.config.mods['elevation'] = {
    id: 'elevation',
    name: 'Elevation',
    tier: 'uncommon',
    tags: ['mass', 'growth'],
    effect: function(data) {
      const damage = dealDamage('enemy', 10, 'attack', 'elevation');

      const aboveNumber = data.faceNumber + 1;
      const aboveFace = gameState.die.faces[aboveNumber - 1];
      if (aboveFace && aboveFace.modId !== null && aboveNumber !== 20) {
        const newWeight = strengthenFace(aboveNumber);
        log('[MOD] elevation: ' + damage + ' damage, face ' + aboveNumber + ' weight now ' + newWeight);
      } else {
        log('[MOD] elevation: ' + damage + ' damage');
      }
    }
  };

  // Largesse — pool mod (checkpoint 3 tags/mods build, common). Direct
  // effect, no conditions, no scaling, no persistence — same shape as
  // Consecrate's own soul grant plus Ward's own block, both existing paths.
  gameState.config.mods['largesse'] = {
    id: 'largesse',
    name: 'Largesse',
    tier: 'common',
    tags: ['soul'],
    effect: function() {
      updatePlayer({ soul: gameState.player.soul + 2 });
      const block = dealBlock(4, 'largesse');
      log('[MOD] largesse: +2 soul, ' + block + ' block');
    }
  };

  // Tithe — pool mod (uncommon). End-of-round effect: 5 damage per soul the
  // player has left, capped at 20 — registered on the exact same
  // END_PLAYER_TURN hook Vigil's own end-of-round effect already uses (same
  // turn-scoped registerListener() pattern, same clearListeners('turn')
  // expiry at the next START_OF_TURN, same per-trigger re-registration that
  // the registry's own dedup guard collapses to one live listener, same as
  // a second Vigil would). Damage routes through dealDamage() (which itself
  // calls calculateDamage()), tagged 'attack' like every other damage mod in
  // the pool, so Fervour's DAMAGE_MULTIPLIER doubles it exactly as it
  // doubles Smite. Same capped/uncapped two-branch log style Retribution's
  // own block cap already uses.
  gameState.config.mods['tithe'] = {
    id: 'tithe',
    name: 'Tithe',
    tier: 'uncommon',
    tags: ['soul'],
    effect: function() {
      log('[MOD] tithe: registered, deals damage per soul remaining at end of round (capped 20)');
      registerListener('END_PLAYER_TURN', 'tithe_damage_per_soul', function() {
        const soul = gameState.player.soul;
        const raw = 5 * soul;
        const capped = raw > 20;
        const rawDamage = capped ? 20 : raw;
        const damage = dealDamage('enemy', rawDamage, 'attack', 'tithe');
        if (capped) {
          log('[MOD] tithe: ' + damage + ' damage (capped, ' + soul + ' soul)');
        } else {
          log('[MOD] tithe: ' + damage + ' damage (' + soul + ' soul)');
        }
      }, 'turn');
    }
  };

  // Congregation — pool mod (uncommon). 8 damage, 16 if another loaded mod
  // (anywhere on the die, either slot) carries the Growth tag — never
  // counts itself. Since eligibleLoadModIds() (rendering.js) already refuses
  // to offer a mod already loaded anywhere on the die, at most one
  // Congregation can ever be loaded at once, so excluding modId/modId2 ===
  // 'congregation' from the scan is sufficient to satisfy "never counts
  // itself" — no faceNumber/slot bookkeeping needed to identify "this exact
  // triggering instance".
  gameState.config.mods['congregation'] = {
    id: 'congregation',
    name: 'Congregation',
    tier: 'uncommon',
    tags: ['growth'],
    effect: function() {
      function hasGrowthTag(modId) {
        const mod = gameState.config.mods[modId];
        return !!mod && !!mod.tags && mod.tags.indexOf('growth') !== -1;
      }
      const otherHasGrowth = gameState.die.faces.some(function(f) {
        return (f.modId !== null && f.modId !== 'congregation' && hasGrowthTag(f.modId)) ||
          (f.modId2 && f.modId2 !== 'congregation' && hasGrowthTag(f.modId2));
      });
      const damage = dealDamage('enemy', otherHasGrowth ? 16 : 8, 'attack', 'congregation');
      log('[MOD] congregation: ' + damage + ' damage' + (otherHasGrowth ? ' (another Growth mod loaded)' : ''));
    }
  };

  // Cope — pool mod (common). 8 block, permanently +2 per trigger — same
  // per-face modData growth pattern Zeal already uses (merge into the
  // face's existing modData rather than replace it wholesale, since
  // mod_dispatch already wrote this trigger's own triggerCount into modData
  // before effect() runs), just its own field name (copeBonus) and block
  // instead of damage.
  gameState.config.mods['cope'] = {
    id: 'cope',
    name: 'Cope',
    tier: 'common',
    tags: ['growth', 'bastion'],
    effect: function(data) {
      const faceNumber = data.faceNumber;
      const face = gameState.die.faces[faceNumber - 1];
      const bonus = (face.modData && face.modData.copeBonus) || 0;
      const block = dealBlock(8 + bonus, 'cope');

      const newBonus = bonus + 2;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNumber - 1] = Object.assign({}, face, { modData: Object.assign({}, face.modData, { copeBonus: newBonus }) });
      updateDie({ faces: newFaces });

      log('[MOD] cope: ' + block + ' block (bonus +' + bonus + ', face ' + faceNumber + ' now +' + newBonus + ')');
    }
  };

  // Anathema — pool mod (uncommon). End-of-round effect: damage equal to
  // the player's current block, capped at 16 — same END_PLAYER_TURN hook
  // Vigil/Tithe already register on, own listener id so all three coexist
  // independently. Block is read only, never spent/cleared here — block
  // still clears at the next START_OF_TURN exactly as it always has, and
  // this fires before that (END_PLAYER_TURN precedes ENEMY_ACT_PHASE in
  // PHASE_ORDER, so the enemy's own attack this round hasn't landed yet
  // either, and block hasn't been touched since CARD_PHASE ended).
  gameState.config.mods['anathema'] = {
    id: 'anathema',
    name: 'Anathema',
    tier: 'uncommon',
    tags: ['bastion'],
    effect: function() {
      log('[MOD] anathema: registered, deals damage equal to block at end of round (capped 16)');
      registerListener('END_PLAYER_TURN', 'anathema_damage_from_block', function() {
        const block = gameState.player.block;
        const capped = block > 16;
        const rawDamage = capped ? 16 : block;
        const damage = dealDamage('enemy', rawDamage, 'attack', 'anathema');
        if (capped) {
          log('[MOD] anathema: ' + damage + ' damage (capped, block ' + block + ')');
        } else {
          log('[MOD] anathema: ' + damage + ' damage (block ' + block + ')');
        }
      }, 'turn');
    }
  };

  // Thurible — pool mod (common). 8 damage, applies 3 stacks of poison —
  // same poisonStacks field Blight/Virulence/Censer/the dev poison applier
  // already write to. Log line reads "stacks of poison" from the start
  // (KI-25's wording), never a bare "N poison" amount.
  gameState.config.mods['thurible'] = {
    id: 'thurible',
    name: 'Thurible',
    tier: 'common',
    tags: ['poison'],
    effect: function() {
      const damage = dealDamage('enemy', 8, 'attack', 'thurible');
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + 3 });
      log('[MOD] thurible: ' + damage + ' damage, applied 3 stacks of poison');
    }
  };

  // Magnificat — pool mod (rare). The heaviest OTHER loaded face triggers,
  // through triggerFaceOutsideRoll() (pipeline.js) — ties go to the
  // lowest-numbered face; its own face (data.faceNumber, the face
  // Magnificat itself is loaded on) never counts, whichever slot it's in.
  // No other loaded face at all is a no-op, logged rather than thrown.
  gameState.config.mods['magnificat'] = {
    id: 'magnificat',
    name: 'Magnificat',
    tier: 'rare',
    tags: ['mass'],
    effect: function(data) {
      const ownFaceNumber = data.faceNumber;
      const candidates = gameState.die.faces.filter(function(f) {
        return f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && f.number !== ownFaceNumber && !isFaceSealed(f.number);
      });
      if (candidates.length === 0) {
        log('[MOD] magnificat: no other loaded face to trigger');
        return;
      }
      const heaviest = candidates.reduce(function(best, f) {
        if (f.weight > best.weight) return f;
        if (f.weight === best.weight && f.number < best.number) return f;
        return best;
      });
      const triggered = triggerFaceOutsideRoll(heaviest.number);
      if (triggered) {
        log('[MOD] magnificat: face ' + heaviest.number + ' triggered (weight ' + heaviest.weight + ')');
      } else {
        log('[MOD] magnificat: face ' + heaviest.number + ' could not trigger (already triggered outside a roll this round, or the round trigger cap was reached)');
      }
    }
  };

  // ---------- Checkpoint 3, Bound engine — three plain Bound mods ----------
  // All three carry the 'bound' tag, printed Bound: a face loaded with any
  // of them is Bound permanently (isBoundFace(), pipeline.js), so rolling
  // any one of them (or a face granted Bound via grantBoundToFace()) fires
  // the die-wide Bound scan — every other loaded Bound face triggers too,
  // through triggerFaceOutsideRoll(), the same round this face rolled.

  // Unison — pool mod (common). 6 damage, flat, no conditions — the plainest
  // possible Bound mod, so two Unisons (or a Unison and any other Bound
  // face) firing together is easy to read off gameState with no other
  // mechanic in the way.
  gameState.config.mods['unison'] = {
    id: 'unison',
    name: 'Unison',
    tier: 'common',
    tags: ['bound'],
    effect: function() {
      const damage = dealDamage('enemy', 6, 'attack', 'unison');
      log('[MOD] unison: ' + damage + ' damage');
    }
  };

  // Accord — pool mod (common). 10 block, flat, no conditions.
  gameState.config.mods['accord'] = {
    id: 'accord',
    name: 'Accord',
    tier: 'common',
    tags: ['bound'],
    effect: function() {
      const block = dealBlock(10, 'accord');
      log('[MOD] accord: ' + block + ' block');
    }
  };

  // Kinship — pool mod (common). Applies 4 stacks of poison to the enemy —
  // same poisonStacks field Blight/Virulence/Thurible/the dev poison
  // applier already write to, no second poison system.
  gameState.config.mods['kinship'] = {
    id: 'kinship',
    name: 'Kinship',
    tier: 'common',
    tags: ['bound', 'poison'],
    effect: function() {
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + 4 });
      log('[MOD] kinship: applied 4 stacks of poison, now ' + gameState.enemy.poisonStacks + ' stacks of poison');
    }
  };

  // ---------- BUILD 134: checkpoint 3, the remaining Bound pieces — Concord
  // and Herald. Kyrie/Novena/Canticle (cards) are defined above, among the
  // cards; see that comment block for the shared rationale.

  // Concord — pool mod (uncommon). Bound (permanent, via the 'bound' tag —
  // MOD_DESCRIPTION appends the same ". Bound" suffix Unison/Accord/Kinship
  // already get). +1 soul, 3 block — direct effect, no conditions, same
  // shape as Largesse's own soul+block combo.
  gameState.config.mods['concord'] = {
    id: 'concord',
    name: 'Concord',
    tier: 'uncommon',
    tags: ['bound', 'soul'],
    effect: function() {
      updatePlayer({ soul: gameState.player.soul + 1 });
      const block = dealBlock(3, 'concord');
      log('[MOD] concord: +1 soul, ' + block + ' block');
    }
  };

  // Herald — pool mod (rare). Bound (permanent, via the 'bound' tag). 6
  // damage; one other random loaded face that is not already Bound
  // (isBoundFace(), pipeline.js) gains Bound for this fight, through
  // grantBoundToFace() (pipeline.js) and pickRandom() (state.js, the same
  // Math.random() source shuffle() uses) — own face (data.faceNumber) never
  // counts, same "other" exclusion Magnificat already uses. If no such face
  // exists, only the damage happens — no error, no partial state.
  gameState.config.mods['herald'] = {
    id: 'herald',
    name: 'Herald',
    tier: 'rare',
    tags: ['bound'],
    effect: function(data) {
      const damage = dealDamage('enemy', 6, 'attack', 'herald');
      const ownFaceNumber = data.faceNumber;
      const candidates = gameState.die.faces.filter(function(f) {
        return f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' &&
          f.number !== ownFaceNumber && !isBoundFace(f) && !isFaceSealed(f.number);
      });
      const target = pickRandom(candidates);
      if (target === undefined) {
        log('[MOD] herald: ' + damage + ' damage, no other loaded face without Bound to grant');
        return;
      }
      grantBoundToFace(target.number);
      log('[MOD] herald: ' + damage + ' damage, face ' + target.number + ' granted Bound for the fight');
    }
  };

  renderDevModOptions(); // DEV ONLY — remove before any real release

  // DEV ONLY — BUILD 083: dev chrome closed and the pause checkbox unchecked
  // on every page load. The markup already says so, but a browser restoring
  // form state across a soft reload can re-check the box behind the flag's
  // back — this keeps the two in lockstep. Remove before any real release.
  devChromeOpen = false;
  devPauseBeforeFirstRoll = false;
  document.getElementById('devChrome').classList.remove('expanded');
  document.getElementById('devChromeToggleBtn').textContent = 'Dev Tools ▸';
  document.getElementById('devPauseBeforeRollCheckbox').checked = false;

  // BUILD 122 (KI-18): the on-screen build stamp's number now renders from
  // GAME_CONFIG.BUILD, the single source of truth — no second hand-typed
  // copy of the build number left anywhere to go stale. index.html's
  // #buildStamp keeps its own static "STAGE X.Y" text; only the number
  // after "BUILD" is written here.
  document.getElementById('buildStampNumber').textContent = GAME_CONFIG.BUILD;

  log('[INIT] gameState initialised');
  log('[INIT COMPLETE] ————————————————————————');

  // BUILD 068: the die faces, enemy die faces, and starting-deck-shuffle
  // setup that used to live inline here (ending in startFreshTurnPaused(),
  // jumping straight into a fight) now live in startNewRun(), which ends
  // on the map screen instead — this is the first system above a single
  // fight, so a fresh session no longer starts mid-combat.
  startNewRun();
}
