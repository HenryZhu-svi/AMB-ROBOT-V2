# Point settings deployment / 点位设置部署

> Historical instructions for the older flow. For the current site export use [SITE-DEPLOYMENT.md](SITE-DEPLOYMENT.md). 当前版本保留现场点位查询节点，不按本文替换它。

## Required updates / 必须更新的组件

1. Keep the original Gateway unchanged. Do not apply the previous query_stations patch. Point lookup now uses SEER TCP API 1301 directly from Node-RED to the wired AMR controller.
2. No custom node package update is required for point lookup. Configure Node-RED's built-in `net` module and the AMR controller address as described below; restart Node-RED after changing settings.js.
3. Back up the deployed flow and configuration. Merge the updated `adam_flows.json` with the deployed flow, preserving site-specific IP addresses, robot IDs and credentials. Do not blindly overwrite these with repository defaults.
4. Configure Node-RED `settings.js`: merge `fs: require('fs')` and `net: require('net')` into the existing `functionGlobalContext` object. Set `SVI_UI_CONFIG_PATH` to an absolute writable JSON file path if needed. Default: `$HOME/.node-red/svi-ui-settings.json`. Do not share this path across different robots.
5. Deploy all frontend `src` files to the actual uibuilder instance (the screenshot uses `AMB-ROBOT-V2`). Reload the browser.

不修改 Gateway，不安装前一版补丁，也不需要替换自定义节点包。更新 Flow、前端以及 Node-RED 的 settings.js 配置即可。保留现场 Gateway IP、机器人身份和凭据；配置文件路径必须可写。缺少 fs 或写入失败时会明确报错，不会提示保存成功。

### Node-RED settings.js

Merge these properties into the existing object; do not replace other global modules:

```js
functionGlobalContext: {
    // Keep your existing entries here.
    fs: require('fs'),
    net: require('net')
},
```

In the Node-RED editor, open the **Telemetry, Command & UI Hub** flow properties and add flow environment variables:

| Variable | Value |
|---|---|
| `SVI_AMR_HOST` | Actual AMR controller wired IP; NOT the Gateway device IP |
| `SVI_AMR_STATUS_PORT` | `19204` unless the controller is configured otherwise |
| `SVI_UI_CONFIG_PATH` | Optional absolute path in an existing writable directory |

在 Node-RED 编辑器中双击上述 Flow 标签，添加环境变量。SVI_AMR_HOST 必须填写 AMR 控制器有线 IP，不是运行 Gateway 的电脑 IP，也不是 Node-RED 的网页地址。网页正常状态和运动控制仍沿用原有 Gateway 配置；这里只把点位查询改为直连。

Test TCP reachability from the wired deployment device (replace the placeholder):

```bash
nc -vz <AMR_CONTROLLER_IP> 19204
```

## Flow changes / Flow 改动

- `seer_station_01`: Function node named `AMR wired point query (1301)`, using a 16-byte big-endian header, request/response correlation, fragmented-packet assembly, a ten-second deadline and response-size validation. It does not call Gateway HTTP APIs or use the legacy 12-byte helper.
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

Automated tests cover persistence, conflict, invalid points, filesystem failures and direct protocol response handling (fragmentation, empty list, malformed response, timeout and early close). Physical robot queries and deployed browser interaction still require on-site verification. Map identity scoping, ordering controls, navigation result state machine and Fleet task configuration remain subsequent work; do not interpret this phase as full system acceptance.

自动化测试不等于实机验收。本阶段尚未完成地图身份绑定、点位排序、运动命令结果状态机或 Fleet 任务配置。查询结果有效期为五分钟，保存前超时需要重新查询。
