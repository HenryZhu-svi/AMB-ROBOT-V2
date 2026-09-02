// Node-RED Function body. Requires functionGlobalContext.net = require('net').
// SVI_AMR_HOST is the controller's wired IP, not the Gateway host.
const requestId = msg.payload && msg.payload.request_id;
msg._pointRequestId = requestId;
const net = global.get('net');
const host = String(env.get('SVI_AMR_HOST') || '').trim();
const port = Number(env.get('SVI_AMR_STATUS_PORT') || 19204);
function fail(error) {
    msg.error = error.message || String(error);
    node.status({fill:'red', shape:'ring', text:msg.error.slice(0, 48)});
    node.send([null, msg]);
}
if (!net || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
    fail(new Error('Configure functionGlobalContext.net and SVI_AMR_HOST / SVI_AMR_STATUS_PORT'));
    node.done();
    return null;
}
const sequence = (Number(context.get('sequence') || 0) + 1) % 65536;
context.set('sequence', sequence);
const header = Buffer.alloc(16);
header[0] = 0x5a; header[1] = 1;
header.writeUInt16BE(sequence, 2);
header.writeUInt32BE(0, 4);
header.writeUInt16BE(1301, 8);
let buffer = Buffer.alloc(0), settled = false;
const socket = new net.Socket();
const deadline = setTimeout(() => finish(new Error('AMR point query timed out')), 10000);
function finish(error, points) {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    socket.destroy();
    if (error) fail(error);
    else {
        msg.payload = {points};
        node.status({fill:'green', shape:'dot', text:points.length + ' points'});
        node.send([msg, null]);
    }
    node.done();
}
socket.once('error', error => finish(error));
socket.once('end', () => finish(new Error('AMR closed connection before a complete response')));
socket.once('close', () => { if (!settled) finish(new Error('AMR connection closed')); });
socket.on('data', chunk => {
    if (settled) return;
    buffer = Buffer.concat([buffer, chunk]);
    try {
        if (buffer.length < 16) return;
        if (buffer[0] !== 0x5a || buffer[1] !== 1) throw new Error('Invalid SEER response header');
        const length = buffer.readUInt32BE(4);
        if (length > 4 * 1024 * 1024) throw new Error('SEER point response exceeds 4 MB');
        if (buffer.readUInt16BE(2) !== sequence || buffer.readUInt16BE(8) !== 11301) throw new Error('Unexpected SEER response ID or type');
        if (buffer.length < 16 + length) return;
        const raw = JSON.parse(buffer.subarray(16, 16 + length).toString('utf8'));
        if (raw.ret_code !== undefined && raw.ret_code !== 0) throw new Error(raw.err_msg || 'SEER error ' + raw.ret_code);
        if (!Array.isArray(raw.stations)) throw new Error('SEER response has no stations array');
        const seen = new Set();
        const points = raw.stations.map(station => {
            const id = String(station.id ?? '').trim();
            if (!id || seen.has(id)) throw new Error('Missing or duplicate station ID');
            seen.add(id);
            return {id, name:String(station.name || station.alias || id), type:station.type || 'LocationMark', x:station.x, y:station.y, r:station.r};
        });
        finish(null, points);
    } catch (error) { finish(error); }
});
node.status({fill:'blue', shape:'dot', text:'Reading AMR map points'});
socket.connect(port, host, () => socket.write(header));
return null;
