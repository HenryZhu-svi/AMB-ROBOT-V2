#pragma once

#include "AppConfig.h"

#include <QJsonArray>
#include <QObject>
#include <QTcpSocket>
#include <QTimer>

class SeerStationClient final : public QObject {
    Q_OBJECT
public:
    explicit SeerStationClient(const AppConfig &config, QObject *parent = nullptr);
    void fetchStations();

signals:
    void stationsReceived(const QJsonArray &stations);
    void failed(const QString &error);

private:
    void finishWithError(const QString &error);
    void parseAvailableData();
    QByteArray requestPacket() const;

    AppConfig m_config;
    QTcpSocket m_socket;
    QTimer m_timeout;
    QByteArray m_buffer;
    bool m_busy = false;
};
