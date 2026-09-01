(function () {
  'use strict';

  const messageListeners = new Set();
  const statusListeners = new Set();
  let status = 'connecting';
  let initialized = false;
  let connectionTimer = null;

  function requestId(prefix = 'request') {
    return 'ui-' + prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function setStatus(next, detail) {
    if (status === next && detail === undefined) return;
    status = next;
    if (window.AMRStore) window.AMRStore.patch({ connection: { uibuilder: next } }, 'transport-status');
    statusListeners.forEach(listener => listener(next, detail));
  }

  function dispatch(msg) {
    if (!msg || typeof msg !== 'object') return;
    messageListeners.forEach(listener => {
      try { listener(msg); } catch (error) { console.error('[transport listener]', error); }
    });
  }

  function send(topic, payload = {}, options = {}) {
    const id = options.requestId || payload.request_id || payload.command_id || requestId(options.prefix || 'command');
    const message = { topic, payload: Object.assign({}, payload) };
    if (!message.payload.request_id && !message.payload.command_id) message.payload.request_id = id;
    const command = { topic, payload: message.payload, createdAt: new Date().toISOString() };
    if (window.AMRStore && options.track !== false) window.AMRStore.markCommand(id, command);

    if (window.uibuilder && typeof window.uibuilder.send === 'function' && status === 'online') {
      window.uibuilder.send(message);
      return { id, sent: true, message };
    }

    console.info('[uibuilder offline]', message);
    return { id, sent: false, message };
  }

  function requestSnapshot(reason = 'connect') {
    return send('ui/state/request', {
      request_id: requestId('state'),
      reason,
      known_revision: window.AMRStore ? window.AMRStore.getState().revision : 0,
      created_at: new Date().toISOString()
    }, { track: false, prefix: 'state' });
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    const ub = window.uibuilder;

    if (!ub || typeof ub.onChange !== 'function') {
      setStatus('offline', 'uibuilder client unavailable');
      return;
    }

    ub.onChange('msg', dispatch);
    ub.onChange('ioConnected', connected => {
      clearTimeout(connectionTimer);
      if (connected) {
        setStatus('online');
        requestSnapshot('uibuilder-connected');
      } else {
        setStatus('offline', 'socket disconnected');
      }
    });

    connectionTimer = setTimeout(() => {
      if (status === 'connecting') setStatus('offline', 'connection timeout');
    }, 6000);
  }

  window.addEventListener('online', () => {
    if (window.AMRStore) window.AMRStore.patch({ connection: { browser: 'online' } }, 'browser-online');
    if (status === 'online') requestSnapshot('browser-online');
  });
  window.addEventListener('offline', () => {
    if (window.AMRStore) window.AMRStore.patch({ connection: { browser: 'offline', uibuilder: 'offline' } }, 'browser-offline');
    setStatus('offline', 'browser offline');
  });

  window.AMRTransport = {
    initialize,
    send,
    requestSnapshot,
    requestId,
    getStatus: () => status,
    subscribe(listener) { messageListeners.add(listener); return () => messageListeners.delete(listener); },
    onStatus(listener) { statusListeners.add(listener); return () => statusListeners.delete(listener); },
    receiveForTest: dispatch
  };

  initialize();
})();

