#pragma once

#include "AppConfig.h"

#include <QByteArray>
#include <QJsonObject>
#include <QLocalSocket>
#include <QObject>
#include <QTimer>
#include <QVariantList>

class UiBackend final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool coreConnected READ coreConnected NOTIFY stateChanged)
    Q_PROPERTY(QString robotName READ robotName NOTIFY stateChanged)
    Q_PROPERTY(bool robotOnline READ robotOnline NOTIFY stateChanged)
    Q_PROPERTY(bool fleetOnline READ fleetOnline NOTIFY stateChanged)
    Q_PROPERTY(int batteryPercent READ batteryPercent NOTIFY stateChanged)
    Q_PROPERTY(bool charging READ charging NOTIFY stateChanged)
    Q_PROPERTY(QString currentPoi READ currentPoi NOTIFY stateChanged)
    Q_PROPERTY(QString targetPoi READ targetPoi NOTIFY stateChanged)
    Q_PROPERTY(QString robotMode READ robotMode NOTIFY stateChanged)
    Q_PROPERTY(QString runtimeMode READ runtimeMode NOTIFY stateChanged)
    Q_PROPERTY(QString taskTitle READ taskTitle NOTIFY stateChanged)
    Q_PROPERTY(QString taskDetail READ taskDetail NOTIFY stateChanged)
    Q_PROPERTY(QVariantList stations READ stations NOTIFY stateChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY stateChanged)

public:
    explicit UiBackend(const AppConfig &config, QObject *parent = nullptr);

    bool coreConnected() const;
    QString robotName() const;
    bool robotOnline() const;
    bool fleetOnline() const;
    int batteryPercent() const;
    bool charging() const;
    QString currentPoi() const;
    QString targetPoi() const;
    QString robotMode() const;
    QString runtimeMode() const;
    QString taskTitle() const;
    QString taskDetail() const;
    QVariantList stations() const;
    QString lastError() const;

    Q_INVOKABLE void refreshStations();
    Q_INVOKABLE void navigateTo(const QString &point);
    Q_INVOKABLE void pauseNavigation();
    Q_INVOKABLE void resumeNavigation();
    Q_INVOKABLE void cancelNavigation();

signals:
    void stateChanged();
    void actionCompleted(const QString &action, bool accepted, const QString &error);

private:
    void connectToCore();
    void send(const QJsonObject &message);
    void sendAction(const QString &action, const QJsonObject &payload = {});
    QJsonObject robot() const;
    QJsonObject runtime() const;
    QJsonObject fleet() const;
    bool connectionUp(const QString &name) const;

    AppConfig m_config;
    QLocalSocket m_socket;
    QTimer m_reconnectTimer;
    QByteArray m_buffer;
    QJsonObject m_snapshot;
    QString m_lastError;
};
