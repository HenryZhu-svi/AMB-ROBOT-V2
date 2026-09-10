#include "CoreService.h"

#include "IpcProtocol.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QStandardPaths>
#include <QUuid>

namespace {
QString stateFilePath()
{
    const auto dir = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation);
    QDir().mkpath(dir);
    return dir + QStringLiteral("/runtime-snapshot.json");
}

QJsonObject connectionObject(bool connected, const QString &error)
{
    return {
        {QStringLiteral("connected"), connected},
        {QStringLiteral("error"), error},
        {QStringLiteral("changedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs)}
    };
}
}

CoreService::CoreService(const AppConfig &config, QObject *parent)
    : QObject(parent), m_config(config), m_gateway(config, this), m_fleet(config, this), m_seer(config, this)
{
    restoreSnapshot();
    m_snapshot.insert(QStringLiteral("robotId"), config.gatewayRobotId);
    m_snapshot.insert(QStringLiteral("displayName"), config.displayName);
    m_snapshot.insert(QStringLiteral("connections"), QJsonObject {
        {QStringLiteral("gateway"), connectionObject(false, QStringLiteral("Starting"))},
        {QStringLiteral("fleet"), connectionObject(false, QStringLiteral("Starting"))},
        {QStringLiteral("seer"), connectionObject(false, QStringLiteral("Starting"))}
    });

    connect(&m_gateway, &GatewayClient::robotStateReceived, this, [this](const QJsonObject &state) {
        m_snapshot.insert(QStringLiteral("robot"), state);
        auto runtime = m_snapshot.value(QStringLiteral("runtime")).toObject();
        const auto runtimeMode = runtime.value(QStringLiteral("mode")).toString();
        const auto robotMode = state.value(QStringLiteral("mode")).toString().toLower();
        if (runtimeMode.isEmpty() || runtimeMode == QLatin1String("idle")) {
            if (state.value(QStringLiteral("task_running")).toBool()
                || robotMode.contains(QLatin1String("navigat"))
                || robotMode == QLatin1String("running")) {
                runtime.insert(QStringLiteral("mode"), QStringLiteral("running"));
                runtime.insert(QStringLiteral("target_point"), state.value(QStringLiteral("poi_target")));
                m_snapshot.insert(QStringLiteral("runtime"), runtime);
            }
        }
        broadcastSnapshot();
    });
    connect(&m_gateway, &GatewayClient::taskStatusReceived, this, &CoreService::updateRuntime);
    connect(&m_gateway, &GatewayClient::availabilityChanged, this,
            [this](bool ok, const QString &error) { setConnectionState(QStringLiteral("gateway"), ok, error); });
    connect(&m_gateway, &GatewayClient::actionResult, this,
            [this](const QString &requestId, const QString &action, bool accepted,
                   const QJsonObject &result, const QString &error) {
        const auto pending = m_pendingActions.take(requestId);
        const QJsonObject event {
            {QStringLiteral("type"), QStringLiteral("action_result")},
            {QStringLiteral("requestId"), requestId},
            {QStringLiteral("action"), action},
            {QStringLiteral("accepted"), accepted},
            {QStringLiteral("result"), result},
            {QStringLiteral("error"), error}
        };
        const auto bytes = IpcProtocol::encode(event);
        for (auto *client : m_clientBuffers.keys()) client->write(bytes);
        if (accepted) {
            auto runtime = m_snapshot.value(QStringLiteral("runtime")).toObject();
            if (action == QLatin1String("navigate")) {
                runtime.insert(QStringLiteral("mode"), QStringLiteral("waiting"));
                runtime.insert(QStringLiteral("target_point"), pending.value(QStringLiteral("point")));
                runtime.insert(QStringLiteral("pendingSinceMs"), double(QDateTime::currentMSecsSinceEpoch()));
            } else if (action == QLatin1String("pause_navigation")) {
                runtime.insert(QStringLiteral("mode"), QStringLiteral("suspended"));
            } else if (action == QLatin1String("resume_navigation")) {
                runtime.insert(QStringLiteral("mode"), QStringLiteral("waiting"));
            } else if (action == QLatin1String("cancel")) {
                runtime.insert(QStringLiteral("mode"), QStringLiteral("idle"));
                runtime.remove(QStringLiteral("target_point"));
                runtime.remove(QStringLiteral("pendingSinceMs"));
            }
            m_snapshot.insert(QStringLiteral("runtime"), runtime);
            persistSnapshot();
            broadcastSnapshot();
            m_gateway.fetchTaskStatus();
            m_gateway.fetchRobotState();
        }
    });

    connect(&m_fleet, &FleetClient::jobProgressReceived, this, [this](const QJsonObject &progress) {
        m_snapshot.insert(QStringLiteral("fleet"), progress);
        broadcastSnapshot();
    });
    connect(&m_fleet, &FleetClient::availabilityChanged, this,
            [this](bool ok, const QString &error) { setConnectionState(QStringLiteral("fleet"), ok, error); });

    connect(&m_seer, &SeerStationClient::stationsReceived, this, [this](const QJsonArray &stations) {
        m_snapshot.insert(QStringLiteral("stations"), stations);
        persistSnapshot();
        setConnectionState(QStringLiteral("seer"), true);
    });
    connect(&m_seer, &SeerStationClient::failed, this,
            [this](const QString &error) { setConnectionState(QStringLiteral("seer"), false, error); });

    connect(&m_robotTimer, &QTimer::timeout, &m_gateway, &GatewayClient::fetchRobotState);
    connect(&m_taskTimer, &QTimer::timeout, &m_gateway, &GatewayClient::fetchTaskStatus);
    connect(&m_fleetTimer, &QTimer::timeout, &m_fleet, &FleetClient::fetchJobProgress);
}

bool CoreService::start(QString *error)
{
    if (m_config.gatewayRobotId.isEmpty()) {
        if (error) *error = QStringLiteral("gateway.robotId is required");
        return false;
    }
    if (!m_server.listen(m_config.socketName)) {
        // Only remove a stale socket after proving no live core accepts it.
        QLocalSocket probe;
        probe.connectToServer(m_config.socketName);
        if (probe.waitForConnected(300)) {
            if (error) *error = QStringLiteral("Another controller is already listening on %1").arg(m_config.socketName);
            return false;
        }
        QLocalServer::removeServer(m_config.socketName);
        if (!m_server.listen(m_config.socketName)) {
            if (error) *error = QStringLiteral("Cannot listen on %1: %2").arg(m_config.socketName, m_server.errorString());
            return false;
        }
    }

    connect(&m_server, &QLocalServer::newConnection, this, [this] {
        while (auto *client = m_server.nextPendingConnection()) {
            m_clientBuffers.insert(client, {});
            connect(client, &QLocalSocket::readyRead, this, [this, client] {
                auto &buffer = m_clientBuffers[client];
                buffer.append(client->readAll());
                QString parseError;
                for (const auto &message : IpcProtocol::takeMessages(buffer, &parseError))
                    handleClientMessage(client, message);
                if (!parseError.isEmpty())
                    client->write(IpcProtocol::encode({{QStringLiteral("type"), QStringLiteral("protocol_error")},
                                                       {QStringLiteral("error"), parseError}}));
            });
            connect(client, &QLocalSocket::disconnected, this, [this, client] {
                m_clientBuffers.remove(client);
                client->deleteLater();
            });
            sendSnapshot(client);
        }
    });

    m_robotTimer.start(qMax(500, m_config.gatewayStatePollMs));
    m_taskTimer.start(qMax(1000, m_config.gatewayTaskPollMs));
    if (!m_config.fleetBaseUrl.isEmpty() && !m_config.fleetAmrId.isEmpty())
        m_fleetTimer.start(qMax(2000, m_config.fleetPollMs));
    else
        setConnectionState(QStringLiteral("fleet"), false, QStringLiteral("Fleet AMR ID is not configured"));

    m_gateway.fetchRobotState();
    m_gateway.fetchTaskStatus();
    m_fleet.fetchJobProgress();
    m_seer.fetchStations();
    return true;
}

void CoreService::handleClientMessage(QLocalSocket *client, const QJsonObject &message)
{
    const auto type = message.value(QStringLiteral("type")).toString();
    if (type == QLatin1String("request_snapshot")) {
        sendSnapshot(client);
        return;
    }
    if (type == QLatin1String("refresh_stations")) {
        m_seer.fetchStations();
        return;
    }
    if (type != QLatin1String("action")) return;

    const auto action = message.value(QStringLiteral("action")).toString();
    auto payload = message.value(QStringLiteral("payload")).toObject();
    const auto requestId = message.value(QStringLiteral("requestId")).toString(
        QUuid::createUuid().toString(QUuid::WithoutBraces));
    if (action == QLatin1String("navigate")) {
        const auto point = payload.value(QStringLiteral("point")).toString().trimmed();
        if (point.isEmpty()) {
            client->write(IpcProtocol::encode({
                {QStringLiteral("type"), QStringLiteral("action_result")},
                {QStringLiteral("requestId"), requestId},
                {QStringLiteral("action"), action},
                {QStringLiteral("accepted"), false},
                {QStringLiteral("error"), QStringLiteral("Destination point is required")}
            }));
            return;
        }
        payload = {
            {QStringLiteral("id"), point},
            {QStringLiteral("source_id"), QStringLiteral("SELF_POSITION")},
            {QStringLiteral("task_id"), QStringLiteral("qt_") + requestId}
        };
    }
    m_pendingActions.insert(requestId, {{QStringLiteral("action"), action},
                                        {QStringLiteral("point"), message.value(QStringLiteral("payload")).toObject().value(QStringLiteral("point"))}});
    m_gateway.sendAction(action, payload, requestId);
}

void CoreService::updateRuntime(const QJsonObject &status)
{
    const int taskStatus = status.value(QStringLiteral("task_status")).toInt(0);
    const int runningStatus = status.value(QStringLiteral("running_status")).toInt(0);
    QString mode = QStringLiteral("idle");
    if (taskStatus == 3 || status.value(QStringLiteral("is_suspended")).toBool()) mode = QStringLiteral("suspended");
    else if (taskStatus == 2 || runningStatus == 1 || status.value(QStringLiteral("is_running")).toBool()) mode = QStringLiteral("running");
    else if (taskStatus == 1 || status.value(QStringLiteral("is_waiting")).toBool()) mode = QStringLiteral("waiting");
    else if (taskStatus == 4) mode = QStringLiteral("completed");

    const auto previous = m_snapshot.value(QStringLiteral("runtime")).toObject();
    const qint64 pendingSince = qint64(previous.value(QStringLiteral("pendingSinceMs")).toDouble());
    const bool withinStartGrace = pendingSince > 0
        && QDateTime::currentMSecsSinceEpoch() - pendingSince < 8000;
    if (taskStatus == 0 && withinStartGrace
        && (previous.value(QStringLiteral("mode")).toString() == QLatin1String("waiting")
            || previous.value(QStringLiteral("mode")).toString() == QLatin1String("running"))) {
        mode = previous.value(QStringLiteral("mode")).toString();
    }

    auto runtime = status;
    runtime.insert(QStringLiteral("mode"), mode);
    if (withinStartGrace) {
        runtime.insert(QStringLiteral("pendingSinceMs"), pendingSince);
        if (runtime.value(QStringLiteral("target_point")).toString().isEmpty())
            runtime.insert(QStringLiteral("target_point"), previous.value(QStringLiteral("target_point")));
    }
    runtime.insert(QStringLiteral("observedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs));
    m_snapshot.insert(QStringLiteral("runtime"), runtime);
    if (m_lastRuntimeMode != mode) {
        m_lastRuntimeMode = mode;
        persistSnapshot();
    }
    broadcastSnapshot();
}

void CoreService::setConnectionState(const QString &name, bool connected, const QString &error)
{
    auto connections = m_snapshot.value(QStringLiteral("connections")).toObject();
    connections.insert(name, connectionObject(connected, error));
    m_snapshot.insert(QStringLiteral("connections"), connections);
    broadcastSnapshot();
}

void CoreService::sendSnapshot(QLocalSocket *client)
{
    auto message = m_snapshot;
    message.insert(QStringLiteral("type"), QStringLiteral("snapshot"));
    message.insert(QStringLiteral("revision"), QString::number(m_revision));
    client->write(IpcProtocol::encode(message));
}

void CoreService::broadcastSnapshot()
{
    ++m_revision;
    m_snapshot.insert(QStringLiteral("updatedAt"), QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs));
    for (auto *client : m_clientBuffers.keys()) sendSnapshot(client);
}

void CoreService::persistSnapshot() const
{
    QSaveFile file(stateFilePath());
    if (!file.open(QIODevice::WriteOnly)) return;
    file.write(QJsonDocument(m_snapshot).toJson(QJsonDocument::Compact));
    file.commit();
}

void CoreService::restoreSnapshot()
{
    QFile file(stateFilePath());
    if (!file.open(QIODevice::ReadOnly)) return;
    const auto document = QJsonDocument::fromJson(file.readAll());
    if (document.isObject()) {
        m_snapshot = document.object();
        m_snapshot.insert(QStringLiteral("restored"), true);
    }
}
