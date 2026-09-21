// Same hook + same id is a no-op: guards against a mod re-registering
// a persistent listener from inside its own effect() on every trigger.
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
