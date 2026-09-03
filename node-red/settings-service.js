// Node-RED Function body; global.fs must be configured in settings.js.
const topic = msg.topic;
if (!['ui/settings/request', 'ui/settings/save'].includes(topic)) return null;
const p = msg.payload || {};
function reply(topic, payload) { return { topic, payload, _socketId:msg._socketId }; }
try {
    const fs = global.get('fs');
    if (!fs) throw new Error('Persistent settings unavailable: configure functionGlobalContext.fs');
    const file = env.get('SVI_UI_CONFIG_PATH') || (env.get('HOME') + '/.node-red/svi-ui-settings.json');
    const cfg = global.get('cfg') || {};
    let saved = { revision:0, config:{ standbyPoint:cfg.standbyPoi || null, chargingPoint:cfg.chargePoi || null, visiblePoints:[] } };
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!saved.config || !Number.isInteger(saved.revision)) throw new Error('Invalid settings file; repair before saving');
    if (topic === 'ui/settings/save') {
        if (p.revision !== saved.revision) throw new Error('Settings changed in another session. Reload before saving.');
        const catalog = flow.get('v2_point_catalog');
        if (p.section !== 'fleet' && (!catalog || Date.now() - catalog.at > 300000)) throw new Error('Refresh the point catalog before saving');
        const ids = new Set((catalog?.points || []).map(point => point.id));
        const values = p.values || {};
        if (p.section === 'fleet') {
            const pages = global.get('fleet_getjob_pages');
            if (!Array.isArray(pages)) throw new Error('Load Fleet configuration before saving');
            const keys = new Set(pages.map(page => page.sourceProjectId ? 'project:' + page.sourceProjectId + ':page:' + page.id : 'page:' + page.id));
            if (!Array.isArray(values.pages) || values.pages.some(key => !keys.has(key))) throw new Error('Invalid Fleet page selection');
            saved.config.fleetPages = [...new Set(values.pages)];
        } else if (p.section === 'points') {
            if (!Array.isArray(values.points)) throw new Error('Invalid point selection');
            const selected = values.points.map(point => ({ id:String(point.id), label:String(point.label || point.id).trim() }));
            if (selected.some(point => !ids.has(point.id)) || new Set(selected.map(point => point.id)).size !== selected.length) throw new Error('Selection contains invalid or duplicate points');
            saved.config.visiblePoints = selected;
        } else if (p.section === 'standby' || p.section === 'charge') {
            const point = p.section === 'standby' ? values.standbyPoint : values.chargePoint;
            if (!ids.has(point)) throw new Error('Point is not in the current map');
            saved.config[p.section === 'standby' ? 'standbyPoint' : 'chargingPoint'] = point;
            saved.config[p.section === 'standby' ? 'standbyLabel' : 'chargingLabel'] = String(values.label || point);
        } else throw new Error('Unsupported settings section');
        saved.revision++;
        saved.config.savedAt = new Date().toISOString();
        fs.writeFileSync(file + '.tmp', JSON.stringify(saved, null, 2), 'utf8');
        fs.renameSync(file + '.tmp', file);
    }
    global.set('v2_saved_config', saved.config);
    global.set('cfg', Object.assign({}, cfg, { standbyPoi:saved.config.standbyPoint, chargePoi:saved.config.chargingPoint }));
    return reply(topic === 'ui/settings/save' ? 'ui/settings/saved' : 'ui/settings/state', { ...saved, request_id:p.request_id });
} catch (error) { return reply('ui/settings/error', { request_id:p.request_id, error:error.message }); }
