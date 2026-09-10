#include "UiBackend.h"

#include "IpcProtocol.h"

#include <QJsonArray>
#include <QUuid>
#include <QtMath>

UiBackend::UiBackend(const AppConfig &config, QObject *parent)
    : QObject(parent), m_config(config)
{
    m_reconnectTimer.setInterval(2000);
    connect(&m_reconnectTimer, &QTimer::timeout, this, &UiBackend::connectToCore);
    connect(&m_socket, &QLocalSocket::connected, this, [this] {
        m_reconnectTimer.stop();
        m_lastError.clear();
        send({{QStringLiteral("type"), QStringLiteral("request_snapshot")}});
        emit stateChanged();
    });
    connect(&m_socket, &QLocalSocket::disconnected, this, [this] {
        m_reconnectTimer.start();
        emit stateChanged();
    });
    connect(&m_socket, &QLocalSocket::errorOccurred, this, [this](QLocalSocket::LocalSocketError) {
        m_lastError = m_socket.errorString();
        if (!m_reconnectTimer.isActive()) m_reconnectTimer.start();
        emit stateChanged();
    });
    connect(&m_socket, &QLocalSocket::readyRead, this, [this] {
        m_buffer.append(m_socket.readAll());
        QString parseError;
        for (const auto &message : IpcProtocol::takeMessages(m_buffer, &parseError)) {
            const auto type = message.value(QStringLiteral("type")).toString();
            if (type == QLatin1String("snapshot")) {
                m_snapshot = message;
                emit stateChanged();
            } else if (type == QLatin1String("action_result")) {
                const auto accepted = message.value(QStringLiteral("accepted")).toBool();
                const auto error = message.value(QStringLiteral("error")).toString();
                if (!accepted) m_lastError = error;
                emit actionCompleted(message.value(QStringLiteral("action")).toString(), accepted, error);
                emit stateChanged();
            }
        }
        if (!parseError.isEmpty()) {
            m_lastError = parseError;
            emit stateChanged();
        }
    });
    connectToCore();
}

bool UiBackend::coreConnected() const { return m_socket.state() == QLocalSocket::ConnectedState; }
QJsonObject UiBackend::robot() const { return m_snapshot.value(QStringLiteral("robot")).toObject(); }
QJsonObject UiBackend::runtime() const { return m_snapshot.value(QStringLiteral("runtime")).toObject(); }
QJsonObject UiBackend::fleet() const { return m_snapshot.value(QStringLiteral("fleet")).toObject(); }

bool UiBackend::connectionUp(const QString &name) const
{
    return m_snapshot.value(QStringLiteral("connections")).toObject()
        .value(name).toObject().value(QStringLiteral("connected")).toBool();
}

QString UiBackend::robotName() const
{
    const auto name = robot().value(QStringLiteral("name")).toString();
    return name.isEmpty() ? m_snapshot.value(QStringLiteral("robotId")).toString(QStringLiteral("AMR")) : name;
}
bool UiBackend::robotOnline() const { return connectionUp(QStringLiteral("gateway")) && robot().value(QStringLiteral("online")).toBool(); }
bool UiBackend::fleetOnline() const { return connectionUp(QStringLiteral("fleet")); }
int UiBackend::batteryPercent() const { return qRound(robot().value(QStringLiteral("battery_pct")).toDouble()); }
bool UiBackend::charging() const { return robot().value(QStringLiteral("charging")).toBool(); }
QString UiBackend::currentPoi() const { return robot().value(QStringLiteral("poi_current")).toString(QStringLiteral("-")); }
QString UiBackend::targetPoi() const
{
    const auto live = runtime().value(QStringLiteral("target_point")).toString();
    return live.isEmpty() ? robot().value(QStringLiteral("poi_target")).toString() : live;
}
QString UiBackend::robotMode() const { return robot().value(QStringLiteral("mode")).toString(QStringLiteral("offline")); }
QString UiBackend::runtimeMode() const { return runtime().value(QStringLiteral("mode")).toString(QStringLiteral("idle")); }

QString UiBackend::taskTitle() const
{
    const auto job = fleet().value(QStringLiteral("job")).toObject();
    const auto name = job.value(QStringLiteral("name")).toString();
    if (!name.isEmpty()) return name;
    return runtimeMode() == QLatin1String("idle") ? QStringLiteral("No Active Task") : QStringLiteral("Robot Task");
}

QString UiBackend::taskDetail() const
{
    const auto subjob = fleet().value(QStringLiteral("current_subjob")).toObject();
    const auto step = subjob.value(QStringLiteral("name")).toString();
    if (!step.isEmpty()) return step;
    const auto target = targetPoi();
    if (!target.isEmpty()) return QStringLiteral("Destination: %1").arg(target);
    return robotOnline() ? QStringLiteral("Robot is ready to accept a new task") : QStringLiteral("Waiting for robot connection");
}

QVariantList UiBackend::stations() const { return m_snapshot.value(QStringLiteral("stations")).toArray().toVariantList(); }
QString UiBackend::lastError() const { return m_lastError; }

void UiBackend::connectToCore()
{
    if (m_socket.state() == QLocalSocket::UnconnectedState)
        m_socket.connectToServer(m_config.socketName);
}

void UiBackend::send(const QJsonObject &message)
{
    if (coreConnected()) m_socket.write(IpcProtocol::encode(message));
}

void UiBackend::sendAction(const QString &action, const QJsonObject &payload)
{
    send({
        {QStringLiteral("type"), QStringLiteral("action")},
        {QStringLiteral("action"), action},
        {QStringLiteral("requestId"), QUuid::createUuid().toString(QUuid::WithoutBraces)},
        {QStringLiteral("payload"), payload}
    });
}

void UiBackend::refreshStations() { send({{QStringLiteral("type"), QStringLiteral("refresh_stations")}}); }
void UiBackend::navigateTo(const QString &point) { sendAction(QStringLiteral("navigate"), {{QStringLiteral("point"), point}}); }
void UiBackend::pauseNavigation() { sendAction(QStringLiteral("pause_navigation")); }
void UiBackend::resumeNavigation() { sendAction(QStringLiteral("resume_navigation")); }
void UiBackend::cancelNavigation() { sendAction(QStringLiteral("cancel")); }
