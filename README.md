# SVI AMR uibuilder

Operator-facing AMR control interface built for Node-RED uibuilder.

## Current scope

- English operator interface
- Robot status and navigation controls
- Fleet task state handling
- Pause, resume, and confirmed cancellation
- Password-protected configuration screens
- Offline and reconnection-aware UI states

The Fleet Management service is treated as an external, unchanged system. Node-RED provides the UI adaptation and state synchronization layer.

## Local preview

```sh
npm run dev
```

The default preview address is `http://127.0.0.1:4173/`.
