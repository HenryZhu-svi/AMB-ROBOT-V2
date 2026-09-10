#pragma once

#include "AppConfig.h"

#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QObject>

class GatewayClient final : public QObject {
    Q_OBJECT
public:
    explicit GatewayClient(const AppConfig &config, QObject *parent = nullptr);

    void fetchRobotState();
    void fetchTaskStatus();
    void sendAction(const QString &action, const QJsonObject &payload, const QString &requestId);

signals:
    void robotStateReceived(const QJsonObject &state);
    void taskStatusReceived(const QJsonObject &status);
    void actionResult(const QString &requestId, const QString &action, bool accepted,
                      const QJsonObject &result, const QString &error);
    void availabilityChanged(bool available, const QString &error);

private:
    QNetworkRequest requestFor(const QUrl &url) const;
    void postCommand(const QString &action, const QJsonObject &payload,
                     const QString &requestId, bool query);
    static QJsonObject parseMessageObject(const QJsonObject &ack);

    AppConfig m_config;
    QNetworkAccessManager m_network;
    bool m_available = false;
    QString m_lastAvailabilityError;
};
