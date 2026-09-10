#pragma once

#include "AppConfig.h"
#include "FleetClient.h"
#include "GatewayClient.h"
#include "SeerStationClient.h"

#include <QHash>
#include <QJsonObject>
#include <QLocalServer>
#include <QLocalSocket>
#include <QObject>
#include <QTimer>

class CoreService final : public QObject {
    Q_OBJECT
public:
    explicit CoreService(const AppConfig &config, QObject *parent = nullptr);
    bool start(QString *error = nullptr);

private:
    void handleClientMessage(QLocalSocket *client, const QJsonObject &message);
    void sendSnapshot(QLocalSocket *client);
    void broadcastSnapshot();
    void setConnectionState(const QString &name, bool connected, const QString &error = {});
    void updateRuntime(const QJsonObject &status);
    void persistSnapshot() const;
    void restoreSnapshot();

    AppConfig m_config;
    GatewayClient m_gateway;
    FleetClient m_fleet;
    SeerStationClient m_seer;
    QLocalServer m_server;
    QHash<QLocalSocket *, QByteArray> m_clientBuffers;
    QHash<QString, QJsonObject> m_pendingActions;
    QTimer m_robotTimer;
    QTimer m_taskTimer;
    QTimer m_fleetTimer;
    QJsonObject m_snapshot;
    quint64 m_revision = 0;
    QString m_lastRuntimeMode;
};
