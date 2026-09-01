# AMB-ROBOT-V2 compatibility version

`adam_flows.json` is the complete existing Node-RED export with a minimal V2 uibuilder compatibility layer added to the active `Telemetry, Command & UI Hub` tab.

It replaces the earlier standalone V2 adapter proposal. The existing robot polling, navigation nodes, Fleet Job Engine, charging logic, HTTP endpoints, WebSocket endpoints, and `svi-gateway` nodes remain in place.

## Added nodes

- `v2_compat_command_adapter` — accepts the V2 protocol, rejects invalid commands, and deduplicates the latest 200 command IDs.
- `v2_compat_client_event` — converts uibuilder socket events into state synchronization events.
- `v2_compat_state_manager` — aggregates existing messages and global Fleet state into revisioned snapshots.

## Existing nodes with added wires

The following existing nodes still send their original messages to the old UI and now also send a copy to the V2 state manager:

- `3230c93c6052aaa0` — battery topic
- `5b29c2b68360c3c0` — Wi-Fi topic
- `1208527fda5a862f` — POI, status, destination, and distance
- `74458d0a0d6f47b4` — robot mode
- `ade363b933d65ff4` — navigation arrival
- `030d591fd769473a` — navigation progress
- `31d59e0d96429950` — Fleet UI events
- `enq_node_01` — enqueue success and error
- `robot_estop_01` — emergency state
- `poi_cancel_ui_fn` — cancellation state
- `7d56d28a0500cb46` — robot errors

The existing uibuilder node `65bcae3e8cd99339` also sends V2 commands to the compatibility adapter and client control events to the client-event adapter.

## Existing code changed

The function `1208527fda5a862f` now publishes the periodically reported current POI. Its previous POI send statement was commented out. It also refreshes `global.current_poi` when the gateway returns a POI.

No Fleet API URL, Fleet custom node, robot control node, Fleet Management behavior, or original legacy command route was replaced.

## V2 routing

- `edge/command/request:navigate` → existing `nav` route
- `edge/command/request:pause` → existing `pause` route
- `edge/command/request:resume` → existing `resume` route
- `edge/command/request:cancel` → existing `cancel` route
- `fleet/command/request:start` → existing `enq_link_accept` Fleet accept path
- `fleet/command/request:cancel` → existing `poi_cancel_ui_fn` cancellation path
- `ui/state/request` and Fleet `sync` → V2 state snapshot
- `edge/command/request:settings/save` → V2 configuration compatibility state

Legacy UI messages continue to use the original routes unchanged.

## Persistence

The adapter uses a Node-RED context store named `file` when available and falls back to the default context store. Configure `contextStorage` with a `localfilesystem` store named `file` to retain snapshots and processed command IDs across Node-RED restarts.

## Deployment

Import the complete `adam_flows.json` as a versioned replacement of the matching deployed flow export. Do not import it alongside the same 254-node baseline because the existing node IDs are intentionally preserved.

The existing uibuilder URL remains `AMB-ROBOT`. Deploy this repository's `src` files into the existing `AMB-ROBOT/src` instance directory. Keeping that instance name also preserves the current `config-button.json`, `robot-config.json`, and `wait-status.json` paths in the baseline flow.
