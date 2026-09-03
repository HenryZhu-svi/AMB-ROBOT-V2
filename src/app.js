(function () {
  'use strict';

  const store = window.AMRStore;
  const transport = window.AMRTransport;
  const state = store.getState();
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function setView(name, options = {}) {
    const view = $('#' + name + 'View');
    if (!view) return false;
    $$('.view').forEach(item => item.classList.remove('is-active'));
    view.classList.add('is-active');
    $('#app').dataset.view = name;
    if (options.persist !== false) store.set('ui.view', name, 'view-change');
    return true;
  }
  window.setView = setView;

  function tickClock() {
    $('#clock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  tickClock();
  setInterval(tickClock, 1000);

  function sendEdge(action, params = {}) {
    const requestId = transport.requestId(action);
    return transport.send('edge/command/request', {
      request_id: requestId,
      action,
      params,
      expected_revision: state.revision,
      created_at: new Date().toISOString()
    }, { requestId });
  }
  window.sendEdge = sendEdge;

  function controlAvailable() {
    return transport.getStatus() === 'online' && (!window.AMRWorkflow || window.AMRWorkflow.canNavigate());
  }

  function pointId(value) {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    return String(value.id || value.point || value.poi || value.value || '').trim();
  }

  function normalizeVisiblePoints(value) {
    if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? { id: item, label: item } : { id: pointId(item), label: String(item.label || item.name || pointId(item)) }).filter(item => item.id);
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.points)) return normalizeVisiblePoints(value.points);
    const selected = value.point;
    const ids = Array.isArray(selected) ? selected : selected ? [selected] : [];
    return ids.map(id => ({ id: String(id), label: String(value['label_' + id] || id) }));
  }

  function configuredPoint(kind) {
    const config = state.config || {};
    return pointId(kind === 'charge' ? config.chargingPoint : config.standbyPoint);
  }

  function connectionLabel(value) {
    if (value === 'online') return 'Online';
    if (['syncing', 'connecting', 'resyncing'].includes(value)) return 'Syncing';
    return 'Offline';
  }

  function renderSystemState(current) {
    const robot = current.robot || {};
    const connection = current.connection && typeof current.connection === 'object'
      ? current.connection
      : { fleet: current.connection || 'unknown', uibuilder: transport.getStatus() };
    const battery = robot.battery == null ? NaN : Number(robot.battery);
    const fleet = connection.fleet === 'online' && connection.uibuilder === 'online'
      ? 'online'
      : connection.uibuilder === 'connecting' ? 'syncing' : connection.uibuilder !== 'online' ? 'offline' : connection.fleet || 'offline';

    $('#robotMode').textContent = robot.mode && robot.mode !== 'unknown' ? String(robot.mode).replace(/_/g, ' ') : 'Checking';
    $('#currentPoi').textContent = robot.currentPoi || '—';
    document.querySelectorAll('[data-robot-name]').forEach(el => { el.textContent = robot.name || robot.id || 'Robot'; });
    $('#fleetStatus').textContent = connectionLabel(fleet);
    $('#fleetDot').className = 'status-dot ' + (fleet === 'online' ? 'ok' : 'warn');
    $('#footerMessage').textContent = connection.uibuilder === 'online' ? 'Control service connected' : 'Restoring control connection';

    const chargePoint = configuredPoint('charge');
    const standbyPoint = configuredPoint('standby');
    $('#chargeActionHint').textContent = chargePoint ? 'Navigate to charger ' + chargePoint : 'Charging point not configured';
    $('#standbyActionHint').textContent = standbyPoint ? 'Return to standby point ' + standbyPoint : 'Standby point not configured';
    $('[data-action="charge"]').disabled = !chargePoint || !controlAvailable();
    $('[data-action="standby"]').disabled = !standbyPoint || !controlAvailable();
    $('[data-action="point"]').disabled = !normalizeVisiblePoints(current.config && current.config.visiblePoints).length || !controlAvailable();

    if (Number.isFinite(battery)) {
      const safeBattery = Math.max(0, Math.min(100, battery));
      $('#batteryText').textContent = Math.round(safeBattery) + '%';
      $('#batteryFill').style.width = safeBattery + '%';
    } else {
      $('#batteryText').textContent = '—';
      $('#batteryFill').style.width = '0%';
    }

    const task = current.task;
    if (task && !['completed', 'cancelled', 'failed'].includes(String(task.state || '').toLowerCase())) {
      $('#taskTitle').textContent = task.name || 'Active Task';
      $('#taskDetail').textContent = task.currentStep ? 'Fleet step: ' + task.currentStep : task.destination ? 'Destination: ' + task.destination : 'Task in progress';
      $('#taskBadge').textContent = String(task.state || 'RUNNING').toUpperCase();
    } else {
      $('#taskTitle').textContent = 'No Active Task';
      $('#taskDetail').textContent = controlAvailable() ? 'Robot is ready to accept a new task' : 'Check robot and connection status';
      $('#taskBadge').textContent = controlAvailable() ? 'READY' : 'CHECK STATUS';
    }
  }

  function restoreOperationalView(current) {
    const navState = String(current.navigation && current.navigation.state || '').toLowerCase();
    if (navState === 'paused') setView('paused', { persist: false });
    else if (['running', 'moving', 'accepted', 'waiting'].includes(navState)) setView('moving', { persist: false });
    else if (current.ui.restoring === false && ['moving', 'paused'].includes(current.ui.view)) setView('home', { persist: false });
  }

  function startMove(source, target) {
    if (!controlAvailable()) {
      $('#footerMessage').textContent = 'Command unavailable while local control is offline';
      transport.requestSnapshot('command-blocked-offline');
      return;
    }
    const from = state.robot.currentPoi || '—';
    store.patch({ navigation: { state: 'submitting', source, from, destination: target }, robot: { mode: 'Submitting' }, task: { source: 'local', name: source, state: 'submitting', destination: target } }, 'navigation-submit');
    $('#movingTitle').textContent = 'Moving to ' + target;
    $('#pausedTaskName').textContent = source;
    $('#pausedAction').textContent = 'Go to ' + target;
    $('#pausedFrom').textContent = from;
    $('#pausedTo').textContent = target;
    $('#taskRoute').hidden = false;
    $('#routeFrom').textContent = from;
    $('#routeTo').textContent = target;
    const result = sendEdge(source === 'Charging Run' ? 'charge' : 'navigate', { source, target });
    if (!result.sent) { store.patch({navigation:{state:'unknown'},task:null},'not-sent'); return; }
    window.AMRWorkflow?.track('navigate', result);
    setView('moving');
  }

  function confirmAction(title, text, confirmText, onConfirm) {
    const dialog = $('#confirmDialog');
    $('#dialogTitle').textContent = title;
    $('#dialogText').textContent = text;
    $('#dialogConfirm').textContent = confirmText;
    dialog.returnValue = '';
    dialog.showModal();
    dialog.addEventListener('close', function done() {
      dialog.removeEventListener('close', done);
      if (dialog.returnValue === 'confirm') onConfirm();
    });
  }
  window.confirmAction = confirmAction;

  function escapeHtml(value) {
    const span = document.createElement('span');
    span.textContent = String(value);
    return span.innerHTML;
  }

  function openPointDialog() {
    const points = normalizeVisiblePoints(state.config && state.config.visiblePoints);
    $('#pointChoices').innerHTML = points.map((point, index) => '<label class="point-choice"><input type="radio" name="destination" value="' + escapeHtml(point.id) + '" ' + (index === 0 ? 'checked' : '') + '><span><strong>' + escapeHtml(point.label) + '</strong><small>' + escapeHtml(point.id) + '</small></span><b>›</b></label>').join('');
    $('#pointFeedback').textContent = points.length ? '' : 'No operator destinations are configured.';
    $('#pointDialog').showModal();
  }

  $$('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'device') return $('#infoDialog').showModal();
    if (action === 'settings') {
      $('#settingsPassword').value = '';
      $('#passwordError').textContent = '';
      return $('#settingsDialog').showModal();
    }
    if (action === 'fleet') return window.openFleetTasks();
    if (action === 'point') return openPointDialog();
    if (action === 'charge') { const target = configuredPoint('charge'); return target && confirmAction('Go to Charger', 'Robot will navigate to charger ' + target + '.', 'Go Charge', () => startMove('Charging Run', target)); }
    if (action === 'standby') { const target = configuredPoint('standby'); return target && confirmAction('Return to Standby', 'Robot will return to standby point ' + target + '.', 'Return', () => startMove('Standby Return', target)); }
  }));

  $('#pointForm').addEventListener('submit', event => {
    if (event.submitter && event.submitter.value === 'cancel') return;
    event.preventDefault();
    const target = new FormData(event.currentTarget).get('destination');
    if (!target) { $('#pointFeedback').textContent = 'Select a destination.'; return; }
    const selected = normalizeVisiblePoints(state.config && state.config.visiblePoints).find(item => item.id === target);
    $('#pointDialog').close();
    confirmAction('Go to Point', 'Navigate to ' + (selected && selected.label || target) + ' (' + target + ').', 'Start Move', () => startMove('Point-to-Point Move', target));
  });

  $('#movingTouchArea').addEventListener('pointerup', () => {
    if (transport.getStatus() !== 'online' || state.navigation.state === 'pausing') return;
    const result = sendEdge('pause', { target: state.navigation.destination });
    if (!result.sent) return;
    window.AMRWorkflow?.track('pause', result);
    store.patch({ navigation: { state: 'pausing' } }, 'navigation-pause-request');
    setView('paused');
  });
  $('#resumeButton').addEventListener('click', () => {
    if (transport.getStatus() !== 'online' || state.navigation.state !== 'paused') return;
    const result = sendEdge('resume', { target: state.navigation.destination });
    if (!result.sent) return;
    window.AMRWorkflow?.track('resume', result);
    store.patch({ navigation: { state: 'resuming' } }, 'navigation-resume-request');
  });
  $('#cancelButton').addEventListener('click', () => confirmAction(
    'Cancel Current Task?',
    'Robot will stop the current navigation.\nTask: ' + (state.task && state.task.name || 'Current task') + '\nDestination: ' + (state.navigation.destination || '—'),
    'Confirm Cancel',
    () => {
      if (transport.getStatus() !== 'online') return;
      const result = sendEdge('cancel', { target: state.navigation.destination });
      if (!result.sent) return;
      window.AMRWorkflow?.track('cancel', result);
      store.patch({ navigation: { state: 'cancelling' }, robot: { mode: 'Cancelling' } }, 'navigation-cancel');
    }
  ));

  $('#togglePassword').addEventListener('click', () => {
    const input = $('#settingsPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#togglePassword').textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  $('#passwordForm').addEventListener('submit', event => {
    if (event.submitter && event.submitter.value === 'cancel') return;
    event.preventDefault();
    if ($('#settingsPassword').value !== 'admin_amr') {
      $('#passwordError').textContent = 'Incorrect password. Please try again.';
      $('#settingsPassword').select();
      return;
    }
    $('#settingsDialog').close();
    setView('settings');
    window.AMRSettings.refresh();
  });
  $('#closeSettings').addEventListener('click', () => setView('home'));

  // Settings are handled by settings.js using the live point catalog.

  function normalizedRobotPatch(topic, payload) {
    if (topic === 'battery') return { battery: Number(payload && typeof payload === 'object' ? payload.battery_pct ?? payload.battery : payload), ...(typeof payload?.charging === 'boolean' ? {charging:payload.charging} : {}) };
    if (topic === 'poi') return { currentPoi: String(payload || '—') };
    if (topic === 'status') return { mode: String(payload && payload.mode || payload || 'unknown') };
    if (topic === 'robotName') return { name: String(payload || state.robot.name) };
    return null;
  }

  // A coordinate array or a Fleet job title is not a named physical destination.
  function namedPoint(value) {
    if (Array.isArray(value) || value == null) return '';
    if (typeof value === 'object') return namedPoint(value.poi || value.station_id || value.stationId || value.point || value.id);
    return typeof value === 'string' && value.trim() !== '-' ? value.trim() : '';
  }

  function handleBackendMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const topic = String(msg.topic || '');
    const payload = msg.payload;

    if (topic === 'ui/state/snapshot') {
      if (store.applySnapshot(payload, 'backend-snapshot')) restoreOperationalView(state);
      return;
    }
    if (topic === 'ui/command/ack' || topic === 'fleet/command/ack') {
      store.resolveCommand(payload && (payload.request_id || payload.command_id));
      if (payload && payload.accepted === false) {
        $('#footerMessage').textContent = 'Command rejected: ' + (payload.error || 'unknown reason');
        transport.requestSnapshot('command-rejected');
      }
      return;
    }

    const robotPatch = normalizedRobotPatch(topic, payload);
    if (robotPatch) { store.patch({ robot: robotPatch }, 'legacy-' + topic); return; }
    if (topic === 'destination') {
      const destination=namedPoint(payload);
      if(destination)store.patch({navigation:{destination}},topic);
      return;
    }
    if (topic === 'nav/started' || topic === 'nav/progress') {
      const destination = namedPoint(payload?.target) || namedPoint(payload?.destination) || namedPoint(payload?.poi) || state.navigation.destination;
      const mode = payload?.is_suspended || ['suspended','paused'].includes(payload?.mode) ? 'paused' : payload?.mode === 'waiting' ? 'waiting' : 'running';
      store.patch({ navigation: { state: mode, destination }, robot: { mode } }, topic);
      $('#movingTitle').textContent = 'Moving to ' + (destination || 'destination');
      setView(mode === 'paused' ? 'paused' : 'moving', { persist: false });
      return;
    }
    if (topic === 'nav/paused') { store.patch({ navigation: { state: 'paused' }, robot: { mode: 'Paused' } }, topic); setView('paused', { persist: false }); return; }
    if (topic === 'nav/resumed') { store.patch({ navigation: { state: 'running' }, robot: { mode: 'Moving' } }, topic); setView('moving', { persist: false }); return; }
    if (topic === 'nav/arrived' || topic === 'nav/cancelled') {
      const currentPoi = topic === 'nav/arrived' ? payload?.current_station || payload?.poi || state.robot.currentPoi : state.robot.currentPoi;
      store.patch({ navigation: { state: 'idle', destination: null }, robot: { mode: 'Idle', currentPoi }, ...(state.task?.source === 'local' ? {task:null} : {}) }, topic);
      $('#taskRoute').hidden = true;
      setView('home', { persist: false });
      return;
    }
    if (topic === 'nav/error') { store.patch({navigation:{state:'unknown'}},topic); setView('paused'); $('#footerMessage').textContent = payload?.error || 'Navigation status unavailable'; return; }
    if (topic === 'config/saved' && !window.AMRSettings) {
      store.resolveCommand(payload && payload.request_id);
      if (payload && payload.config) store.patch({ config: payload.config }, 'config-saved');
      $('#configFeedback').textContent = 'Settings saved';
      setTimeout(() => $('#configDialog').close(), 500);
    }
  }

  transport.subscribe(handleBackendMessage);
  store.subscribe(renderSystemState);
  renderSystemState(state);
  transport.requestSnapshot('page-loaded');
})();
