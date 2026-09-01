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
    }, { requestId }).id;
  }
  window.sendEdge = sendEdge;

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
    const battery = Number(robot.battery);
    const fleet = connection.fleet === 'online' && connection.uibuilder === 'online'
      ? 'online'
      : connection.uibuilder === 'connecting' ? 'syncing' : connection.fleet || 'offline';

    $('#robotMode').textContent = robot.mode && robot.mode !== 'unknown' ? String(robot.mode).replace(/_/g, ' ') : 'Checking';
    $('#currentPoi').textContent = robot.currentPoi || '—';
    $('#fleetStatus').textContent = connectionLabel(fleet);
    $('#fleetDot').className = 'status-dot ' + (fleet === 'online' ? 'ok' : 'warn');
    $('#footerMessage').textContent = connection.uibuilder === 'online' ? 'Control service connected' : 'Restoring control connection';

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
      $('#taskDetail').textContent = task.destination ? 'Moving to ' + task.destination : task.currentStep || 'Task in progress';
      $('#taskBadge').textContent = String(task.state || 'RUNNING').toUpperCase();
    } else {
      $('#taskTitle').textContent = 'No Active Task';
      $('#taskDetail').textContent = 'Robot is ready to accept a new task';
      $('#taskBadge').textContent = 'READY';
    }
  }

  function restoreOperationalView(current) {
    const navState = String(current.navigation && current.navigation.state || '').toLowerCase();
    if (navState === 'paused') setView('paused', { persist: false });
    else if (['running', 'moving', 'accepted', 'waiting'].includes(navState)) setView('moving', { persist: false });
    else if (current.ui.restoring === false && ['moving', 'paused'].includes(current.ui.view)) setView('home', { persist: false });
  }

  function startMove(source, target) {
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
    sendEdge('navigate', { source, target });
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

  $$('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'device') return $('#infoDialog').showModal();
    if (action === 'settings') {
      $('#settingsPassword').value = '';
      $('#passwordError').textContent = '';
      return $('#settingsDialog').showModal();
    }
    if (action === 'fleet') return window.openFleetTasks();
    if (action === 'point') return confirmAction('Go to Point', 'Navigate to approved destination LM47.', 'Start Move', () => startMove('Point-to-Point Move', 'LM47'));
    if (action === 'charge') return confirmAction('Go to Charger', 'Robot will navigate to default charger CP1.', 'Go Charge', () => startMove('Charging Run', 'CP1'));
    if (action === 'standby') return confirmAction('Return to Standby', 'Robot will return to standby point HR775.', 'Return', () => startMove('Standby Return', 'HR775'));
  }));

  $('#movingTouchArea').addEventListener('pointerup', () => {
    sendEdge('pause', { target: state.navigation.destination });
    store.patch({ navigation: { state: 'paused' }, robot: { mode: 'Paused' } }, 'navigation-pause');
    setView('paused');
  });
  $('#resumeButton').addEventListener('click', () => {
    sendEdge('resume', { target: state.navigation.destination });
    store.patch({ navigation: { state: 'running' }, robot: { mode: 'Moving' } }, 'navigation-resume');
    setView('moving');
  });
  $('#cancelButton').addEventListener('click', () => confirmAction(
    'Cancel Current Task?',
    'Robot will stop the current navigation.\nTask: ' + (state.task && state.task.name || 'Current task') + '\nDestination: ' + (state.navigation.destination || '—'),
    'Confirm Cancel',
    () => {
      sendEdge('cancel', { target: state.navigation.destination });
      store.patch({ navigation: { state: 'cancelling' }, robot: { mode: 'Cancelling' } }, 'navigation-cancel');
    }
  ));

  $('#togglePassword').addEventListener('click', () => {
    const input = $('#settingsPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
    $('#togglePassword').textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
  $('#passwordForm').addEventListener('submit', event => {
    event.preventDefault();
    if ($('#settingsPassword').value !== 'admin_amr') {
      $('#passwordError').textContent = 'Incorrect password. Please try again.';
      $('#settingsPassword').select();
      return;
    }
    $('#settingsDialog').close();
    setView('settings');
  });
  $('#closeSettings').addEventListener('click', () => setView('home'));

  const configDefinitions = {
    fleet: { title: 'Fleet Task Configuration', description: 'Choose the Fleet task operators can start from the home screen.', fields: '<div class="config-field"><label for="fleetTask">FLEET TASK</label><select id="fleetTask" name="fleetTask"><option value="standard-cleaning">Standard Cleaning</option><option value="deep-cleaning">Deep Cleaning</option><option value="inspection">Inspection Route</option></select></div><div class="config-field"><label for="fleetLabel">OPERATOR LABEL</label><input id="fleetLabel" name="fleetLabel" value="Fleet Tasks"></div>' },
    standby: { title: 'Standby Point', description: 'Set the default destination used by Return to Standby.', fields: '<div class="config-field"><label for="standbyPoint">POINT</label><select id="standbyPoint" name="standbyPoint"><option>HR775</option><option>LM45</option><option>ST01</option></select></div><div class="config-field"><label for="standbyLabel">OPERATOR LABEL</label><input id="standbyLabel" name="standbyLabel" value="Main Standby"></div>' },
    charge: { title: 'Charging Point', description: 'Set the charging destination used by Go Charge.', fields: '<div class="config-field"><label for="chargePoint">POINT</label><select id="chargePoint" name="chargePoint"><option>CP1</option><option>CP2</option></select></div><div class="config-field"><label for="chargeLabel">OPERATOR LABEL</label><input id="chargeLabel" name="chargeLabel" value="Main Charger"></div>' },
    points: { title: 'Visible Points', description: 'Only selected points and their operator labels appear in Go to Point.', fields: '<div class="point-row"><input type="checkbox" name="point" value="LM47" checked><strong>LM47</strong><input name="label_LM47" type="text" value="Main Lobby" aria-label="LM47 operator label"></div><div class="point-row"><input type="checkbox" name="point" value="LM52" checked><strong>LM52</strong><input name="label_LM52" type="text" value="East Corridor" aria-label="LM52 operator label"></div><div class="point-row"><input type="checkbox" name="point" value="HR775" checked><strong>HR775</strong><input name="label_HR775" type="text" value="Service Area" aria-label="HR775 operator label"></div><div class="point-row"><input type="checkbox" name="point" value="ST01" checked><strong>ST01</strong><input name="label_ST01" type="text" value="Storage Room" aria-label="ST01 operator label"></div>' }
  };

  $$('[data-config]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.config;
    const config = configDefinitions[key];
    const dialog = $('#configDialog');
    dialog.dataset.config = key;
    $('#configTitle').textContent = config.title;
    $('#configDescription').textContent = config.description;
    $('#configFields').innerHTML = config.fields;
    $('#configFeedback').textContent = '';
    dialog.showModal();
  }));
  $('#configForm').addEventListener('submit', event => {
    event.preventDefault();
    const dialog = $('#configDialog');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    sendEdge('settings/save', { section: dialog.dataset.config, values });
    $('#configFeedback').textContent = 'Saving changes…';
  });

  function normalizedRobotPatch(topic, payload) {
    if (topic === 'battery') return { battery: Number(payload && typeof payload === 'object' ? payload.battery_pct ?? payload.battery : payload) };
    if (topic === 'poi') return { currentPoi: String(payload || '—') };
    if (topic === 'status') return { mode: String(payload && payload.mode || payload || 'unknown') };
    if (topic === 'robotName') return { name: String(payload || state.robot.name) };
    return null;
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
      return;
    }

    const robotPatch = normalizedRobotPatch(topic, payload);
    if (robotPatch) { store.patch({ robot: robotPatch }, 'legacy-' + topic); return; }
    if (topic === 'nav/started' || topic === 'nav/progress') {
      const destination = payload && (payload.target || payload.destination || payload.poi) || state.navigation.destination;
      store.patch({ navigation: { state: 'running', destination }, robot: { mode: 'Moving' } }, topic);
      $('#movingTitle').textContent = 'Moving to ' + (destination || 'destination');
      setView('moving', { persist: false });
      return;
    }
    if (topic === 'nav/paused') { store.patch({ navigation: { state: 'paused' }, robot: { mode: 'Paused' } }, topic); setView('paused', { persist: false }); return; }
    if (topic === 'nav/resumed') { store.patch({ navigation: { state: 'running' }, robot: { mode: 'Moving' } }, topic); setView('moving', { persist: false }); return; }
    if (topic === 'nav/arrived' || topic === 'nav/cancelled') {
      const currentPoi = payload && (payload.target || payload.destination || payload.poi) || state.robot.currentPoi;
      store.patch({ navigation: { state: 'idle', destination: null }, robot: { mode: 'Idle', currentPoi }, task: null }, topic);
      $('#taskRoute').hidden = true;
      setView('home', { persist: false });
      return;
    }
    if (topic === 'config/saved') {
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
