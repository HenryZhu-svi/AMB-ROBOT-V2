# Site-flow UI integration / 现场界面适配

## Deployment / 部署

1. Back up the running Node-RED flow, credentials, uibuilder files and settings. 此版本基于用户提供的 270 节点现场导出，不基于根目录旧 adam_flows.json。
2. Deploy all `src/` files into the existing `AMB-ROBOT-V2/src/` folder. Replace/update the matching flow nodes from `node-red/adam_flows.json`; do not import a second live copy with new IDs. 保留现场地址、身份、凭据及已修复的 `seer-status-station` 节点配置，不更换 Gateway 或 Fleet。
3. Merge `fs: require('fs')` into Node-RED `settings.js` → `functionGlobalContext` and restart Node-RED if this setting changes. 本版新增配置服务需要 fs；不需要为本版新增 net 或 SVI_AMR_HOST。
4. Set `SVI_UI_CONFIG_PATH` to an absolute writable file in an existing directory, or use `$HOME/.node-red/svi-ui-settings.json`. Do not share it between robots. 默认保存文件与旧 robot-config.json 分开；启动时使用现有 cfg 作为初值，有保存文件时以保存值为准。
5. Review the existing file-write paths: this release changes `/uibuilder/AMB-ROBOT/` to `/uibuilder/AMB-ROBOT-V2/` while retaining `/home/amb/.node-red`. Change the parent directory if the deployment user is different. 没有在开发机覆盖根目录的旧 Flow；应部署仓库内 node-red/adam_flows.json。
6. Reload the browser after installing the frontend. Settings password is unchanged. Open Settings, load points, save standby/charging/visible points, then reload to verify persistence.

## Exact flow changes / Flow 改动范围

- Six added nodes: `site_ui_bridge`, `site_ui_cache`, `site_settings`, `site_settings_load`, `site_point_error`, `site_control_error`. Total: 276 nodes.
- Route uibuilder commands through the bridge, mapping new command envelopes to the existing nav/pause/resume/cancel/charge/getjob/enqueue paths. The charging action uses the existing `charge` route; docking logic is not rewritten.
- Intercept existing UI-bound wires to cache resumable messages. Reconnect requests replay UI state and trigger Fleet/config refresh. Commands are never replayed.
- Preserve the station query node; add point-catalog caching and a browser-visible error output.
- Forward pause/resume failures to the browser. Success is confirmed from navigation telemetry, not an optimistic UI click.
- Distinguish failed Fleet queries from confirmed no-task responses.
- Retarget legacy configuration/wait cache file paths to AMB-ROBOT-V2.
- Remove two dangling incoming-link references (`a84f5f43c1701236`, `9dceae09ce7f9cec`) from `b7700b19c63b222a`; their source nodes are absent in the supplied export. No existing executable task branch is removed.

## What is included / 已实现

- Existing English design retained; live device identity, telemetry, charging indication and connection freshness.
- Waiting-for-operator dialog with wait ID, deadline display, Ready confirmation and confirmed cancellation request.
- Fleet dynamic pages and enqueue selections; configurable visibility of Fleet menu entries. Active task prompts are not hidden by the menu filter.
- POI-occupied waiting/cancellation; local point whitelist and labels; persistent charging/standby configuration.
- Pause/resume pending states, navigation progress interpretation, cancel-location correction and separate local/Fleet task ownership.

## Limits / 尚未解决的边界

- No physical robot tests or deployment were performed. Browser tests use a fake uibuilder and localhost only. 未验证现场实际导航、对接、充电、暂停及 Fleet 子任务推进。
- Browser reconnect recovery is supported while Node-RED remains running. Full Node-RED restart recovery of active custom-node waits/commands is NOT implemented. The custom wait node owns volatile runtime state; restoring an old screen alone cannot restore it.
- Duplicate IDs are suppressed in memory for ten minutes; this is not durable, cross-restart exactly-once execution. Uncertain results are not automatically retried.
- Existing custom-node task-completion inference and enqueue HTTP-400 handling are unchanged. Local UI cannot fix wrong upstream business state; it shows physical charging separately from Fleet step names.
- Charging display is a live status banner, not a new dedicated charging dashboard. Mapping/grouping/sorting of points, sound/Hook/relocation admin tools, detailed alarm translations, and full backend busy arbitration are follow-up work.
- Settings save uses an atomic file replacement and revision check, but other already-open browsers refresh their settings on reconnect/opening Settings rather than receiving a full broadcast.

## Checks / 检查

`npm run check` validates JavaScript, flow links/functions, protocol translation, duplicate guard, replay cleanup, Fleet failure handling and settings persistence. The historical standalone station protocol tests remain, but the deployed station implementation is the unchanged site custom node.

`node scripts/check-browser.cjs` requires Playwright plus Edge (or `TEST_BROWSER_CHANNEL`). It uses an isolated headless browser with a mocked uibuilder; it never accesses robot endpoints.

Rebuild the delivered flow with `node scripts/build-site-flow.js`. To change the baseline deliberately, pass the path to the original site export. The script refuses unrelated baseline IDs. Do not run the historical `build-settings-flow.js` for this release.

现场验收顺序：只读遥测 → 点位/配置保存与刷新 → 等待/选择消息 → 由现场人员确认后测试导航/暂停/恢复/取消 → 充电 → Wi-Fi 断连与浏览器重连。不要把界面“请求已发送”作为物理动作已成功的证据。
