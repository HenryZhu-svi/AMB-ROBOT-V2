'use strict';
// Mechanical, idempotent transformation of the supplied on-site export.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const output = path.join(root, 'node-red/adam_flows.json');
const nodes = JSON.parse(fs.readFileSync(process.argv[2] || output, 'utf8'));
const ui = nodes.find(n => n.id === 'bf26fc2cb143288b');
if (!ui) throw new Error('Expected the 270-node site export with AMB-ROBOT-V2. Refusing a different baseline.');
const get = id => nodes.find(n => n.id === id);
// The export includes two deleted incoming-link references, not executable outputs.
const acceptLinks = get('b7700b19c63b222a');
acceptLinks.links = acceptLinks.links.filter(id => !['a84f5f43c1701236','9dceae09ce7f9cec'].includes(id) || get(id));
const body = file => fs.readFileSync(path.join(root, 'node-red', file), 'utf8');
function put(n) { const i = nodes.findIndex(x => x.id === n.id); if (i < 0) nodes.push(n); else nodes[i] = n; }
function fn(id, name, func, wires) { put({id,type:'function',z:ui.z,name,func,outputs:wires.length,x:1150,y:1800 + nodes.filter(n=>n.id.startsWith('site_')).length*60,wires}); }
// Intercept original UI-bound wires. Existing business nodes and branches stay intact.
for (const n of nodes.filter(n => !n.id.startsWith('site_'))) {
    if (n.wires) n.wires = n.wires.map(w => w.map(id => id === ui.id ? 'site_ui_cache' : id));
}
const oldTargets = ['edec085aaa25aa9e','a52e8ebc982843cb','ff407b0ec5a0e741','ae67a4efca4c1094','d0e033a32893f0c6','c63c73b2f20591f7'];
ui.wires[0] = ['site_ui_bridge','site_settings'];
fn('site_ui_bridge','V2 to site command protocol',body('site-ui-bridge.js'),[oldTargets,[ui.id],['3551770bf18719be']]);
fn('site_ui_cache','Cache resumable UI state',body('site-ui-cache.js'),[[ui.id]]);
fn('site_settings','Persistent V2 settings',body('settings-service.js'),[[ui.id]]);
put({id:'site_settings_load',type:'inject',z:ui.z,name:'Load V2 settings after startup',props:[{p:'topic',vt:'str'}],topic:'ui/settings/request',once:true,onceDelay:3,repeat:'',x:800,y:1860,wires:[['site_settings']]});
const stations = get('cfc4e67c1f7b0a88');
stations.func = "const points=msg.payload && msg.payload.points; if(!Array.isArray(points)) return null; flow.set('v2_point_catalog',{points,at:Date.now()}); return [{topic:'poi/stations',payload:{points,request_id:msg._pointRequestId || msg.payload.request_id},_socketId:msg._socketId},{payload:JSON.stringify(points,null,2)}];";
// Keep the user's repaired station node/protocol. Do not replace it with another implementation.
fn('site_point_error','Point query failure',"flow.set('v2_point_catalog',null); return {topic:'poi/error',payload:{error:msg.error || 'Point query failed'},_socketId:msg._socketId};",[[ui.id]]);
const station = get('6ce56aab23742991');
if (!station.wires[1].includes('site_point_error')) station.wires[1].push('site_point_error');
fn('site_control_error','Control request failure',"return {topic:'ui/control/error',payload:{request_id:msg.payload && msg.payload.request_id,error:msg.error || 'Control request failed'},_socketId:msg._socketId};",[[ui.id]]);
for (const id of ['e1ee13cff1d10c44','1525637a29f39235']) if (!get(id).wires[1].includes('site_control_error')) get(id).wires[1].push('site_control_error');
const progress = get('c2dc2391f9094d80');
progress.func = progress.func.replace("msg.payload = { active: false }", "msg.payload = (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) ? { unavailable:true, error:'Fleet query failed' } : { active:false }");
// Persist into the actual uibuilder instance. No robot/Fleet endpoints are changed.
for (const n of nodes) {
    if (n.filename) n.filename = n.filename.replaceAll('/uibuilder/AMB-ROBOT/', '/uibuilder/AMB-ROBOT-V2/');
    if (n.func) n.func = n.func.replaceAll('/uibuilder/AMB-ROBOT/', '/uibuilder/AMB-ROBOT-V2/');
}
fs.writeFileSync(output, JSON.stringify(nodes,null,4)+'\n');
console.log('Site flow generated: '+nodes.length+' nodes');
