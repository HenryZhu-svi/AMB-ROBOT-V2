(function () {
  'use strict';
  const store = window.AMRStore, transport = window.AMRTransport;
  const $ = selector => document.querySelector(selector);
  let wait = null, occupied = null, pages = [], page = null, pending = null, estop = false;
  let robotAt = 0, fleetAt = 0, chargeAt = 0;
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog workflow-dialog';
  dialog.innerHTML = '<h2 id="workflowTitle"></h2><div class="workflow-meta" id="workflowMeta"></div><p id="workflowDetail"></p><div id="workflowCountdown" class="workflow-countdown" hidden></div><div id="workflowChoices"></div><p id="workflowFeedback" role="status"></p><div class="workflow-actions"><button id="workflowBack" class="secondary">Close</button><button id="workflowCancel" class="secondary">Cancel Task</button><button id="workflowReady" class="primary">Ready</button></div>';
  document.body.appendChild(dialog);
  const banner = document.createElement('aside');
  banner.className = 'live-banner'; banner.hidden = true; banner.setAttribute('role','status');
  $('#app').prepend(banner);
  const configKey = p => p.sourceProjectId ? 'project:' + p.sourceProjectId + ':page:' + p.id : 'page:' + p.id;
  const fresh = at => !!at && Date.now() - at < 20000;
  function feedback(text) { $('#workflowFeedback').textContent = text; }
  function track(action, result) {
    if (!result.sent) { feedback('Not sent: local control is offline.'); return false; }
    pending = {action,id:result.id,at:Date.now()};
    feedback('Request sent. Waiting for confirmation…');
    renderLive(); return true;
  }
  function resolve() { if(pending) store.resolveCommand(pending.id); pending = null; feedback(''); }
  function send(action, topic, payload) { if (pending) return; track(action,transport.send(topic,payload)); }
  function open() { if(!dialog.open) dialog.showModal(); }
  function showWait() {
    if(!wait) return;
    page = null;
    $('#workflowTitle').textContent = wait.title || 'Waiting for Operator';
    $('#workflowDetail').textContent = wait.detail || wait.message || 'Press Ready to continue this Fleet step.';
    const task=store.getState().task;
    $('#workflowMeta').textContent = [task?.name ? 'Task: '+task.name : '',wait.target ? 'Point: '+wait.target : ''].filter(Boolean).join(' · ');
    $('#workflowCountdown').hidden=false;
    $('#workflowChoices').replaceChildren();
    $('#workflowReady').hidden = false; $('#workflowReady').textContent = wait.buttonText || 'Ready';
    $('#workflowCancel').hidden = false; $('#workflowBack').hidden = true;
    open(); renderLive();
  }
  function showOccupied() {
    page = null;
    $('#workflowMeta').textContent='';$('#workflowCountdown').hidden=true;
    $('#workflowTitle').textContent = 'Waiting for Destination';
    $('#workflowDetail').textContent = (occupied.poi || 'Destination') + (occupied.occupied_by ? ' is occupied by ' + occupied.occupied_by : ' is occupied') + '. The controller will retry automatically.';
    $('#workflowChoices').replaceChildren(); $('#workflowReady').hidden = true; $('#workflowCancel').hidden = false; $('#workflowBack').hidden = true; open();
  }
  function showPage(raw) {
    if (wait || occupied) return;
    const key = String(raw.pageKey || raw.pageId || raw.page || raw.id || '');
    const matches = pages.filter(p => configKey(p) === key || String(p.id) === key);
    if (![raw.destinations,raw.points,raw.pois,raw.options,raw.buttons].some(Array.isArray) && matches.length !== 1) { banner.textContent = 'Fleet selection is missing or ambiguous. Reload Fleet configuration.'; banner.hidden = false; return; }
    page = {...(matches[0] || {}), ...raw};
    $('#workflowMeta').textContent='';$('#workflowCountdown').hidden=true;
    $('#workflowTitle').textContent = page.title || 'Select Next Task';
    $('#workflowDetail').textContent = page.detail || 'Choose the next step requested by Fleet.';
    $('#workflowChoices').replaceChildren();
    $('#workflowReady').hidden = true; $('#workflowCancel').hidden = true; $('#workflowBack').hidden = false;
    const options = page.sourceType==='poi' ? (store.getState().config.visiblePoints || []).map(p=>({point:p.id,label:p.label})) : page.destinations || page.points || page.pois || page.options || page.buttons || [];
    options.forEach(item => {
      const obj = typeof item === 'object' ? item : {point:String(item)};
      const value = obj.value || obj.point || obj.destination || obj.poi || obj.name || obj.id;
      if (!value) return;
      const button = document.createElement('button'); button.className = 'secondary';
      const label=obj.label || obj.title || String(value);
      const material=page.materialByDestination?.[value] || obj.material || [];
      const heading=document.createElement('strong');heading.textContent=label;button.append(heading);
      const detail=document.createElement('small');detail.textContent=[typeof obj.detail==='string'?obj.detail:'',...material.filter(m=>m?.name).map(m=>m.name+(m.qty!=null?' × '+m.qty:''))].filter(Boolean).join(' · ');button.append(detail);
      button.onclick = () => {
        if (pending || transport.getStatus() !== 'online' || !fresh(fleetAt)) return;
        const selectedPage = page;
        const topic = selectedPage.selectTopic || 'nav';
        if (!['nav','enqueue'].includes(topic)) { feedback('Unsupported Fleet option: ' + topic); return; }
        window.confirmAction(topic === 'enqueue' ? 'Submit Fleet Selection?' : 'Navigate to Point?', label, 'Confirm', () => {
          const payload = {...(selectedPage.basePayload || {}),...(obj.payload || {}),page:selectedPage.id,pageId:selectedPage.id,point:value,target:value,destination:value,label,material};
          send(topic,topic,payload);
        });
      };
      $('#workflowChoices').append(button);
    });
    feedback(options.length ? '' : 'No options are configured.'); open(); renderLive();
  }
  function renderPages() {
    let container = $('#fleetPageOptions');
    if(!container) { container = document.createElement('section'); container.id = 'fleetPageOptions'; container.className = 'fleet-page-options'; $('#fleetView').append(container); }
    container.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Configured Fleet Options'; container.append(heading);
    const selected = store.getState().config.fleetPages;
    const visible = pages.filter(p => !Array.isArray(selected) || selected.includes(configKey(p)));
    if(!visible.length) { const text = document.createElement('p'); text.textContent = 'No Fleet options enabled. Check configuration.'; container.append(text); }
    visible.forEach(p => { const button = document.createElement('button'); button.className = 'secondary'; button.textContent = p.title || p.id; button.onclick = () => showPage({...p,pageId:p.id}); container.append(button); });
  }
  $('#workflowReady').onclick = () => { if(wait) send('ready','wait/control/ready',{waitId:wait.waitId,target:wait.target,poi:wait.poi,auto:false}); };
  $('#workflowCancel').onclick = () => window.confirmAction('Cancel Current Task?', 'Cancel the current waiting task?', 'Confirm Cancel', () => {
    if(wait) send('cancel-wait','wait/control/cancel',{waitId:wait.waitId,target:wait.target});
    else if(occupied) send('cancel','cancel',{point:occupied.poi,reason:'poi-occupied'});
  });
  $('#workflowBack').onclick = () => { if(!pending) {dialog.close();page=null;} };
  dialog.addEventListener('cancel', event => { if(wait || occupied || pending) event.preventDefault(); });
  function renderLive() {
    const state = store.getState();
    const online = transport.getStatus() === 'online';
    ['charge','standby','point'].forEach(action=>{ const config=state.config; const configured=action==='charge'?config.chargingPoint:action==='standby'?config.standbyPoint:config.visiblePoints?.length; $('[data-action="'+action+'"]').disabled=!online || !configured || !window.AMRWorkflow?.canNavigate(); });
    $('#fleetCurrentPoi').textContent = state.robot.currentPoi || '—';
    const charge = state.robot.charging;
    const text = [!online ? 'Local control offline' : '', !fresh(robotAt) ? 'Robot status unavailable or stale' : '', estop ? 'EMERGENCY STOP ACTIVE' : '', charge === true ? (fresh(chargeAt) ? 'Robot is charging' : 'Last charging status is stale') : ''].filter(Boolean).join(' · ');
    banner.textContent = text; banner.hidden = !text;
    $('#resumeButton').disabled = !online || !fresh(robotAt) || estop || state.navigation.state !== 'paused';
    $('#cancelButton').disabled = !online || !!pending;
    const paused = $('.paused-face small'); if(paused) paused.textContent = String(state.navigation.state || 'unknown').toUpperCase();
    $('#pausedTaskName').textContent = state.task?.name || 'Navigation';
    $('#pausedTo').textContent = state.navigation.destination || '—';
    $('#pausedAction').textContent = state.navigation.destination ? 'Go to '+state.navigation.destination : 'Waiting for destination';
    $('#pausedFleetConnection').textContent = fresh(fleetAt) && online ? state.connection.fleet : 'Status unavailable';
    $('#movingTitle').textContent = state.navigation.destination ? 'Destination: '+state.navigation.destination : 'Waiting for destination';
    $('#movingTaskName').textContent = state.task?.name ? 'Task: '+state.task.name : '';
    $('#pausedFrom').textContent = state.navigation.from || state.robot.currentPoi || '—';
    $('#workflowReady').disabled = !online || !!pending || estop;
    $('#workflowCancel').disabled = !online || !!pending;
    $('#workflowChoices').querySelectorAll('button').forEach(b => {b.disabled = !online || !fresh(fleetAt) || !!pending || estop;});
    if(wait) {
      const deadline=Date.parse(wait.deadlineAt || '');
      const seconds = Math.max(0,Math.ceil((deadline-Date.now())/1000));
      $('#workflowCountdown').textContent = wait.indefinite ? 'Operator confirmation required — no automatic timeout' : !Number.isFinite(deadline) ? 'Waiting for controller timing information' : seconds ? 'Continue now, or automatically in '+seconds+'s' : 'Maximum wait reached — awaiting controller confirmation';
      if(!online)$('#workflowCountdown').textContent += ' · UI disconnected; controller owns the timer';
    }
    const values = [online?'Connected':'Offline',fresh(robotAt)?state.robot.mode:'Status unavailable',fresh(fleetAt)?state.connection.fleet:'Status unavailable',state.robot.currentPoi];
    $('#infoDialog').querySelectorAll('.device-list strong').forEach((el,i)=>{el.textContent=values[i] || '—';});
    if(pending && Date.now()-pending.at>15000) { const action=pending.action; resolve(); feedback(action + ': result unknown. Check live status before retrying.'); store.patch({navigation:{state:'unknown'}},'control-timeout'); transport.requestSnapshot('control-timeout'); }
  }
  function receive(msg) {
    const p=msg.payload || {}, t=msg.topic;
    const at=msg._observedAt || Date.now();
    if(['status','robot/runtime','poi','battery'].includes(t)) robotAt=at;
    if(t==='battery') chargeAt=at;
    if(t==='fleet/job-progress') { if(!p.unavailable) fleetAt=at; }
    if(t==='config/pages') {pages=Array.isArray(p)?p:p.pages || [];renderPages();}
    if(['ui/page','ui/assign','page/show','show/page'].includes(t)) showPage(p);
    if(t==='wait/start') { if(!p.waitId) {feedback('Invalid wait request: missing wait ID');return;} if(wait?.waitId !== p.waitId) resolve(); wait=p;showWait(); }
    if(['wait/done','wait/cancelled'].includes(t) && wait && p.waitId===wait.waitId) {wait=null;resolve();dialog.close();const nav=store.getState().navigation.state;window.setView(nav==='paused'?'paused':['running','waiting'].includes(nav)?'moving':'home');}
    if(t==='poi/waiting') {occupied=p;showOccupied();}
    if(['poi/available','poi/cancelled'].includes(t)) {occupied=null;if(!wait){dialog.close();} }
    if(t==='enqueue/success') {resolve();page=null;dialog.close();transport.requestSnapshot('enqueue-success');}
    if(['enqueue/error','cancel/failed','ui/control/error'].includes(t)) {resolve();feedback(p.error || 'Request failed');store.patch({navigation:{state:'unknown'}},'control-failure');}
    if(t==='ui/control/accepted' && pending && p.request_id===pending.id) {
      if(p.accepted===false) {const action=pending.action;resolve();feedback(action+': '+(p.message || 'Gateway rejected the request'));}
      else feedback((p.action || pending.action)+' accepted by gateway. Waiting for robot confirmation…');
    }
    if(t==='nav/progress' || t==='nav/started') {
      if(pending && ((pending.action==='pause' && (p.mode==='suspended' || p.is_suspended)) || (['navigate','nav','resume'].includes(pending.action) && p.mode==='running'))) resolve();
      if(page) {page=null;dialog.close();}
    }
    if(['nav/arrived','nav/cancelled'].includes(t)) resolve();
    if(t==='status' && !msg._replay) {
      const mode=String(p.mode || p).toLowerCase();
      if(['suspended','paused'].includes(mode) && ['running','waiting','pausing','resuming'].includes(store.getState().navigation.state)) {store.patch({navigation:{state:'paused'}},'pause-confirmed');if(pending?.action==='pause')resolve();window.setView('paused');}
      if(['running','moving'].includes(mode) && store.getState().navigation.state==='resuming') {resolve();store.patch({navigation:{state:'running'}},'resume-confirmed');window.setView('moving');}
    }
    if(t==='robot/runtime' && !msg._replay) {
      const mode=String(p.mode || '').toLowerCase();
      if(mode==='suspended' && pending?.action==='pause') resolve();
      if(['running','waiting'].includes(mode) && pending?.action==='resume') resolve();
    }
    if(['estop','estop/status'].includes(t)) {
      let data=p; try {if(p.message) data=typeof p.message==='string'?JSON.parse(p.message):p.message;} catch(_) {}
      estop=typeof p.is_estop==='boolean'?p.is_estop:!!(data.emergency || data.driver_emc || data.electric);
    }
    if(t==='ui/runtime/restored') store.patch({ui:{restoring:false}},'restored');
    renderLive();
  }
  window.AMRWorkflow={track,renderPages,getPages:()=>pages,configKey,canNavigate:()=>fresh(robotAt) && !estop && !window.AMRAlerts?.hasError() && !wait && !occupied && !pending && !store.getState().robot.charging && !store.getState().task && ['idle','none'].includes(String(store.getState().robot.mode).toLowerCase())};
  transport.subscribe(receive);
  transport.onStatus(status=>{ if(status!=='online'){robotAt=0;fleetAt=0;}renderLive();});
  store.subscribe(()=>{renderLive();});
  setInterval(()=>{renderLive(); if(!fresh(fleetAt) && store.getState().connection.fleet==='online') store.patch({connection:{fleet:'offline'}},'fleet-stale');},1000);
  renderLive();
})();
