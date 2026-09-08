// Cache only resumable UI state, not commands or command acknowledgements.
const cache = flow.get('site_ui_cache') || {};
const topic = msg.topic;
if ((topic === 'wait/done' || topic === 'wait/cancelled') && (!msg.payload?.waitId || msg.payload.waitId === cache['wait/start']?.payload?.waitId)) delete cache['wait/start'];
if (topic === 'poi/available' || topic === 'poi/cancelled') delete cache['poi/waiting'];
if (['enqueue/success','nav/started','wait/start','wait/done','wait/cancelled','nav/cancelled','poi/cancelled'].includes(topic)) delete cache['ui/page'];
if (['nav/arrived','nav/cancelled','nav/error','wait/start'].includes(topic)) {delete cache['nav/progress'];delete cache['destination'];}
const allowed = ['battery','poi','status','robot/runtime','robotName','wifi','robot/error','error/status','alarm/status','estop','estop/status','config/pages','config/robot','config/conn','fleet/job-progress','ui/page','wait/start','poi/waiting','nav/progress','destination'];
if (allowed.includes(topic)) cache[topic] = { topic, payload:msg.payload, _observedAt:Date.now() };
flow.set('site_ui_cache', cache);
return { ...msg, _observedAt:Date.now() };
