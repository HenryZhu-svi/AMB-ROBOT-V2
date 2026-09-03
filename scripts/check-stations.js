'use strict';
const fs = require('fs'), assert = require('assert/strict'), path = require('path');
const {EventEmitter} = require('events');
const run = new Function('msg','global','env','context','node','Buffer','setTimeout','clearTimeout', fs.readFileSync(path.join(__dirname,'../node-red/direct-stations.js'),'utf8'));
function scenario(body, options = {}) {
  let output, written, deadline, done = 0, socket;
  class Socket extends EventEmitter {
    constructor() { super(); socket = this; }
    destroy() { this.destroyed = true; }
    connect(port,host,cb) { assert.equal(port,19204); assert.equal(host,'192.168.1.100'); cb(); }
    write(header) { written = header; }
  }
  run({payload:{request_id:'q1'}}, {get:()=>({Socket})}, {get:key=>key==='SVI_AMR_HOST'?'192.168.1.100':undefined}, {get:()=>0,set:()=>{}}, {status:()=>{},send:value=>{output=value;},done:()=>done++}, Buffer, cb=>{deadline=cb;return 1;}, ()=>{});
  assert.equal(written.length,16);
  assert.equal(written.readUInt16BE(8),1301);
  assert.equal(written.readUInt32BE(4),0);
  if (options.timeout) deadline();
  else if (options.closed) socket.emit('end');
  else {
    const payload = Buffer.from(options.invalidJSON ? '{broken' : JSON.stringify(body));
    const header = Buffer.alloc(16); header[0]=0x5a;header[1]=1;
    header.writeUInt16BE(options.wrongId?2:1,2); header.writeUInt32BE(options.oversized?5000000:payload.length,4);header.writeUInt16BE(11301,8);
    const packet=Buffer.concat([header,payload]);
    socket.emit('data',packet.subarray(0,7));assert.equal(output,undefined);
    socket.emit('data',packet.subarray(7,17));
    socket.emit('data',packet.subarray(17));
  }
  socket.emit('close');
  assert.equal(done,1);assert(socket.destroyed);
  return output;
}
assert.equal(scenario({stations:[]})[0].payload.points.length,0);
assert.equal(scenario({stations:[{id:'P1',name:'Lobby'}]})[0].payload.points[0].name,'Lobby');
for (const [body, options] of [[{},{}],[{ret_code:1,err_msg:'failure'},{}],[{stations:[]},{wrongId:true}],[{}, {timeout:true}],[{}, {closed:true}],[{}, {oversized:true}],[{}, {invalidJSON:true}],[{stations:[{id:'P1'},{id:'P1'}]},{}]]) {
  const result=scenario(body,options); assert.equal(result[0],null);assert(result[1].error);assert.equal(result[1]._pointRequestId,'q1');
}
const flow=JSON.parse(fs.readFileSync(path.join(__dirname,'../node-red/adam_flows.json'),'utf8'));
assert.equal(flow.find(n=>n.id==='6ce56aab23742991').type,'seer-status-station');
assert(!flow.some(n=>n.type==='robot-stationlist'));
console.log('Direct AMR protocol, fragmentation, empty-list, error, timeout and close tests passed');
