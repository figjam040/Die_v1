// ============================================================
// LISTENER-REGISTRY.JS — BUILD 090 file split
// The listener system: register/call/clear. Depends only on state.js
// (gameState.registry.listeners, gameState.run.status) and log() (rendering.js,
// safe forward reference — see state.js's header comment for why).
// ============================================================

// ---------- LISTENER SYSTEM ----------

// BUILD 092: dedup guard. Previously pushed a new entry unconditionally on
// every call — safe only because every 'permanent' registration in the
// codebase so far happens exactly once, inside init(). A mod that
// registers a persistent listener from inside its own effect() (a
// compounding synergy mod, the shape this guard is for) would otherwise
// accumulate a duplicate on every trigger, forever. Same hook + same id is
// now a no-op, logged rather than silent, so a real duplicate attempt is
// visible instead of quietly multiplying callListeners()' dispatch. No
// existing registration call site changes — every one of them already
// used a stable, unique id per hook, so this guard never fires for them.
function registerListener(hook, id, fn, clearOn) {
  if (!gameState.registry.listeners[hook]) {
    gameState.registry.listeners[hook] = [];
  }
  const alreadyRegistered = gameState.registry.listeners[hook].some(function(listener) {
    return listener.id === id;
  });
  if (alreadyRegistered) {
    log('[LISTENER] duplicate registration skipped: ' + hook + ' ' + id);
    return;
  }
  gameState.registry.listeners[hook].push({ id: id, fn: fn, clearOn: clearOn });
  log('[LISTENER] registered: ' + hook + ' ' + id);
}

// BUILD 106 (KI-16 fix): now returns each listener's fn(data) return value,
// in registration order — previously nothing consumed a return value, so
// no caller relied on the prior undefined return. This is what lets
// calculateDamage()/generateBlock() (pipeline.js) route their flat-addition
// and multiplier stages through this single dispatch path instead of
// reading gameState.registry.listeners[hook] directly: they no longer need
// a special pipeline-only calling convention, since every hook now calls
// listener.fn(data) uniformly and DAMAGE_MULTIPLIER's sourceType argument
// is just this hook's ordinary data parameter.
function callListeners(hook, data) {
  if (gameState.run.status !== 'active') return [];
  const listeners = gameState.registry.listeners[hook];
  if (!listeners) return [];
  return listeners.map(function(listener) {
    return listener.fn(data);
  });
}

function clearListeners(clearOn) {
  Object.keys(gameState.registry.listeners).forEach(function(hook) {
    gameState.registry.listeners[hook] = gameState.registry.listeners[hook].filter(function(listener) {
      return listener.clearOn !== clearOn;
    });
  });
}
