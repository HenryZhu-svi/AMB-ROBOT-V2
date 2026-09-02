# Point settings deployment / 点位设置部署

## Required updates / 必须更新的组件

1. Gateway: run `git apply --unidiff-zero gateway-query-stations.patch` from the Gateway repository root (copy the patch there first). This adds only the `query_stations` mapping, query classification and validation. Restart the Gateway running on the device physically connected to the AMR.
2. Install the accompanying `robot-stationlist.js` into the installed svi-gateway package's `nodes/` directory, preserving its existing package registration; restart Node-RED.
3. Back up the deployed flow and configuration. Merge the updated `adam_flows.json` with the deployed flow, preserving site-specific IP addresses, robot IDs and credentials. Do not blindly overwrite these with repository defaults.
4. Configure Node-RED `settings.js`: merge `fs: require('fs')` into the existing `functionGlobalContext` object. Set `SVI_UI_CONFIG_PATH` to an absolute writable JSON file path if needed. Default: `$HOME/.node-red/svi-ui-settings.json`. Do not share this path across different robots.
5. Deploy all frontend `src` files to the actual uibuilder instance (the screenshot uses `AMB-ROBOT-V2`). Reload the browser.

必须同时更新远端 Gateway、实际安装的自定义节点、Flow 和前端。只更新网页不能查询全部点位。保留现场 IP、机器人身份和凭据；配置文件路径必须可写。缺少 fs 或写入失败时会明确报错，不会提示保存成功。

## Flow changes / Flow 改动

- `seer_station_01`: replaces direct SEER TCP node with `robot-stationlist`, sharing the battery node's Gateway config.
- `fn_poi_stations_fmt`: caches successful point results with a freshness timestamp and forwards correlated responses.
- Added `v2_points_error`, `v2_settings_service`, `v2_settings_load` (three nodes).
- uibuilder output also routes settings requests to the persistent service.
- Snapshot manager overlays persisted UI configuration; legacy settings/save is rejected to prevent two competing save paths.
- No Fleet service changes. Existing startup cfg remains, followed by saved UI configuration restoration.

## Acceptance / 验收

- Compare fetched IDs against the AMR current map; verify empty map vs query error.
- Select points and labels, save, reopen settings, reload browser and restart Node-RED.
- Verify invalid points, concurrent stale saves and disk failures are rejected.
- Cancel/close dialogs must not save or start movement.
- Disconnect local control: refreshing/saving must report failure without erasing saved selections.

Automated tests cover persistence, conflict, invalid points and filesystem failures. Physical robot queries and deployed browser interaction still require on-site verification. Map identity scoping, ordering controls, navigation result state machine and Fleet task configuration remain subsequent work; do not interpret this phase as full system acceptance.

自动化测试不等于实机验收。本阶段尚未完成地图身份绑定、点位排序、运动命令结果状态机或 Fleet 任务配置。查询结果有效期为五分钟，保存前超时需要重新查询。
