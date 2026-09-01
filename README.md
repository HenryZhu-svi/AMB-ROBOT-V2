# SVI AMR uibuilder

Operator-facing AMR control interface built for Node-RED uibuilder.

## Current scope

- English operator interface
- Robot status and navigation controls
- Fleet task state handling
- Pause, resume, and confirmed cancellation
- Password-protected configuration screens
- Offline and reconnection-aware UI states
- Shared frontend state with revision-aware snapshot restore
- Node-RED uibuilder transport with automatic state requests on reconnect

The Fleet Management service is treated as an external, unchanged system. Node-RED provides the UI adaptation and state synchronization layer.

## Local preview

```sh
npm run dev
```

The default preview address is `http://127.0.0.1:4173/`.

The local preview intentionally runs without Node-RED. The interface remains usable for visual review and reports the control service as offline.

## Node-RED uibuilder deployment

Copy this project into the Node-RED uibuilder instance directory or use it as the instance source folder. The page loads the standard uibuilder browser client from:

```text
../uibuilder/uibuilder.iife.min.js
```

The frontend requests a complete state after page load and every uibuilder reconnection:

```text
ui/state/request
```

The companion Node-RED flow should answer with:

```text
ui/state/snapshot
```

Robot commands use `edge/command/request`. Fleet commands use `fleet/command/request`. Commands include a request or command ID and the last known state revision.

## Validation

```sh
npm run check
```

The Node-RED deliverable is a compatibility version of the complete deployed flow export at `node-red/adam_flows.json`. It preserves the existing Fleet and robot-control nodes and adds only the V2 protocol and state-snapshot layer. Read `node-red/README.md` before replacing the deployed flow.
