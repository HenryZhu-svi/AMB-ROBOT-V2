# AMB-ROBOT-V2 Node-RED adapter

Import `flow.json` into the same Node-RED runtime that contains the existing Fleet Job Engine from `UI_Adam.json`.

## Responsibilities

- Hosts the `AMB-ROBOT-V2` uibuilder instance.
- Validates and deduplicates UI commands.
- Polls battery, current POI, and robot mode through `svi-gateway` nodes.
- Maintains a revisioned UI state snapshot.
- Restores the last state from Node-RED context when persistent context is available.
- Routes Fleet start and cancellation requests to the existing Fleet Job Engine.
- Routes local navigation, pause, resume, and cancellation through existing `svi-gateway` node types.

It does not modify or replace `amr-fleet-management`.

## Required nodes

- `node-red-contrib-uibuilder`
- The local `svi-gateway` package used by the existing AMR flow

## Required configuration

1. Open `AMB-20 Gateway` and set the deployed `amr-gateway-service` host and port.
2. Confirm that the existing Fleet flow contains these link inputs:
   - `c21761218db4c6d5` — accept next Fleet job
   - `ee6ac5bac94adea3` — cancel current Fleet job
3. Connect the existing Fleet job-progress output to `Fleet progress input` when progress messages are not already forwarded through another shared link.
4. Configure Node-RED persistent context storage with a store named `file` for restart persistence. The flow falls back to memory context if that store is unavailable.
5. Deploy the flow and copy this repository's `src` directory into the generated `AMB-ROBOT-V2` uibuilder instance when uibuilder does not automatically reuse it.

## UI protocol

The frontend sends:

- `ui/state/request`
- `edge/command/request`
- `fleet/command/request`

The adapter sends:

- `ui/state/snapshot`
- `ui/command/ack`
- `config/saved`

Every accepted change increments `revision`. Repeated command IDs are acknowledged without executing the underlying command again.

## Important deployment note

The Fleet link IDs intentionally target the existing `UI_Adam.json` Fleet Job Engine. If that flow is regenerated with different Node-RED IDs, update the two V2 link-out nodes in the editor before deployment.
