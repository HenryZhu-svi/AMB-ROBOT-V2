"use strict";
var axios = require("axios");

/*
 * Fetches all stations/marks on the robot's current map via SEER HTTP REST API (port 8000).
 *
 * Tries several command types in order until one returns non-empty station data.
 * If all fail, falls back to GET /v1/robots/{id} and logs the raw response
 * so the correct field names can be identified.
 *
 * Output (port 0): { points: [{id,name,type,x,y,r,desc}], _raw, cmdType }
 * Output (port 1): error msg
 */
module.exports = function (RED) {
  /* Command types to try (most likely first) */
  var CANDIDATES = [
    "query_stations"
  ];

  function normalise(r) {
    var list = r.marks || r.stations || r.poi_list || r.location_marks ||
               r.waypoints || r.points || r.landmarks ||
               (Array.isArray(r) ? r : []);
    return list.map(function (s) {
      var id = String(s.id || s.name || s.poi_name || s.station_name || s.point_name || '');
      return {
        id:   id,
        name: String(s.alias || s.label || s.display_name || id),
        type: String(s.type  || 'LocationMark'),
        x:    Number(s.x !== undefined ? s.x : (s.pos_x || 0)),
        y:    Number(s.y !== undefined ? s.y : (s.pos_y || 0)),
        r:    Number(s.r !== undefined ? s.r : (s.theta || s.angle || s.yaw || 0)),
        desc: String(s.desc || s.description || '')
      };
    }).filter(function (p) { return p.id; });
  }

  function postCmd(baseUrl, tenantId, robotId, cmdType, timeout) {
    return axios.post(baseUrl + "/commands", {
      type      : cmdType,
      tenant_id : tenantId,
      robot_id  : robotId,
      payload   : {}
    }, { timeout: timeout });
  }

  function unwrap(raw) {
    if (!raw) return {};
    if (raw.message && typeof raw.message === "string") {
      try { return JSON.parse(raw.message); } catch (_) {}
    }
    if (raw.result && typeof raw.result === "object") return raw.result;
    return raw;
  }

  function Node(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.server = RED.nodes.getNode(n.server);

    node.on("input", function (msg) {
      msg._pointRequestId = msg.payload && msg.payload.request_id;
      if (!node.server) {
        node.error("No seer-config selected", msg);
        node.status({ fill: "red", shape: "ring", text: "no config" });
        return;
      }

      var srv      = node.server;
      var baseUrl  = srv.baseUrl();
      var robotId  = msg.robotId || srv.robotId;
      var tenantId = srv.tenantId || "default";
      var timeout  = srv.timeout  || 10000;
      var remaining = CANDIDATES.slice();

      function tryNext() {
        if (!remaining.length) {
          /* All candidates exhausted — GET /v1/robots/{id} to log raw data */
          node.status({ fill: "yellow", shape: "ring", text: "probing robot state…" });
          axios.get(baseUrl + "/robots/" + robotId, { timeout: timeout })
            .then(function (r) {
              node.warn("[stationlist] All command types failed.\n" +
                        "GET /v1/robots/" + robotId + " raw:\n" +
                        JSON.stringify(r.data || {}).slice(0, 1000));
              node.status({ fill: "red", shape: "ring", text: "unknown station cmd" });
              msg.error = "No valid command type for station list — check debug log";
              node.send([null, msg]);
            })
            .catch(function (e) {
              node.status({ fill: "red", shape: "ring", text: e.message.slice(0, 40) });
              msg.error = e.message;
              node.send([null, msg]);
            });
          return;
        }

        var cmdType = remaining.shift();
        node.status({ fill: "blue", shape: "dot", text: cmdType + "…" });

        postCmd(baseUrl, tenantId, robotId, cmdType, timeout)
          .then(function (r) {
            var raw    = r.data || {};
            var result = unwrap(raw);
            if (result.ret_code !== undefined && result.ret_code !== 0) {
              msg.error = result.err_msg || ('SEER error ' + result.ret_code);
              node.send([null, msg]);
              return;
            }

            /* Command rejected or unknown */
            if (raw.accepted === false ||
                (result.message && String(result.message).includes("Unknown command"))) {
              node.warn("[stationlist] " + cmdType + " → rejected, trying next");
              tryNext();
              return;
            }

            var points = normalise(result);
            if (!Array.isArray(result.stations) && !Array.isArray(result.points) && !Array.isArray(result.marks)) {
              node.warn("[stationlist] " + cmdType + " → 0 pts. raw: " +
                        JSON.stringify(raw).slice(0, 400));
              tryNext();
              return;
            }

            /* Success */
            node.status({ fill: "green", shape: "dot", text: points.length + " stations (" + cmdType + ")" });
            msg.topic   = "poi/stations";
            msg.payload = { points: points, _raw: raw, cmdType: cmdType };
            node.send([msg, null]);
          })
          .catch(function (e) {
            node.warn("[stationlist] " + cmdType + " → HTTP error: " + e.message);
            tryNext();
          });
      }

      tryNext();
    });

    node.on("close", function () { node.status({}); });
  }

  RED.nodes.registerType("robot-stationlist", Node);
};
