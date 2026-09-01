'use strict';

const fs = require('fs');
const path = require('path');

const flowPath = path.join(__dirname, '..', 'node-red', 'flow.json');
const nodes = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
const ids = new Set(nodes.map(node => node.id));
const externalFleetLinks = new Set(['c21761218db4c6d5', 'ee6ac5bac94adea3']);

for (const node of nodes) {
  if (node.type === 'function') {
    new Function('msg', 'flow', 'global', 'node', 'context', node.func);
  }
  for (const group of node.wires || []) {
    for (const target of group) {
      if (!ids.has(target)) throw new Error(`Missing wire target ${target} from ${node.id}`);
    }
  }
  for (const target of node.links || []) {
    if (!ids.has(target) && !externalFleetLinks.has(target)) {
      throw new Error(`Missing link target ${target} from ${node.id}`);
    }
  }
}

const memory = {};
const flowContext = {
  get: key => memory[key],
  set: (key, value) => { memory[key] = value; }
};
const globalContext = { get: () => '' };
const commandRouter = new Function(
  'msg', 'flow', 'global', 'node', 'context',
  nodes.find(node => node.id === 'v2_command_router').func
);

let output = commandRouter({
  topic: 'edge/command/request',
  payload: { request_id: 'test-command', action: 'navigate', params: { target: 'LM47' } }
}, flowContext, globalContext, {}, {});
if (!output[0] || !output[3] || output[8]) throw new Error('Valid navigation route failed');

output = commandRouter({
  topic: 'edge/command/request',
  payload: { request_id: 'test-command', action: 'navigate', params: { target: 'LM47' } }
}, flowContext, globalContext, {}, {});
if (!output[0] || output[3]) throw new Error('Duplicate command was executed twice');

output = commandRouter({
  topic: 'edge/command/request',
  payload: { request_id: 'invalid-command', action: 'unsupported' }
}, flowContext, globalContext, {}, {});
if (output[0] || !output[8]) throw new Error('Unsupported command was accepted');

const stateReducer = new Function(
  'msg', 'flow', 'global', 'node', 'context',
  nodes.find(node => node.id === 'v2_state_manager').func
);
output = stateReducer(
  { topic: 'v2/robot/poi', payload: { current_poi: 'LM45' } },
  flowContext,
  globalContext,
  {},
  {}
);
const snapshot = output[0].find(message => message.topic === 'ui/state/snapshot');
if (!snapshot || snapshot.payload.robot.currentPoi !== 'LM45' || snapshot.payload.revision !== 1) {
  throw new Error('State snapshot reducer failed');
}

console.log(`Node-RED flow check passed (${nodes.length} nodes).`);

