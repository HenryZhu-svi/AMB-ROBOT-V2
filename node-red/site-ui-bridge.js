// Outputs: legacy command, browser reply, Fleet progress query.
const p = msg.payload || {};
if (['sound','relocate','do_control'].includes(msg.topic)) msg._maintenanceRequestId=p.request_id;
const reply = (topic, payload) => ({ topic, payload, _socketId:msg._socketId });
if (msg.topic === 'ui/state/request') {
    const cache = flow.get('site_ui_cache') || {};
    const messages = Object.values(cache).map(item => ({ ...item, _socketId:msg._socketId, _replay:true }));
    messages.push(reply('ui/runtime/restored', { at:Date.now() }));
    return [{ topic:'config/request', payload:{} }, messages, { payload:{} }];
}
if (msg.topic === 'ui/settings/request' || msg.topic === 'ui/settings/save') return null;
let topic = msg.topic;
let payload = p;
if (topic === 'edge/command/request') {
    const params = p.params || {};
    topic = ({ navigate:'nav', pause:'pause', resume:'resume', cancel:'cancel', charge:'charge' })[p.action];
    if (!topic) return [null, reply('ui/command/ack', { request_id:p.request_id, accepted:false, error:'Unsupported action' }), null];
    payload = { ...params, point:params.target, chargeId:params.target, request_id:p.request_id };
}
if (topic === 'fleet/command/request') {
    if (p.action === 'sync') return [{topic:'config/request',payload:{}}, null, {payload:{}}];
    topic = ({ start:'getjob', cancel:'cancel' })[p.action];
    if (!topic) return null;
    payload = { request_id:p.command_id };
}
const commands = new Set(['nav','pause','resume','cancel','charge','getjob','enqueue','wait/control/ready','wait/control/cancel']);
if (commands.has(topic)) {
    const id = p.request_id || p.command_id;
    if (!id) return [null, reply('ui/command/ack', {accepted:false,error:'Request ID required'}), null];
    const seen = flow.get('site_ui_commands') || {};
    const now = Date.now();
    for (const key of Object.keys(seen)) if (now - seen[key] > 600000) delete seen[key];
    if (seen[id]) return [null, reply('ui/command/ack', {request_id:id,accepted:true,duplicate:true}), null];
    seen[id] = now;
    flow.set('site_ui_commands', seen);
}
return [{ ...msg, topic, payload }, null, null];
