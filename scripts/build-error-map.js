'use strict';
// Mechanical extraction of the existing UI's English alarm catalog.
const fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../../AMB-ROBOT/src/robot-error-map.js'),'utf8');
const entries=vm.runInNewContext(source+'\nROBOT_ERROR_MESSAGES');
const english=Object.fromEntries(Object.entries(entries).map(([code,item])=>[code,{severity:item.severity,en:item.en}]));
fs.writeFileSync(path.join(__dirname,'../src/error-map.js'),'// English catalog migrated from the existing AMB-ROBOT UI. Not exhaustive.\nwindow.AMRErrorMap = '+JSON.stringify(english,null,2)+';\n');
