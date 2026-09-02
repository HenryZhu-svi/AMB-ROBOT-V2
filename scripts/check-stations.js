'use strict';
const vm = require('vm'), fs = require('fs'), assert = require('assert/strict'), path = require('path');
(async () => {
  for (const stations of [[], [{id:'P1',type:'LocationMark',x:1,y:2}]]) {
    let Constructor, input, output, request;
    const module = {exports:{}};
    const axios = {post:async (url, body) => { request={url,body}; return {data:{accepted:true,message:JSON.stringify({stations})}}; }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../node-red/robot-stationlist.js'),'utf8'), {module,require:()=>axios,console});
    module.exports({nodes:{
      createNode(node) { node.on=(name,cb)=>{if(name==='input')input=cb;}; node.status=()=>{}; node.warn=()=>{}; node.send=value=>{output=value;}; },
      getNode:()=>({baseUrl:()=> 'http://gateway:8000/v1',robotId:'R1',tenantId:'default',timeout:1000}),
      registerType:(name,constructor)=>{Constructor=constructor;}
    }});
    new Constructor({server:'gateway'});
    input({payload:{request_id:'test'}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(request.body.type,'query_stations');
    assert.equal(output[0].payload.points.length,stations.length);
    assert.equal(output[0]._pointRequestId,'test');
    assert.equal(output[1],null);
  }
  console.log('Gateway station query mapping and valid empty-list tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
