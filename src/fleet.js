(function () {
  'use strict';

  const fleetState = {
    connection: 'syncing',
    taskState: 'syncing',
    revision: 0,
    lastUpdate: null,
    task: null,
    pendingCommandId: null,
    syncTimer: null
  };

  const $fleet = selector => document.querySelector(selector);
  const text = (value, fallback = '—') => value === undefined || value === null || value === '' ? fallback : String(value);
  const cleanState = value => String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const terminalStates = new Set(['completed', 'failed', 'cancelled', 'canceled']);

  function nowLabel(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function commandId(action) {
    return 'ui-' + action + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function sendFleetCommand(action, params = {}) {
    const id = commandId(action);
    const message = {
      topic: 'fleet/command/request',
      payload: {
        command_id: id,
        action,
        task_id: fleetState.task && fleetState.task.id || null,
        expected_revision: fleetState.revision,
        params,
        created_at: new Date().toISOString()
      }
    };
    if (window.uibuilder && typeof window.uibuilder.send === 'function') window.uibuilder.send(message);
    else console.info('[Fleet UI demo]', message);
    return id;
  }

  function setConnection(connection) {
    const normalized = cleanState(connection) || 'offline';
    fleetState.connection = normalized;
    const chip = $fleet('#fleetPageConnection');
    const value = $fleet('#fleetLinkValue');
    chip.className = 'fleet-connection ' + normalized;
    if (normalized === 'online') { chip.innerHTML = '<i></i>Fleet Online'; value.textContent = 'Online'; }
    else if (normalized === 'syncing' || normalized === 'resyncing') { chip.innerHTML = '<i></i>Synchronizing'; value.textContent = 'Synchronizing'; }
    else { chip.innerHTML = '<i></i>Fleet Offline'; value.textContent = 'Offline'; }
  }

  function permissionsFor(state) {
    const online = fleetState.connection === 'online';
    return {
      canStart: online && ['available', 'ready'].includes(state),
      canCancel: online && ['accepted', 'running', 'paused', 'waiting'].includes(state)
    };
  }

  function renderFleetState() {
    const state = cleanState(fleetState.taskState);
    const task = fleetState.task;
    const hasTask = !!task && !['idle', 'empty', 'no_task', 'syncing'].includes(state);
    const permissions = permissionsFor(state);
    const heading = $fleet('#fleetTaskHeading');
    const message = $fleet('#fleetTaskMessage');
    const badge = $fleet('#fleetTaskBadge');
    const card = $fleet('#fleetTaskCard');
    const empty = $fleet('#fleetEmptyState');
    const primary = $fleet('#fleetPrimaryAction');
    const cancel = $fleet('#fleetCancelAction');

    card.hidden = !hasTask;
    empty.hidden = hasTask || !['idle', 'empty', 'no_task'].includes(state);
    badge.className = 'fleet-task-badge ' + state;
    badge.textContent = state.replace(/_/g, ' ').toUpperCase();

    if (state === 'syncing' || state === 'resyncing') {
      heading.textContent = 'Checking Fleet status'; message.textContent = 'Please wait while the latest task state is restored.';
      primary.textContent = 'Waiting for Status'; primary.disabled = true; cancel.hidden = true;
    } else if (fleetState.connection === 'offline') {
      heading.textContent = hasTask ? text(task.name, 'Task status unknown') : 'Fleet Connection Lost';
      message.textContent = 'The last confirmed state is shown. New Fleet commands are disabled.';
      badge.className = 'fleet-task-badge offline'; badge.textContent = 'OFFLINE'; primary.textContent = 'Fleet Offline'; primary.disabled = true; cancel.hidden = true;
    } else if (['idle', 'empty', 'no_task'].includes(state)) {
      heading.textContent = 'No Task Available'; message.textContent = 'The robot is ready to receive a Fleet assignment.';
      badge.textContent = 'READY'; badge.className = 'fleet-task-badge available'; primary.textContent = 'Check for Task'; primary.disabled = false; cancel.hidden = true;
    } else if (['available', 'ready'].includes(state)) {
      heading.textContent = text(task.name, 'Fleet Task Available'); message.textContent = 'Review the assignment before starting it.';
      primary.textContent = 'Start Task'; primary.disabled = !permissions.canStart; cancel.hidden = true;
    } else if (['submitting', 'pending'].includes(state)) {
      heading.textContent = text(task.name, 'Submitting Fleet Task'); message.textContent = 'Waiting for confirmation from Fleet Management.';
      primary.textContent = 'Submitting…'; primary.disabled = true; cancel.hidden = true;
    } else if (['accepted', 'running', 'paused', 'waiting'].includes(state)) {
      heading.textContent = text(task.name, 'Fleet Task in Progress'); message.textContent = state === 'paused' ? 'Navigation is paused on this robot.' : 'The robot is executing the Fleet assignment.';
      primary.textContent = state === 'paused' ? 'Resume from Task Screen' : 'Task in Progress'; primary.disabled = true; cancel.hidden = !permissions.canCancel;
    } else if (terminalStates.has(state)) {
      heading.textContent = state === 'completed' ? 'Task Completed' : state === 'failed' ? 'Task Failed' : 'Task Cancelled';
      message.textContent = state === 'failed' ? text(task && task.error, 'Fleet reported that the task could not be completed.') : 'Waiting for the next Fleet assignment.';
      primary.textContent = 'Check for Next Task'; primary.disabled = false; cancel.hidden = true;
    }

    if (hasTask) {
      const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
      $fleet('#fleetTaskName').textContent = text(task.name, 'Fleet Task');
      $fleet('#fleetTaskType').textContent = text(task.type, 'FLEET TASK').toUpperCase();
      $fleet('#fleetTaskDetail').textContent = text(task.detail, 'Assigned by Fleet Management');
      $fleet('#fleetTaskId').textContent = text(task.id);
      $fleet('#fleetTaskStep').textContent = text(task.currentStep);
      $fleet('#fleetTaskDestination').textContent = text(task.destination);
      $fleet('#fleetProgressText').textContent = progress + '%';
      $fleet('#fleetProgressFill').style.width = progress + '%';
    }

    $fleet('#fleetLastUpdate').textContent = nowLabel(fleetState.lastUpdate);
    $fleet('#fleetRobotMode').textContent = ['running', 'accepted', 'waiting'].includes(state) ? 'Executing Fleet task' : state === 'paused' ? 'Task paused' : 'Ready for task';
  }

  function applyFleetSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const incomingRevision = Number(snapshot.revision || 0);
    if (incomingRevision && incomingRevision < fleetState.revision) return;
    if (incomingRevision) fleetState.revision = incomingRevision;
    setConnection(snapshot.connection && snapshot.connection.fleet || snapshot.connection || 'online');
    fleetState.task = snapshot.task || null;
    fleetState.taskState = cleanState(snapshot.task && snapshot.task.state || snapshot.taskState || (snapshot.task ? 'available' : 'idle'));
    fleetState.lastUpdate = snapshot.updatedAt || snapshot.updated_at || new Date().toISOString();
    fleetState.pendingCommandId = null;
    clearTimeout(fleetState.syncTimer);
    if (snapshot.robot && snapshot.robot.currentPoi) $fleet('#fleetCurrentPoi').textContent = snapshot.robot.currentPoi;
    renderFleetState();
  }

  function applyLegacyProgress(payload) {
    if (!payload || typeof payload !== 'object') return;
    const steps = Array.isArray(payload.subjobs) ? payload.subjobs : [];
    const current = payload.currentSubjob || payload.current_subjob || {};
    const order = Number(current.order || current.sequence || 0);
    const progress = steps.length ? Math.round(Math.max(0, order - 1) / steps.length * 100) : 0;
    applyFleetSnapshot({
      revision: fleetState.revision + 1,
      connection: 'online',
      updatedAt: new Date().toISOString(),
      robot: { currentPoi: $fleet('#currentPoi') && $fleet('#currentPoi').textContent },
      task: payload.active === false ? null : { id: payload.job && payload.job.id, name: payload.job && payload.job.name, state: 'running', type: 'Fleet Task', currentStep: current.name, destination: current.destination || current.poi, progress }
    });
  }

  function requestFleetState() {
    setConnection('syncing');
    fleetState.taskState = 'syncing';
    renderFleetState();
    sendFleetCommand('sync');
    clearTimeout(fleetState.syncTimer);
    fleetState.syncTimer = setTimeout(() => {
      if (fleetState.taskState !== 'syncing') return;
      setConnection('offline');
      fleetState.taskState = fleetState.task ? fleetState.task.state : 'idle';
      renderFleetState();
    }, 8000);
  }

  window.openFleetTasks = function () { window.setView('fleet'); requestFleetState(); };
  window.applyFleetSnapshot = applyFleetSnapshot;

  $fleet('#fleetBack').addEventListener('click', () => window.setView('home'));
  $fleet('#fleetRetry').addEventListener('click', requestFleetState);
  $fleet('#fleetPrimaryAction').addEventListener('click', () => {
    if (['idle', 'empty', 'no_task', 'completed', 'failed', 'cancelled'].includes(cleanState(fleetState.taskState))) return requestFleetState();
    if (!permissionsFor(cleanState(fleetState.taskState)).canStart || fleetState.pendingCommandId) return;
    fleetState.pendingCommandId = sendFleetCommand('start'); fleetState.taskState = 'submitting'; renderFleetState();
  });
  $fleet('#fleetCancelAction').addEventListener('click', () => {
    const dialog = $fleet('#confirmDialog');
    $fleet('#dialogTitle').textContent = 'Cancel Fleet Task?';
    $fleet('#dialogText').textContent = 'The robot will stop the current Fleet assignment. This action requires confirmation.';
    $fleet('#dialogConfirm').textContent = 'Confirm Cancel';
    dialog.returnValue = ''; dialog.showModal();
    dialog.addEventListener('close', function done() { dialog.removeEventListener('close', done); if (dialog.returnValue === 'confirm') { fleetState.pendingCommandId = sendFleetCommand('cancel'); fleetState.taskState = 'pending'; renderFleetState(); } });
  });

  window.addEventListener('online', requestFleetState);
  window.addEventListener('offline', () => { setConnection('offline'); renderFleetState(); });

  window.handleFleetMessage = function (msg) {
    if (!msg) return false;
    const topic = msg.topic;
    const payload = msg.payload;
    if (topic === 'fleet/task-snapshot' || topic === 'fleet/state') { applyFleetSnapshot(payload); return true; }
    if (topic === 'fleet/job-progress') { applyLegacyProgress(payload); return true; }
    if (topic === 'enqueue/success') { requestFleetState(); return true; }
    if (topic === 'enqueue/error' || topic === 'fleet/cancel/failed') { setConnection('online'); fleetState.taskState = 'failed'; fleetState.task = Object.assign({}, fleetState.task, { error: payload && (payload.message || payload.error) }); fleetState.lastUpdate = new Date().toISOString(); renderFleetState(); return true; }
    if (topic === 'poi/cancelled' || topic === 'nav/cancelled') { applyFleetSnapshot({ revision: fleetState.revision + 1, connection: 'online', task: null, taskState: 'cancelled', updatedAt: new Date().toISOString() }); return true; }
    return false;
  };
})();
