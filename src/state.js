(function () {
  'use strict';

  const STORAGE_KEY = 'svi.amr.ui.v2.snapshot';
  const listeners = new Set();
  const initialState = {
    revision: 0,
    updatedAt: null,
    ui: { view: 'home', restoring: true },
    connection: { browser: navigator.onLine ? 'online' : 'offline', uibuilder: 'connecting', fleet: 'unknown' },
    robot: { id: 'AMB-20', name: 'AMB-20', mode: 'unknown', battery: null, currentPoi: '—' },
    navigation: { state: 'idle', source: null, from: null, destination: null },
    task: null,
    config: { standbyPoint: null, chargingPoint: null, visiblePoints: [], fleetTasks: [] },
    pendingCommands: {}
  };

  const state = JSON.parse(JSON.stringify(initialState));

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function merge(target, source) {
    if (!isObject(source)) return target;
    Object.keys(source).forEach(key => {
      if (isObject(source[key]) && isObject(target[key])) merge(target[key], source[key]);
      else target[key] = source[key];
    });
    return target;
  }

  function notify(reason) {
    listeners.forEach(listener => {
      try { listener(state, reason); } catch (error) { console.error('[state listener]', error); }
    });
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        revision: state.revision,
        updatedAt: state.updatedAt,
        connection: { fleet: state.connection.fleet },
        robot: state.robot,
        navigation: state.navigation,
        task: state.task,
        config: state.config
      }));
    } catch (error) {
      console.warn('[state] local restore cache unavailable', error);
    }
  }

  function restore() {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (isObject(cached)) merge(state, {config:cached.config || {}, robot:{...cached.robot,mode:'unknown'}, task:null, navigation:initialState.navigation});
    } catch (error) {
      console.warn('[state] cached snapshot ignored', error);
    }
  }

  restore();

  window.AMRStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    patch(partial, reason = 'patch') {
      merge(state, partial);
      notify(reason);
      return state;
    },
    set(path, value, reason = 'set') {
      const keys = Array.isArray(path) ? path : String(path).split('.');
      let cursor = state;
      keys.slice(0, -1).forEach(key => {
        if (!isObject(cursor[key])) cursor[key] = {};
        cursor = cursor[key];
      });
      cursor[keys[keys.length - 1]] = value;
      notify(reason);
      return value;
    },
    applySnapshot(snapshot, reason = 'snapshot') {
      if (!isObject(snapshot)) return false;
      const incomingRevision = Number(snapshot.revision || 0);
      if (incomingRevision && incomingRevision < Number(state.revision || 0)) return false;
      merge(state, snapshot);
      if (incomingRevision) state.revision = incomingRevision;
      state.updatedAt = snapshot.updatedAt || snapshot.updated_at || new Date().toISOString();
      state.ui.restoring = false;
      persist();
      notify(reason);
      return true;
    },
    markCommand(commandId, command) {
      state.pendingCommands[commandId] = command;
      notify('command-pending');
    },
    resolveCommand(commandId) {
      if (!commandId || !state.pendingCommands[commandId]) return;
      delete state.pendingCommands[commandId];
      notify('command-resolved');
    },
    persist
  };
})();
