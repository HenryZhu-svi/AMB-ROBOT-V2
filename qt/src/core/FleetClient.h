#pragma once

#include "AppConfig.h"

#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QObject>

class FleetClient final : public QObject {
    Q_OBJECT
public:
    explicit FleetClient(const AppConfig &config, QObject *parent = nullptr);
    void fetchJobProgress();

signals:
    void jobProgressReceived(const QJsonObject &progress);
    void availabilityChanged(bool available, const QString &error);

private:
    AppConfig m_config;
    QNetworkAccessManager m_network;
    bool m_available = false;
    QString m_lastAvailabilityError;
};
