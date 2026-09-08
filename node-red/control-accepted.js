// Gateway HTTP success means accepted, not physically paused/resumed. Output 2
// immediately re-queries SEER so robot/runtime can provide confirmation.
const response = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
const accepted = response.accepted !== false;
return [
    {
        topic: 'ui/control/accepted',
        payload: {
            request_id: msg._uiRequestId || null,
            action: msg._uiAction || msg.topic || 'control',
            accepted,
            command_id: response.command_id || msg.commandId || null,
            message: response.message || (accepted ? 'Gateway accepted the request' : 'Gateway rejected the request')
        },
        _socketId: msg._socketId
    },
    accepted ? { topic: 'runtime/verify', payload: {}, _uiAction: msg._uiAction } : null
];
