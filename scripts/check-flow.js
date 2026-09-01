'use strict';

const fs = require('fs');
const path = require('path');
const flowPath = path.join(__dirname, '..', 'node-red', 'adam_flows.json');
const nodes = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
const ids = new Set();

for (const node of nodes) {
  if (!node.id) throw new Error(`Node without ID: ${node.type || 'unknown'}`);
  if (ids.has(node.id)) throw new Error(`Duplicate node ID: ${node.id}`);
  ids.add(node.id);
  if (node.type === 'function') new Function('msg', 'flow', 'global', 'node', 'context', node.func);
}
for (const node of nodes) {
  for (const group of node.wires || []) for (const target of group) {
    if (!ids.has(target)) throw new Error(`Missing wire target ${target} from ${node.id}`);
  }
  for (const target of node.links || []) {
    if (!ids.has(target)) throw new Error(`Missing link target ${target} from ${node.id}`);
  }
}

const requiredIds = ['65bcae3e8cd99339', '3db9db3f2fb9d28a', 'enq_link_accept', 'poi_cancel_ui_fn', 'v2_compat_command_adapter', 'v2_compat_client_event', 'v2_compat_state_manager'];
for (const id of requiredIds) if (!ids.has(id)) throw new Error(`Required compatibility or baseline node missing: ${id}`);

const memory = {};
const flowContext = { get: key => memory[key], set: (key, value) => { memory[key] = value; } };
const globalContext = {
  data: { current_status: 'idle', current_poi: 'LM45', cfg: { standbyPoi: 'HR775', chargePoi: 'CP1' } },
  get(key) { return this.data[key]; },
  set(key, value) { this.data[key] = value; }
};
const adapterNode = nodes.find(node => node.id === 'v2_compat_command_adapter');
const adapter = new Function('msg', 'flow', 'global', 'node', 'context', adapterNode.func);

let output = adapter({ topic: 'edge/command/request', payload: { request_id: 'test-navigation', action: 'navigate', params: { target: 'LM47' } } }, flowContext, globalContext, {}, {});
if (!output[0] || !output[1] || output[0].topic !== 'nav' || output[0].payload.point !== 'LM47') throw new Error('V2 navigation compatibility route failed');

output = adapter({ topic: 'edge/command/request', payload: { request_id: 'test-navigation', action: 'navigate', params: { target: 'LM47' } } }, flowContext, globalContext, {}, {});
if (output[0] || !output[1] || output[1].topic !== 'v2/command/duplicate') throw new Error('Duplicate V2 command was executed twice');

output = adapter({ topic: 'fleet/command/request', payload: { command_id: 'test-fleet-start', action: 'start' } }, flowContext, globalContext, {}, {});
if (!output[2] || Object.keys(output[2].payload).length !== 0) throw new Error('Fleet start did not enter the existing accept path cleanly');

const stateNode = nodes.find(node => node.id === 'v2_compat_state_manager');
const reduceState = new Function('msg', 'flow', 'global', 'node', 'context', stateNode.func);
output = reduceState({ topic: 'battery', payload: { battery_pct: 76 } }, flowContext, globalContext, {}, {});
const snapshot = output[0].find(message => message.topic === 'ui/state/snapshot');
if (!snapshot || snapshot.payload.robot.battery !== 76 || snapshot.payload.robot.currentPoi !== 'LM45') throw new Error('V2 state snapshot aggregation failed');

console.log(`adam_flows V2 compatibility check passed (${nodes.length} nodes).`);

