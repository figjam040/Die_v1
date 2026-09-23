// Card lookup/draw/play, and init() — every card, mod, and class
// definition, plus the Ordained's passive registrations, all built inline
// inside one init() function.

// ---------- CARD LOOKUP ----------

function getCard(id) { return gameState.config.cards[id]; }

// A card carries an optional card.getCost(gameState) function when its
// cost depends on live gameState rather than a fixed soulCost.
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

  // Rite and Litany are the only cards whose effect() deals both damage
  // and block, so they're checked by id rather than a fourth card.type.
  // Utility cards get no card-play sound — silence is deliberate.
  const cardSoundEvent = (cardId === 'rite' || cardId === 'litany') ? 'card_hybrid'
    : card.type === 'attack' ? 'card_attack'
    : card.type === 'block' ? 'card_block'
    : null;
  if (cardSoundEvent) { playAudioEvent(cardSoundEvent); }

  card.effect(gameState);
  callListeners('ON_CARD_PLAY', { card: card });
  updateTurn({ cardsPlayed: gameState.turn.cardsPlayed.concat([card.name]) });

  const newHand = gameState.player.hand.slice();
  newHand.splice(handIndex, 1);
  updatePlayer({ hand: newHand, discard: gameState.player.discard.concat([cardId]) });

  log('[CARD] played ' + card.name + ' (cost ' + cost + ')');

  // A card can kill the enemy mid-CARD_PHASE, with no phase transition to
  // trigger runPhase()'s own win/loss guard — checkWinNow() re-enters it.
  checkWinNow();
}

// ---------- AWE ----------

// The one setter for gameState.enemy.aweStacks — every mod/card that
// applies awe calls this instead of writing the field directly.
function applyAwe(stacks) {
  const newStacks = gameState.enemy.aweStacks + stacks;
  updateEnemy({ aweStacks: newStacks });
  log('[AWE] applied ' + stacks + ' stacks of awe, now ' + newStacks + ' stacks of awe');
}

// ---------- ARTIFACTS ----------

function hasArtifact(id) {
  return gameState.run.artifacts.indexOf(id) !== -1;
}

// Alms replaces the blank passive itself, so both the artifact's own
// listener and the class passive read this one predicate rather than
// each deciding for itself.
function almsReplacesBlankRoll(data) {
  return hasArtifact('alms') && !(data && data.outsideRoll);
}

// Faces 2-19 carrying a mod, face 10's anchor excluded — Plague Bell's
// own count.
function plagueBellLoadedFaceCount() {
  return gameState.die.faces.filter(function(f) {
    if (f.number === 1 || f.number === 10 || f.number === GAME_CONFIG.DIE_SIZE.PLAYER) { return false; }
    return f.modId !== null;
  }).length;
}

// Every shop price but the card removal, a quarter lower while
// Merchant's Seal is held. Rounds down.
function shopPriceWithArtifacts(basePrice) {
  if (!hasArtifact('merchants_seal')) { return basePrice; }
  return Math.floor(basePrice * (1 - GAME_CONFIG.ARTIFACTS.MERCHANTS_SEAL_DISCOUNT));
}

// Removal is the one price the Seal freezes rather than discounts: it
// stays at its starting price instead of stepping up per purchase.
function shopRemovalPrice() {
  if (hasArtifact('merchants_seal')) { return GAME_CONFIG.SHOP.REMOVAL_BASE_PRICE; }
  return gameState.run.removalPrice;
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

  gameState.config.cards['communion'] = {
    id: 'communion', name: 'Communion', soulCost: 0, type: 'utility', classRestriction: null, tier: 'uncommon', tags: ['soul'],
    effect: function(gameState) {
      updatePlayer({ soul: gameState.player.soul + 2 });
    }
  };

  gameState.config.cards['censer'] = {
    id: 'censer', name: 'Censer', soulCost: 1, type: 'utility', classRestriction: null, tier: 'common', tags: ['poison'],
    effect: function(gameState) {
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + 4 });
    }
  };

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
    // Reads getIncomingIntentDamage(), not the raw intent — a wind-up or
    // broken release deals 0 real damage this round even with a big pattern number.
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

  // Reads chargeStage directly, not getIncomingIntentDamage() — Bulwark
  // cares about the enemy being mid-Charge at all, wind-up or release,
  // not about how much that Charge is about to deal.
  gameState.config.cards['bulwark'] = {
    id: 'bulwark', name: 'Bulwark', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const charging = gameState.enemy.chargeStage === 'windup' || gameState.enemy.chargeStage === 'release';
      const block = dealBlock(charging ? 16 : 6, 'bulwark');
      if (charging) {
        log('[CARD] bulwark: 16 block, enemy charging');
      } else {
        log('[CARD] bulwark: 6 block');
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

  // Capped at 12 — uncapped, a Consecrate turn reaches the mid-20s to
  // mid-30s off one 1-soul card.
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

  // Reads gameState.turn.rolledFaceWeight directly — rewards Strengthen
  // concentration on whatever face came up, blank or mod trigger alike.
  gameState.config.cards['covenant'] = {
    id: 'covenant', name: 'Covenant', soulCost: 1, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['mass'],
    effect: function(gameState) {
      const weight = gameState.turn.rolledFaceWeight;
      const damage = dealDamage('enemy', 2 + (3 * weight), 'attack', 'covenant');
      log('[CARD] covenant: ' + damage + ' damage (face weight ' + weight + ')');
    }
  };

  // getCost() is read by both playCard()'s affordability gate and the
  // hand-card badge via getCardCost(). Reads modTriggeredThisTurn, not
  // rollOutcome === 'mod' — rollOutcome reads 'nat_twenty' on a Nat 20
  // turn regardless of how many faces triggered, so Rapture needs a flag
  // set at the actual trigger site (mod_dispatch) to survive that case.
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

  // Reads rollOutcome directly — excludes NAT_ONE/NAT_TWENTY, which carry
  // no loaded mod but aren't 'blank' either, from the 9-damage branch.
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

  // Reads the rolled face's own modData.triggerCount — a blank roll's
  // face carries no modData, so the read falls through to 0. Faces 1/20
  // carry this same field, so a Nat roll reads its own count too.
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

  // Scans every loaded face for the highest weight.
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

  // Counts blank (modId null)
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

  // Counts loaded mods (both
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

  // Flat damage, same shape as Rebuke.
  gameState.config.cards['chastise'] = {
    id: 'chastise', name: 'Chastise', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 7, 'attack', 'chastise');
    }
  };

  // Flat block, same shape as Ward.
  gameState.config.cards['cloister'] = {
    id: 'cloister', name: 'Cloister', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      const block = dealBlock(7, 'cloister');
    }
  };

  // Draws through the same drawCards() path Scripture already uses.
  gameState.config.cards['psalm'] = {
    id: 'psalm', name: 'Psalm', soulCost: 0, type: 'utility', classRestriction: null, tier: 'common', tags: [],
    effect: function(gameState) {
      drawCards(1);
    }
  };

  // Reads block BEFORE its own dealBlock() call adds to it.
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

  // Block is read only, never spent, doubled and capped higher.
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

  // Reads gameState.enemy.poisonStacks.
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

  // Reads enemy poison stacks without removing them.
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

  // Reads the enemy's own intent this round (gameState.enemy.currentEntry)
  // instead of the player's remaining soul. A wind-up, a release and an
  // Afflict all count as "not an Attack" — only a literal {kind:'attack'}
  // entry gets the base 6.
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

  // Flat damage, no special
  // affordability code — renderCardButtons()'s existing soul >= cost check
  // already dims it on base soul 3, same as any other card.
  gameState.config.cards['gloria'] = {
    id: 'gloria', name: 'Gloria', soulCost: 4, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['soul'],
    effect: function(gameState) {
      const damage = dealDamage('enemy', 30, 'attack', 'gloria');
    }
  };

  // Spends whatever soul is left
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

  // Reads gameState.turn.
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

  // Weight added means the
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

  // ---------- OUTSIDE-ROLL TRIGGER ----------
  // Threnody and Reverberation both go through triggerFaceOutsideRoll()
  // (pipeline.js), the one shared function every outside-roll piece uses;
  // Magnificat (a mod) is defined further down among the mods.

  // Always triggers the SAME face all run — gameState.run.threnodyFace, a
  // whole number from 2 to 19 rolled once at run creation — through
  // triggerFaceOutsideRoll(), which treats a blank OR Sealed face as
  // blank (the 2-block roll), like Reverberation.
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

  // Re-triggers the face
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

  // ---------- BOUND PIECES ----------
  // Kyrie, Novena, Canticle (cards); Concord, Herald (mods, defined
  // further down). Kyrie/Canticle read isBoundFace()/call
  // grantBoundToFace(), Novena calls triggerFaceOutsideRoll() once per
  // loaded Bound face — all three from the Bound engine (pipeline.js).

  // 10 damage if the rolled face is itself Bound (isBoundFace()).
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

  // Every loaded Bound face triggers through triggerFaceOutsideRoll(),
  // paced by the same playSweep() runBoundScan() uses.
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
      // checkWinNow() as onComplete catches a kill from one of these
      // staggered triggers, since playCard()'s own call fires too early.
      playSweep(boundFaces.map(function(f) { return f.number; }), function(faceNumber) {
        triggerFaceOutsideRoll(faceNumber);
      }, checkWinNow);
    }
  };

  // If the rolled face is loaded, it gains Bound for the fight via grantBoundToFace().
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

  // ---------- AWE CARDS ----------
  // Kneel, Compline, Tremendum, Mysterium — all read/apply
  // gameState.enemy.aweStacks via applyAwe() (cards-mods.js).

  gameState.config.cards['kneel'] = {
    id: 'kneel', name: 'Kneel', soulCost: 1, type: 'utility', classRestriction: null, tier: 'common', tags: ['awe'],
    effect: function(gameState) {
      applyAwe(3);
    }
  };

  gameState.config.cards['compline'] = {
    id: 'compline', name: 'Compline', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: ['awe'],
    effect: function(gameState) {
      const block = dealBlock(4, 'compline');
      applyAwe(2);
      log('[CARD] compline: ' + block + ' block');
    }
  };

  gameState.config.cards['tremendum'] = {
    id: 'tremendum', name: 'Tremendum', soulCost: 1, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['awe'],
    effect: function(gameState) {
      const rawDamage = Math.min(12, 4 + 2 * gameState.enemy.aweStacks);
      const damage = dealDamage('enemy', rawDamage, 'attack', 'tremendum');
      log('[CARD] tremendum: ' + damage + ' damage');
    }
  };

  gameState.config.cards['mysterium'] = {
    id: 'mysterium', name: 'Mysterium', soulCost: 0, type: 'attack', classRestriction: null, tier: 'rare', tags: ['awe'],
    effect: function(gameState) {
      const rawDamage = Math.min(12, 3 * gameState.enemy.aweStacks);
      const damage = dealDamage('enemy', rawDamage, 'attack', 'mysterium');
      log('[CARD] mysterium: ' + damage + ' damage, stacks of awe unchanged');
    }
  };

  gameState.config.cards['venom'] = {
    id: 'venom', name: 'Venom', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: ['poison'],
    effect: function(gameState) {
      const stacks = gameState.enemy.poisonStacks > 0 ? 4 : 2;
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + stacks });
      log('[CARD] venom: ' + stacks + ' stacks of poison applied');
    }
  };

  gameState.config.cards['ballast'] = {
    id: 'ballast', name: 'Ballast', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: ['mass'],
    effect: function(gameState) {
      const heaviest = gameState.die.faces.reduce(function(max, f) {
        return f.weight > max ? f.weight : max;
      }, 0);
      const damage = dealDamage('enemy', Math.min(12, 3 * heaviest), 'attack', 'ballast');
      log('[CARD] ballast: ' + damage + ' damage (heaviest face weight ' + heaviest + ')');
    }
  };

  // Same outside-roll path Reverberation uses; faces 1 and 20 are refused
  // there, so a Nat roll simply does nothing.
  gameState.config.cards['refrain'] = {
    id: 'refrain', name: 'Refrain', soulCost: 2, type: 'utility', classRestriction: null, tier: 'uncommon', tags: ['bound'],
    effect: function(gameState) {
      const faceNumber = gameState.turn.rolledFaceNumber;
      const triggered = faceNumber !== null && triggerFaceOutsideRoll(faceNumber);
      if (triggered) {
        log('[CARD] refrain: face ' + faceNumber + ' triggered again');
      } else {
        log('[CARD] refrain: face ' + faceNumber + ' could not trigger again');
      }
    }
  };

  // The real roll path, Loaded Die included — the new face resolves as a
  // roll, Nats and all. The first roll's own face is left as it landed.
  gameState.config.cards['second_sight'] = {
    id: 'second_sight', name: 'Second Sight', soulCost: 1, type: 'utility', classRestriction: null, tier: 'uncommon', tags: ['die'],
    effect: function(gameState) {
      const face = rollWithArtifacts(gameState.die.faces);
      log('[CARD] second_sight: rolled face ' + face.number + ' again');
      resolvePlayerRoll(face);
    }
  };

  gameState.config.cards['cadence'] = {
    id: 'cadence', name: 'Cadence', soulCost: 1, type: 'attack', classRestriction: null, tier: 'common', tags: ['growth'],
    effect: function(gameState) {
      const damage = dealDamage('enemy', Math.min(12, 2 * gameState.turn.round), 'attack', 'cadence');
      log('[CARD] cadence: ' + damage + ' damage (round ' + gameState.turn.round + ')');
    }
  };

  gameState.config.cards['watchword'] = {
    id: 'watchword', name: 'Watchword', soulCost: 1, type: 'block', classRestriction: null, tier: 'common', tags: ['bound'],
    effect: function(gameState) {
      const bound = gameState.turn.boundTriggeredThisRound;
      const block = dealBlock(bound ? 12 : 5, 'watchword');
      log('[CARD] watchword: ' + block + ' block' + (bound ? ' (a Bound face triggered this round)' : ''));
    }
  };

  gameState.config.cards['blight_weight'] = {
    id: 'blight_weight', name: 'Blight Weight', soulCost: 2, type: 'attack', classRestriction: null, tier: 'uncommon', tags: ['poison', 'mass'],
    effect: function(gameState) {
      const weight = gameState.turn.rolledFaceWeight || 0;
      const stacks = Math.min(8, 2 * weight);
      updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + stacks });
      log('[CARD] blight_weight: ' + stacks + ' stacks of poison applied (rolled face weight ' + weight + ')');
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
    bulwark: gameState.config.cards['bulwark'],
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
    canticle: gameState.config.cards['canticle'],
    kneel: gameState.config.cards['kneel'],
    compline: gameState.config.cards['compline'],
    tremendum: gameState.config.cards['tremendum'],
    mysterium: gameState.config.cards['mysterium'],
    venom: gameState.config.cards['venom'],
    ballast: gameState.config.cards['ballast'],
    refrain: gameState.config.cards['refrain'],
    second_sight: gameState.config.cards['second_sight'],
    cadence: gameState.config.cards['cadence'],
    watchword: gameState.config.cards['watchword'],
    blight_weight: gameState.config.cards['blight_weight']
  };

  // Ordained class
  gameState.config.classes['ordained'] = {
    id: 'ordained',
    name: 'The Ordained',
    anchorModId: 'consecrate',
    // Every loaded face on the player die triggers, ascending face order.
    onNatTwenty: function() {
      // A Sealed face is excluded from the sweep — it
      // counts as blank this round, for every rule, Nat 20 included.
      const loadedFaces = gameState.die.faces.filter(function(f) {
        return f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !isFaceSealed(f.number);
      });
      log('[ROLL] Nat 20: ' + loadedFaces.length + ' loaded face' + (loadedFaces.length === 1 ? '' : 's') + ' trigger' + (loadedFaces.length === 1 ? 's' : ''));
      // Tagged natTwentySweep so mod_dispatch's D-51 counter skips these
      // calls — the one exemption, since this can trigger far more than
      // ten faces in one pass. Faces are looked up fresh at dispatch time
      // (not the loadedFaces snapshot) in case an earlier trigger in this
      // sweep wrote to another face. checkWinNow() as onComplete lets every
      // remaining face trigger before the fight is declared won.
      playSweep(loadedFaces.map(function(f) { return f.number; }), function(faceNumber) {
        // This sweep path dispatches directly rather than through
        // triggerFaceOutsideRoll(), so it needs its own hop mark.
        markFaceHopped(faceNumber);
        const f = gameState.die.faces[faceNumber - 1];
        callListeners('MOD_TRIGGER', { modId: f.modId, faceNumber: f.number, natTwentySweep: true });
        if (f.modId2) {
          callListeners('MOD_TRIGGER', { modId: f.modId2, faceNumber: f.number, natTwentySweep: true });
        }
      }, checkWinNow);
    },
    // Nat 1 — Penitence, fight-scoped. The 1-soul loss happens once per
    // turn at START_OF_TURN; this only arms the effect and logs onset.
    // Guard reads natOneFiredThisFight, NOT penitenceActive — a face 1
    // rolled after Penitence expires must still come out a blank, not
    // re-arm Penitence from scratch.
    onNatOne: function() {
      if (gameState.player.natOneFiredThisFight) {
        callListeners('BLANK_ROLL', {});
        return;
      }
      // Bone Counter buys the Nat 1 off outright while the gold is there;
      // Penitence never arms, so a later Nat 1 is charged the same way.
      const boneCounterGold = GAME_CONFIG.ARTIFACTS.BONE_COUNTER_GOLD;
      if (hasArtifact('bone_counter') && gameState.run.gold >= boneCounterGold) {
        updateRun({ gold: gameState.run.gold - boneCounterGold });
        log('[ARTIFACT] Bone Counter: ' + boneCounterGold + ' gold paid instead of Penitence');
        return;
      }
      updatePlayer({
        natOneFiredThisFight: true,
        penitenceActive: true,
        penitenceTurnsRemaining: PENITENCE_TURNS
      });
      log('[ROLL] Penitence begins: 1 soul lost at the start of every turn for the next ' + PENITENCE_TURNS + ' turns');
    },
    // Alms replaces this passive outright on a rolled blank — its own
    // BLANK_ROLL listener grants the soul instead.
    onBlankRoll: function(data) {
      if (almsReplacesBlankRoll(data)) { return; }
      const block = dealBlock(GAME_CONFIG.BLANK_ROLL_BLOCK, 'blank_face');
      log('[BLANK] ' + block + ' block generated');
    },
    startingDeck: GAME_CONFIG.STARTING_DECK.slice()
  };

  registerListener('BLANK_ROLL', 'ordained_blank_passive', gameState.config.classes[gameState.player.classId].onBlankRoll, 'permanent');
  registerListener('NAT_TWENTY', 'ordained_nat_twenty_passive', gameState.config.classes[gameState.player.classId].onNatTwenty, 'permanent');
  registerListener('NAT_ONE', 'ordained_nat_one_passive', gameState.config.classes[gameState.player.classId].onNatOne, 'permanent');

  // ---------- POISON ANSWER ----------
  // At START_OF_TURN, before poison ticks and before block clears, every
  // GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK block still held removes 1
  // stack of poison. Block is read here, not spent. Enemies are
  // unaffected — they have no block field.
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

  // ---------- ENEMY DIE MECHANICS ----------
  // Registered unconditionally, not tied
  // to gameState.player.classId, since they exist regardless of which
  // class is playing or which enemy is being fought.

  // enemy_buff_poison applies gameState.enemy.buffPoisonStacks (fixed at
  // enemy-slot creation, scaled per act) to the player through the same
  // poisonStacks field every player-facing poison source writes to.
  registerListener('ENEMY_BUFF_TRIGGER', 'enemy_buff_dispatch', function(data) {
    if (data.buffId === 'enemy_buff_poison') {
      const amount = gameState.enemy.buffPoisonStacks;
      const newStacks = gameState.player.poisonStacks + amount;
      updatePlayer({ poisonStacks: newStacks });
      log('[ENEMY] applied ' + amount + ' stacks of poison to player, now ' + newStacks + ' stacks of poison');
    } else if (data.buffId === 'enemy_buff_wrath') {
      // Queues into wrathPending; moves into active wrath at the next
      // START_OF_TURN, so this round's already-shown Attack never changes.
      const amount = gameState.enemy.wrathPerTrigger;
      const newPending = gameState.enemy.wrathPending + amount;
      updateEnemy({ wrathPending: newPending });
      log('[ENEMY] Wrath triggers: Attacks +' + amount + ' from next round.');
    } else if (data.buffId === 'enemy_buff_drain') {
      const newDrain = gameState.player.drainNextRound + 1;
      updatePlayer({ drainNextRound: newDrain });
      log('[ENEMY] Drain triggers: 1 less soul next round.');
    } else if (data.buffId === 'enemy_buff_seal') {
      const target = pickHeaviestLoadedFaceForSeal();
      if (target) {
        updatePlayer({ sealNextRound: gameState.player.sealNextRound.concat(target.number) });
        log('[ENEMY] Seal triggers: face ' + target.number + ' counts as blank next round.');
      } else {
        log('[ENEMY] Seal triggers: no loaded face to seal');
      }
    }
  }, 'permanent');

  // Every loaded buff face on the enemy die fires, ascending by face
  // number. Not capped, not once per fight — mirrors the player exactly.
  registerListener('ENEMY_NAT_TWENTY', 'boss_nat_twenty_passive', function() {
    // Cardinal and Pontifex each replace the generic sweep with their own
    // designed Nat 20.
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

  // The die turns on its wielder: this turn's attack is cancelled entirely
  // and the enemy applies its own flat self-poison. Once per fight —
  // after it fires, face 1 resolves as a plain blank for the rest of the fight.
  registerListener('ENEMY_NAT_ONE', 'boss_nat_one_passive', function() {
    if (gameState.enemy.natOneFiredThisFight) {
      log('[ENEMY ROLL] blank');
      return;
    }
    // Cardinal and Pontifex each replace the generic cancel-and-self-poison
    // behaviour with their own designed Nat 1; neither cancels the attack.
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
    // Flat self-poison regardless of how many poison faces the die
    // carries — distinct from the player-facing amount enemy_buff_dispatch applies.
    const newStacks = gameState.enemy.poisonStacks + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON;
    updateEnemy({ poisonStacks: newStacks });
    log('[ENEMY] Nat 1: attack cancelled, ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison applied to itself, now ' + newStacks + ' stacks of poison');
  }, 'permanent');

  // Mods — empty
  gameState.config.mods = {};

  // Generic mod dispatcher — resolves config.mods[modId] and runs its
  // effect on MOD_TRIGGER. data.faceNumber lets a mod like Ordain know
  // which specific face to modify, since the same mod can be loaded on
  // more than one face at once.
  registerListener('MOD_TRIGGER', 'mod_dispatch', function(data) {
    const mod = gameState.config.mods[data.modId];
    if (mod) {
      updateTurn({ modTriggeredThisTurn: true });
      playAudioEvent('mod_trigger');
      // Nat 20's own sweep tags its calls natTwentySweep so this funnel
      // can skip counting them toward the round trigger cap.
      if (!data.natTwentySweep) {
        updateTurn({ roundTriggerCount: gameState.turn.roundTriggerCount + 1 });
      }
      // Bump this specific mod's own trigger count, folded into the
      // triggering face's own modData — data.modId tells us which of this
      // face's (up to two) mod slots just fired. Merges into any existing
      // modData (e.g. Zeal's own accumulatedBonus) rather than replacing it.
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
      updateTurn({ modsTriggered: gameState.turn.modsTriggered.concat([mod.name]) });
      // Watchword reads this — any Bound face, on any trigger path.
      if (isBoundFace(gameState.die.faces[faceIndex])) {
        updateTurn({ boundTriggeredThisRound: true });
      }
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

  // Reads hand size at END_PLAYER_TURN, after cards are played, not at roll time.
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

  // Deals 10 damage plus an accumulated bonus, +4 permanently on every
  // trigger — stored on the triggering face's own modData, per-face (not
  // per-mod), so Zeal on two faces accrues independently on each.
  gameState.config.mods['zeal'] = {
    id: 'zeal',
    name: 'Zeal',
    tier: 'uncommon',
    tags: ['mass', 'growth'],
    effect: function(data) {
      const faceNumber = data.faceNumber;
      const face = gameState.die.faces[faceNumber - 1];
      const bonus = (face.modData && face.modData.accumulatedBonus) || 0;
      const damage = dealDamage('enemy', 10 + bonus, 'attack', 'zeal');

      const newBonus = bonus + 4;
      const newFaces = gameState.die.faces.slice();
      // Merges into the face's existing modData rather than replacing it
      // wholesale — mod_dispatch already wrote this trigger's own
      // triggerCount into modData before calling this effect().
      newFaces[faceNumber - 1] = Object.assign({}, face, { modData: Object.assign({}, face.modData, { accumulatedBonus: newBonus }) });
      updateDie({ faces: newFaces });

      log('[MOD] zeal: ' + damage + ' damage (bonus +' + bonus + ', face ' + faceNumber + ' now +' + newBonus + ')');
    }
  };

  // Pure setup, no direct damage: registers a turn-scoped DAMAGE_MULTIPLIER
  // listener that doubles calculateDamage() calls tagged 'attack' only, so
  // poison ticks are never silently doubled.
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

  // Deals 10 damage, then permanently adds 1 weight to the triggering face.
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

  // 6 damage plus 4 per point of weight on its own face (weight 1 -> 10,
  // weight 2 -> 14, weight 3 -> 18). Reads weight only, writes nothing.
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

  // 10 damage; the face directly above (faceNumber + 1) permanently gains
  // +1 weight, but only if it's loaded and not face 20.
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

  // End-of-round effect: 5 damage per soul remaining, capped at 20.
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

  // ---------- BOUND MODS ----------

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

  // One other random loaded face that is not already Bound gains Bound
  // for this fight; the triggering face itself never counts.
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

  // ---------- AWE PIECES ----------
  // Dread, Genuflect (mods); Kneel, Compline, Tremendum, Mysterium (cards,
  // defined with the rest of the card pool above). All six use applyAwe()
  // (cards-mods.js) — the one setter for gameState.enemy.aweStacks.

  gameState.config.mods['dread'] = {
    id: 'dread',
    name: 'Dread',
    tier: 'common',
    tags: ['awe'],
    effect: function() {
      applyAwe(4);
    }
  };

  gameState.config.mods['genuflect'] = {
    id: 'genuflect',
    name: 'Genuflect',
    tier: 'uncommon',
    tags: ['awe'],
    effect: function() {
      const block = dealBlock(6, 'genuflect');
      applyAwe(3);
      log('[MOD] genuflect: ' + block + ' block');
    }
  };

  // ---------- ARTIFACTS ----------
  // Third Eye, Loaded Die and Tolling Bell each act on the one roll path
  // (nextPhase(), phase-machine.js) rather than a MOD_TRIGGER-shaped
  // listener — none of them are a die trigger, so there is no hook in
  // EVENT HOOKS shaped for "before/instead of the roll itself". Every
  // artifact function still gates itself on hasArtifact(), the same pattern the
  // enemy die mechanics use for "registered unconditionally, checks which
  // one applies".
  gameState.config.artifacts = {
    third_eye: { id: 'third_eye', name: 'Third Eye', text: 'Once per act, before a roll, choose the face.' },
    loaded_die: { id: 'loaded_die', name: 'Loaded Die', text: 'Roll twice, the higher face stands.' },
    tolling_bell: { id: 'tolling_bell', name: 'Tolling Bell', text: 'When the enemy winds up or releases, roll twice and both faces trigger.' },
    tithe_box: { id: 'tithe_box', name: 'Tithe Box', text: 'Every Nat 20 pays 15 gold.' },
    merchants_seal: { id: 'merchants_seal', name: "Merchant's Seal", text: 'Shop prices a quarter lower. Card removal stays at 75.' },
    leaden_face: { id: 'leaden_face', name: 'Leaden Face', text: 'Strengthen adds 2 weight, not 1.' },
    reliquary_chain: { id: 'reliquary_chain', name: 'Reliquary Chain', text: 'When a Bound face is rolled, the loaded face directly above it triggers too.' },
    plague_bell: { id: 'plague_bell', name: 'Plague Bell', text: 'Fight start: the enemy takes stacks of poison equal to half your loaded faces, rounded down.' },
    alms: { id: 'alms', name: 'Alms', text: 'A blank roll gives 1 soul instead of 2 block.' },
    hourglass: { id: 'hourglass', name: 'Hourglass', text: 'Round 1 of every fight, the enemy does nothing.' },
    second_chance: { id: 'second_chance', name: 'Second Chance', text: 'Once per fight, reroll.' },
    gilded_die: { id: 'gilded_die', name: 'Gilded Die', text: 'Before a roll, pay 10 gold: one face gets +2 weight for that roll only.' },
    bone_counter: { id: 'bone_counter', name: 'Bone Counter', text: 'Nat 1 costs 15 gold instead of Penitence. Under 15 gold, Penitence as normal.' }
  };

  // Every artifact with a hook of its own to sit on registers here,
  // unconditionally, and gates itself on hasArtifact() — the same pattern
  // the enemy die mechanics use. The rest (Third Eye, Loaded Die, Tolling
  // Bell, Merchant's Seal, Leaden Face, Second Chance, Gilded Die) act on
  // the roll path or a shop price, where there is no hook to sit on, and
  // gate themselves at that call site instead.
  registerListener('NAT_TWENTY', 'artifact_tithe_box', function() {
    if (!hasArtifact('tithe_box')) { return; }
    const gold = GAME_CONFIG.ARTIFACTS.TITHE_BOX_GOLD;
    updateRun({ gold: gameState.run.gold + gold });
    log('[ARTIFACT] Tithe Box: ' + gold + ' gold');
  }, 'permanent');

  registerListener('BLANK_ROLL', 'artifact_alms', function(data) {
    if (!almsReplacesBlankRoll(data)) { return; }
    const soul = GAME_CONFIG.ARTIFACTS.ALMS_SOUL;
    updatePlayer({ soul: gameState.player.soul + soul });
    log('[ARTIFACT] Alms: +' + soul + ' soul instead of block');
  }, 'permanent');

  registerListener('FIGHT_START', 'artifact_plague_bell', function() {
    if (!hasArtifact('plague_bell')) { return; }
    const stacks = Math.floor(plagueBellLoadedFaceCount() / GAME_CONFIG.ARTIFACTS.PLAGUE_BELL_FACES_PER_STACK);
    if (stacks <= 0) { return; }
    const newStacks = gameState.enemy.poisonStacks + stacks;
    updateEnemy({ poisonStacks: newStacks });
    log('[ARTIFACT] Plague Bell: ' + stacks + ' stacks of poison applied at fight start');
  }, 'permanent');

  // Sets the turn flag ENEMY_ACT_PHASE's own branch reads — the hook
  // fires ahead of that phase's logic, so round 1 is skipped in time.
  registerListener('ENEMY_ACT_PHASE', 'artifact_hourglass', function() {
    if (!hasArtifact('hourglass')) { return; }
    if (gameState.turn.round !== 1) { return; }
    updateTurn({ enemyRoundSkippedThisTurn: true });
  }, 'permanent');

  // Only the face actually rolled starts the chain, so a face the chain
  // itself triggers never starts another one.
  registerListener('MOD_TRIGGER', 'artifact_reliquary_chain', function(data) {
    if (!hasArtifact('reliquary_chain')) { return; }
    if (data.faceNumber !== gameState.turn.rolledFaceNumber) { return; }
    const face = gameState.die.faces[data.faceNumber - 1];
    if (!isBoundFace(face)) { return; }
    const aboveNumber = data.faceNumber + 1;
    if (aboveNumber >= GAME_CONFIG.DIE_SIZE.PLAYER) { return; }
    if (gameState.die.faces[aboveNumber - 1].modId === null) { return; }
    log('[ARTIFACT] Reliquary Chain: face ' + aboveNumber + ' triggers too');
    triggerFaceOutsideRoll(aboveNumber);
  }, 'permanent');

  renderDevModOptions(); // DEV ONLY — remove before any real release

  // DEV ONLY — a browser restoring form state across a soft reload can
  // re-check the box behind the flag's back; this keeps the two in
  // lockstep. Remove before any real release.
  devChromeOpen = false;
  devPauseBeforeFirstRoll = false;
  document.getElementById('devChrome').classList.remove('expanded');
  document.getElementById('devChromeToggleBtn').textContent = 'Dev Tools ▸';
  document.getElementById('devPauseBeforeRollCheckbox').checked = false;

  // GAME_CONFIG.BUILD is the single source of truth — no second
  // hand-typed copy of the build number left anywhere to go stale.
  document.getElementById('buildStampNumber').textContent = GAME_CONFIG.BUILD;

  log('[INIT] gameState initialised');
  log('[INIT COMPLETE] ————————————————————————');

  applyScale();
  window.addEventListener('resize', applyScale);

  startNewRun();
}
