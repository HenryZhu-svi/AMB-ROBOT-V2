(function () {
  'use strict';
  const store = window.AMRStore, transport = window.AMRTransport;
  const $ = selector => document.querySelector(selector);
  let catalog = [], ready = false, request = null, timer = null, saving = null;
  let config = {}, revision = 0;
  let draft = null;
  const style = document.createElement('style');
  style.textContent = '#configFields [data-search][hidden]{display:none!important}';
  document.head.appendChild(style);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const titles = { standby:'Standby Point', charge:'Charging Point', points:'Visible Points', fleet:'Fleet Task Configuration' };
  const points = () => Array.isArray(config.visiblePoints) ? config.visiblePoints : config.visiblePoints?.points || [];
  function feedback(message) { $('#configFeedback').textContent = message; }
  function renderSummary() {
    $('[data-config="standby"] > b').textContent = config.standbyPoint || 'Not set';
    $('[data-config="charge"] > b').textContent = config.chargingPoint || 'Not set';
    $('[data-config="points"] > b').textContent = points().length;
    $('.settings-footer strong').textContent = config.savedAt ? 'Last saved: ' + new Date(config.savedAt).toLocaleString('en-GB') : 'Not saved yet';
    $('.settings-footer > span:nth-child(2)').textContent = transport.getStatus() === 'online' ? (ready ? catalog.length + ' map points loaded' : 'Point catalog not loaded') : 'Local control offline';
  }
  function refresh() {
    if ($('#configDialog').open && $('#configDialog').dataset.config !== 'fleet') draft = {section:$('#configDialog').dataset.config, data:[...new FormData($('#configForm')).entries()]};
    ready = false;
    feedback('Loading map points from the wired AMR…');
    renderSummary();
    if (transport.getStatus() !== 'online') { feedback('Local control is offline. Reconnect and retry.'); return; }
    transport.send('ui/settings/request', {}, { track:false });
    request = transport.requestId('points');
    transport.send('poi/fetch', { request_id:request }, { track:false });
    clearTimeout(timer);
    timer = setTimeout(() => { request = null; feedback('Point query timed out. Existing settings are unchanged. Retry to continue.'); }, 15000);
  }
  function renderEditor() {
    const section = $('#configDialog').dataset.config;
    if (!titles[section]) return;
    if (section === 'fleet') {
      const pages = window.AMRWorkflow.getPages();
      $('#configFields').innerHTML = pages.map(page => { const key=window.AMRWorkflow.configKey(page); return '<label class="point-row"><input type="checkbox" name="fleetPage" value="'+escape(key)+'" '+(!Array.isArray(config.fleetPages)||config.fleetPages.includes(key)?'checked':'')+'><strong>'+escape(page.title || page.id)+'</strong><span>'+escape(key)+'</span></label>'; }).join('');
      feedback(pages.length ? 'Select the Fleet menus available from this screen. Active task prompts remain available.' : 'No Fleet page configuration received. Reconnect to Fleet and reload.');
      return;
    }
    const selected = new Map(points().map(p => [p.id, p.label || p.id]));
    const field = section === 'standby' ? 'standbyPoint' : 'chargingPoint';
    const rows = catalog.map(p => {
      const checked = section === 'points' ? selected.has(p.id) : config[field] === p.id;
      return '<label class="point-row" data-search="' + escape((p.id + ' ' + p.name).toLowerCase()) + '"><input type="' + (section === 'points' ? 'checkbox' : 'radio') + '" name="point" value="' + escape(p.id) + '" ' + (checked ? 'checked' : '') + '><strong>' + escape(p.id) + '</strong>' + (section === 'points' ? '<input type="text" name="label_' + escape(p.id) + '" value="' + escape(selected.get(p.id) || p.name || p.id) + '" aria-label="Operator label for ' + escape(p.id) + '">' : '<span>' + escape(p.name || p.id) + '</span>') + '</label>';
    }).join('');
    $('#configFields').innerHTML = '<div class="config-field"><input id="pointSearch" placeholder="Search point ID or name" aria-label="Search points"></div><button type="button" id="reloadPoints" class="secondary">Reload Points</button><div style="max-height:320px;overflow:auto;display:grid;gap:8px">' + rows + '</div>' + (section !== 'points' ? '<div class="config-field"><label>OPERATOR LABEL<input name="operatorLabel" value="' + escape(config[section === 'standby' ? 'standbyLabel' : 'chargingLabel'] || '') + '"></label></div>' : '');
    $('#pointSearch').addEventListener('input', event => {
      $('#configFields').querySelectorAll('[data-search]').forEach(row => { row.hidden = !row.dataset.search.includes(event.target.value.toLowerCase()); });
    });
    $('#reloadPoints').addEventListener('click', refresh);
    if (draft?.section === section) {
      const entries=draft.data;
      $('#configFields').querySelectorAll('input[name]').forEach(input=>{
        if (['checkbox','radio'].includes(input.type)) input.checked=entries.some(([name,value])=>name===input.name && value===input.value);
        else {const entry=entries.find(([name])=>name===input.name);if(entry)input.value=entry[1];}
      });
      draft=null;
    }
    const missing = section === 'points' ? [...selected.keys()].filter(id => !catalog.some(p => p.id === id)) : config[field] && !catalog.some(p => p.id === config[field]) ? [config[field]] : [];
    feedback(!ready ? 'Load the current map before saving.' : missing.length ? 'Saved points missing from current map: ' + missing.join(', ') + '. Review before saving.' : catalog.length ? catalog.length + ' points available' : 'This map contains no points.');
  }
  document.querySelectorAll('[data-config]').forEach(button => button.addEventListener('click', () => {
    draft = null;
    const section = button.dataset.config;
    $('#configDialog').dataset.config = section;
    $('#configTitle').textContent = titles[section] || 'Fleet Task Configuration';
    $('#configDescription').textContent = section === 'points' ? 'Select destinations and set the names operators will see.' : 'Choose a destination from the current robot map.';
    $('#configForm button[value="default"]').disabled = false;
    renderEditor();
    $('#configDialog').showModal();
  }));
  $('#configForm').addEventListener('submit', event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget), section = $('#configDialog').dataset.config;
    if ((section !== 'fleet' && !ready) || transport.getStatus() !== 'online') { feedback('A fresh point catalog and local connection are required.'); return; }
    const ids = data.getAll('point');
    if (!['points','fleet'].includes(section) && !ids.length) { feedback('Select a point.'); return; }
    const values = section === 'fleet' ? {pages:data.getAll('fleetPage')} : section === 'points' ? { points:ids.map(id => ({ id, label:String(data.get('label_' + id) || id).trim() || id })) } : { [section === 'standby' ? 'standbyPoint' : 'chargePoint']:ids[0], label:String(data.get('operatorLabel') || ids[0]).trim() };
    saving = transport.requestId('settings');
    const result = transport.send('ui/settings/save', { request_id:saving, revision, section, values }, { track:false });
    if (!result.sent) { saving = null; feedback('Not sent: local control offline.'); return; }
    feedback('Saving…');
    setTimeout(() => { if (saving === result.id) { saving = null; feedback('Save result unknown. Reload settings before retrying.'); ready = false; } }, 10000);
  });
  transport.subscribe(msg => {
    if (msg.topic === 'poi/stations' && request) {
      if (msg.payload?.request_id && msg.payload.request_id !== request) return;
      clearTimeout(timer); request = null;
      const list = Array.isArray(msg.payload) ? msg.payload : msg.payload?.points;
      if (!Array.isArray(list)) { feedback('Invalid point response. Settings are unchanged.'); return; }
      catalog = list; ready = true; renderSummary();
      if ($('#configDialog').open) renderEditor();
    }
    if (msg.topic === 'poi/error' && request && (!msg.payload?.request_id || msg.payload.request_id === request)) { clearTimeout(timer); request = null; ready = false; feedback(msg.payload?.error || 'Point query failed. Retry to continue.'); }
    if (msg.topic === 'ui/settings/state' || msg.topic === 'ui/settings/saved') {
      config = msg.payload.config; revision = msg.payload.revision;
      store.patch({ config }, 'settings-loaded'); store.persist(); renderSummary();
      window.AMRWorkflow?.renderPages();
      if (msg.topic === 'ui/settings/saved' && msg.payload.request_id === saving) { saving = null; feedback('Settings saved'); $('#configDialog').close(); }
    }
    if (msg.topic === 'ui/settings/error') { saving = null; feedback(msg.payload.error); }
  });
  transport.onStatus(status => { if (status !== 'online') ready = false; renderSummary(); if (status === 'online' && $('#settingsView').classList.contains('is-active')) refresh(); });
  window.AMRSettings = { refresh };
  renderSummary();
})();
