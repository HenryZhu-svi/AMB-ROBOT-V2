#include "AppConfig.h"

#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>

namespace {
QString text(const QJsonObject &object, const char *key, const QString &fallback = {})
{
    const auto value = object.value(QLatin1String(key));
    return value.isString() ? value.toString() : fallback;
}
int number(const QJsonObject &object, const char *key, int fallback)
{
    const auto value = object.value(QLatin1String(key));
    return value.isDouble() ? value.toInt(fallback) : fallback;
}
}

AppConfig AppConfig::load(const QString &path, QString *error)
{
    AppConfig config;
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        if (error) *error = QStringLiteral("Cannot open %1: %2").arg(path, file.errorString());
        return config;
    }

    QJsonParseError parseError;
    const auto document = QJsonDocument::fromJson(file.readAll(), &parseError);
    if (document.isNull() || !document.isObject()) {
        if (error) *error = QStringLiteral("Invalid JSON in %1: %2").arg(path, parseError.errorString());
        return config;
    }

    const auto root = document.object();
    const auto gateway = root.value(QStringLiteral("gateway")).toObject();
    config.gatewayBaseUrl = text(gateway, "baseUrl", config.gatewayBaseUrl);
    config.gatewayRobotId = text(gateway, "robotId");
    config.gatewayTenantId = text(gateway, "tenantId", config.gatewayTenantId);
    config.gatewayApiKey = text(gateway, "apiKey");
    config.gatewayStatePollMs = number(gateway, "statePollMs", config.gatewayStatePollMs);
    config.gatewayTaskPollMs = number(gateway, "taskPollMs", config.gatewayTaskPollMs);
    config.gatewayTimeoutMs = number(gateway, "timeoutMs", config.gatewayTimeoutMs);

    const auto fleet = root.value(QStringLiteral("fleet")).toObject();
    config.fleetBaseUrl = text(fleet, "baseUrl");
    config.fleetAmrId = text(fleet, "amrId");
    config.fleetBearerToken = text(fleet, "bearerToken");
    config.fleetPollMs = number(fleet, "pollMs", config.fleetPollMs);
    config.fleetTimeoutMs = number(fleet, "timeoutMs", config.fleetTimeoutMs);

    const auto seer = root.value(QStringLiteral("seer")).toObject();
    config.seerHost = text(seer, "host");
    config.seerStatusPort = quint16(number(seer, "statusPort", config.seerStatusPort));
    config.seerProtocolVersion = quint16(number(seer, "protocolVersion", config.seerProtocolVersion));
    config.seerTimeoutMs = number(seer, "timeoutMs", config.seerTimeoutMs);
    config.seerMaxPayloadBytes = quint32(number(seer, "maxPayloadBytes", int(config.seerMaxPayloadBytes)));

    const auto ui = root.value(QStringLiteral("ui")).toObject();
    config.socketName = text(ui, "socketName", config.socketName);
    config.displayName = text(ui, "displayName", config.displayName);

    if (config.gatewayRobotId.isEmpty() && error)
        *error = QStringLiteral("gateway.robotId must be configured");
    return config;
}
