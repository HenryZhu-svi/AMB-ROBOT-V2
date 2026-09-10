#pragma once

#include <QString>
#include <QtGlobal>

struct AppConfig {
    QString gatewayBaseUrl = QStringLiteral("http://127.0.0.1:8000/v1");
    QString gatewayRobotId;
    QString gatewayTenantId = QStringLiteral("default");
    QString gatewayApiKey;
    int gatewayStatePollMs = 1000;
    int gatewayTaskPollMs = 1500;
    int gatewayTimeoutMs = 10000;

    QString fleetBaseUrl;
    QString fleetAmrId;
    QString fleetBearerToken;
    int fleetPollMs = 5000;
    int fleetTimeoutMs = 10000;

    QString seerHost;
    quint16 seerStatusPort = 19204;
    quint16 seerProtocolVersion = 1;
    int seerTimeoutMs = 10000;
    quint32 seerMaxPayloadBytes = 4U * 1024U * 1024U;

    QString socketName = QStringLiteral("svi-amr-core");
    QString displayName = QStringLiteral("SVI AMR");

    static AppConfig load(const QString &path, QString *error = nullptr);
};
