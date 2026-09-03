(function () {
  'use strict';
  const panel=document.createElement('aside');
  panel.className='robot-alert-panel';panel.setAttribute('popover','manual');panel.setAttribute('role','alert');
  panel.innerHTML='<strong id="robotAlertTitle"></strong><ul id="robotAlertList"></ul><small id="robotAlertFreshness"></small><button id="robotAlertVoice" type="button">Enable Voice Alerts</button>';
  document.body.append(panel);
  let signature='',items=[],at=0,voice=false;
  const supportsPopover=typeof panel.showPopover==='function';
  const hide=()=>{if(supportsPopover && panel.matches(':popover-open'))panel.hidePopover();};
  const list=panel.querySelector('ul');
  const topics=new Set(['robot/error','error/status','alarm/status','diagnostic']);
  const array=value=>Array.isArray(value)?value:[];
  function normalize(msg) {
    const p=msg.payload;
    if(!p || typeof p!=='object' || Array.isArray(p))return null;
    if(msg.topic==='diagnostic' && p.data?.component!=='alarm' && p.component!=='alarm')return null;
    const data=p.data?.component==='alarm'?p.data:p;
    const raw=data._raw || {};
    if(!['fatals','errors','warnings','has_error','has_warning','status','mode','emergency_stop','_raw'].some(key=>key in data))return null;
    const errors=array(data.errors).length?data.errors:array(raw.active_errors);
    const result=[];
    for(const [severity,values] of [['fatal',array(data.fatals)],['error',errors],['warning',array(data.warnings)]]) {
      for(const value of values) {
        const item=value && typeof value==='object'?value:{code:value};
        const code=String(item.code ?? item.error_code ?? '');
        const known=window.AMRErrorMap?.[code];
        const detail=known?.en || item.desc || item.describe || item.message || item.reason;
        result.push({code,severity,text:detail?String(detail):'Unknown robot '+severity+(code?' '+code:'')});
      }
    }
    if(data.emergency_stop===true || raw.emergency_stop===true)result.unshift({code:'ESTOP',severity:'fatal',text:'Emergency stop is active'});
    if(!result.length && (data.has_error===true || data.status==='error' || data.mode==='error'))result.push({code:'',severity:'error',text:'Robot reports an error without diagnostic details'});
    if(!result.length && data.has_warning===true)result.push({code:'',severity:'warning',text:'Robot reports a warning without diagnostic details'});
    return [...new Map(result.map(item=>[item.severity+'|'+item.code+'|'+item.text,item])).values()];
  }
  function speak() {
    if(!voice || !items.length || !window.speechSynthesis || !window.SpeechSynthesisUtterance)return;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance('Robot '+(items.some(i=>i.severity!=='warning')?'error. ':'warning. ')+items.map(i=>(i.code?'Code '+i.code+'. ':'')+i.text).join('. '));
    utterance.lang='en-US';window.speechSynthesis.speak(utterance);
  }
  panel.querySelector('button').onclick=()=>{voice=!voice;panel.querySelector('button').textContent=voice?'Mute Voice Alerts':'Enable Voice Alerts';if(voice)speak();else window.speechSynthesis?.cancel();};
  function render() {
    if(!items.length){hide();panel.hidden=true;return;}
    const parent=[...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
    if(panel.parentElement!==parent){hide();parent.append(panel);}
    panel.hidden=false;
    panel.dataset.level=items.some(i=>i.severity!=='warning')?'error':'warning';
    panel.querySelector('strong').textContent=panel.dataset.level==='error'?'Robot Error':'Robot Warning';
    list.replaceChildren();for(const item of items){const li=document.createElement('li');li.textContent=(item.code?'['+item.code+'] ':'')+item.text;list.append(li);}
    if(supportsPopover && !panel.matches(':popover-open'))panel.showPopover();
    panel.querySelector('small').textContent=Date.now()-at>20000?'Last reported alarms — live status unavailable':'Active robot diagnostics';
  }
  window.AMRAlerts={normalize,hasError:()=>items.some(i=>i.severity!=='warning')};
  window.AMRTransport.subscribe(msg=>{
    if(!topics.has(msg.topic))return;
    const next=normalize(msg);if(next===null)return;
    const key=next.map(i=>i.severity+'|'+i.code+'|'+i.text).sort().join('\n');
    const changed=key!==signature;
    items=next;at=msg._observedAt || Date.now();signature=key;render();
    if(!items.length)window.speechSynthesis?.cancel();
    else if(changed && !msg._replay)speak();
  });
  panel.hidden=true;setInterval(render,1000);
})();
