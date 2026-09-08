// Publish the complete SEER task state. This is the authoritative UI movement
// signal and remains active even when no robot-nav node owns the command.
const p = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
const taskStatus = Number(p.task_status);
const runningStatus = Number(p.running_status);
const cachedProgress = (flow.get('site_ui_cache') || {})['nav/progress'];
// robot-nav deliberately reports "waiting" during SEER's short NONE grace
// period after an accepted navigate command. Do not overwrite that newer,
// command-correlated observation with a generic idle poll.
if (taskStatus === 0 && cachedProgress && Date.now() - Number(cachedProgress._observedAt || 0) < 10000) return null;
let mode = String(p.mode || '').toLowerCase();
if (taskStatus === 3 || p.is_suspended === true) mode = 'suspended';
else if (taskStatus === 2 || runningStatus === 1 || p.is_running === true) mode = 'running';
else if (taskStatus === 1 || p.is_waiting === true) mode = 'waiting';
else if (taskStatus === 4) mode = 'completed';
else mode = 'idle';

return {
    topic: 'robot/runtime',
    payload: {
        mode,
        task_status: Number.isFinite(taskStatus) ? taskStatus : null,
        running_status: Number.isFinite(runningStatus) ? runningStatus : null,
        is_running: mode === 'running' || mode === 'waiting',
        is_suspended: mode === 'suspended',
        is_idle: mode === 'idle',
        target_point: p.target_point || null,
        current_station: p.current_station || p.current_poi || null,
        unfinished_path: Array.isArray(p.unfinished_path) ? p.unfinished_path : [],
        observed_at: Date.now()
    }
};
