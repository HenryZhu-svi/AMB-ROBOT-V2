'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../node-red/settings-service.js'), 'utf8');
const run = new Function('msg', 'global', 'flow', 'env', source);
const files = new Map(), globals = new Map([['cfg', { standbyPoi:'OLD' }]]);
let fail = false;
globals.set('fs', {
  readFileSync(file) { if (!files.has(file)) throw Object.assign(new Error('missing'), {code:'ENOENT'}); return files.get(file); },
  writeFileSync(file, value) { if (fail) throw new Error('disk full'); files.set(file, value); },
  renameSync(a,b) { files.set(b, files.get(a)); files.delete(a); }
});
const g = {get:key=>globals.get(key),set:(key,value)=>globals.set(key,value)};
const flow = {get:()=>({points:[{id:'P1'},{id:'P2'}],at:Date.now()})};
const env = {get:key=>key==='HOME'?'/test':undefined};
const call = (topic, payload={}) => run({topic,payload},g,flow,env);
assert.equal(call('ui/settings/request').payload.config.standbyPoint,'OLD');
let result = call('ui/settings/save',{revision:0,section:'points',values:{points:[{id:'P1',label:'Lobby'},{id:'P2',label:'Store'}]}});
assert.equal(result.topic,'ui/settings/saved');
assert.equal(result.payload.config.visiblePoints.length,2);
assert.equal(call('ui/settings/request').payload.config.visiblePoints[0].label,'Lobby');
assert.equal(call('ui/settings/save',{revision:0}).topic,'ui/settings/error');
assert.equal(call('ui/settings/save',{revision:1,section:'standby',values:{standbyPoint:'INVALID'}}).topic,'ui/settings/error');
globals.set('fleet_getjob_pages',[{id:'A',sourceProjectId:'P'}]);
assert.equal(call('ui/settings/save',{revision:1,section:'fleet',values:{pages:['wrong']}}).topic,'ui/settings/error');
assert.equal(call('ui/settings/save',{revision:1,section:'fleet',values:{pages:['project:P:page:A']}}).topic,'ui/settings/saved');
assert.deepEqual(call('ui/settings/request').payload.config.fleetPages,['project:P:page:A']);
fail=true;
assert.equal(call('ui/settings/save',{revision:2,section:'standby',values:{standbyPoint:'P1'}}).topic,'ui/settings/error');
assert.equal(call('ui/settings/request').payload.revision,2);
globals.delete('fs');
assert.equal(call('ui/settings/request').topic,'ui/settings/error');
const html = fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
assert(!html.includes('standard-cleaning'));
assert(!html.includes('<option>HR775'));
console.log('Settings persistence, conflict, validation and failure tests passed');
