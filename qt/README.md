# SVI AMR Qt console

This directory is the Node-RED replacement under active development. It leaves
`amr-gateway-service` and `amr-fleet-management` unchanged.

The CMake project intentionally supports Qt 6.2 LTS and does not depend on the
newer `qt_standard_project_setup()` helper.

## Implemented in milestone 1

- `svi-amr-core`: a headless Qt service that owns external connections and survives UI restarts.
- `svi-amr-ui`: a Qt Quick operator UI connected to the core over a local socket.
- Gateway robot-state polling through `GET /v1/robots/{robotId}`.
- Authoritative SEER task-state polling through `query_task_status`.
- Gateway navigation, pause, resume and cancel commands with request-scoped idempotency keys.
- Direct SEER API 1301 station discovery using the deployed 12-byte little-endian protocol.
- Read-only Fleet job-progress polling.
- Atomic runtime snapshot persistence and automatic UI reconnection.
- Home screen and black animated-eye navigation screen. Tapping the running screen pauses;
  resume is immediate and cancellation requires confirmation.

## Deliberately not enabled yet

Fleet ownership and task advancement remain disabled in milestone 1. The existing
Flow contains conflicting Fleet AMR IDs (`38`, `42`, and `53`), so accepting or
completing a Fleet job before the site identity is confirmed would be unsafe.
Charging/standby shortcuts are also disabled until their configured point IDs are
persisted by the new settings repository.

## Configuration

Copy `config/svi-amr.json.example` to `/etc/svi-amr/config.json`. Set at least:

- `gateway.robotId`
- `fleet.amrId` (leave empty to keep Fleet read-only/offline)
- `seer.host`

Do not reuse an action idempotency key with different parameters. Query commands
intentionally do not carry an idempotency key because their result must remain live.

## Build on Debian/Ubuntu ARM64

```sh
sudo apt install cmake ninja-build g++ qt6-base-dev qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-controls qml6-module-qtquick-layouts
cmake -S . -B build -GNinja -DCMAKE_BUILD_TYPE=Release
cmake --build build
cpack --config build/CPackConfig.cmake
```

For local development, start the processes in this order:

```sh
./build/svi-amr-core --config ./config/svi-amr.json.example
./build/svi-amr-ui --config ./config/svi-amr.json.example
```

The current Windows workspace does not contain a Qt SDK or CMake, so compilation
must be verified on the target ARM64 device or in an ARM64 build container before deployment.

## Next milestones

1. Confirm one Fleet AMR ID and the exact deployed endpoint prefix.
2. Add the durable Fleet task state machine (`GOTO`, `Getjob`, `Wait`, `Wait,Only`,
   `Docking`, `Checkdoor`, `Forward`, `OK`).
3. Add settings password, point aliases, standby/charging points and Fleet pages.
4. Add error normalization, speech, Hook/DO and diagnostic controls.
5. Run shadow-mode comparison against Node-RED before exclusive cutover.
