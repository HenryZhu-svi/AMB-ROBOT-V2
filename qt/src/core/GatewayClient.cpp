#include "GatewayClient.h"

#include <QJsonDocument>
#include <QNetworkReply>
#include <QSet>
#include <QTimer>
#include <QUrl>
#include <QUrlQuery>

GatewayClient::GatewayClient(const AppConfig &config, QObject *parent)
    : QObject(parent), m_config(config)
{
}

QNetworkRequest GatewayClient::requestFor(const QUrl &url) const
{
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    if (!m_config.gatewayApiKey.isEmpty())
        request.setRawHeader("X-API-Key", m_config.gatewayApiKey.toUtf8());
    return request;
}

void GatewayClient::fetchRobotState()
{
    if (m_config.gatewayRobotId.isEmpty()) return;
    const auto url = QUrl(m_config.gatewayBaseUrl + QStringLiteral("/robots/")
                          + QString::fromUtf8(QUrl::toPercentEncoding(m_config.gatewayRobotId)));
    auto *reply = m_network.get(requestFor(url));
    QTimer::singleShot(m_config.gatewayTimeoutMs, reply, [reply] {
        if (reply->isRunning()) reply->abort();
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const auto data = reply->readAll();
        const bool ok = reply->error() == QNetworkReply::NoError;
        QString error = ok ? QString() : reply->errorString();
        if (ok) {
            const auto document = QJsonDocument::fromJson(data);
            if (document.isObject()) {
                const auto root = document.object();
                auto state = root.value(QStringLiteral("state")).toObject();
                state.insert(QStringLiteral("name"), root.value(QStringLiteral("name")));
                state.insert(QStringLiteral("model"), root.value(QStringLiteral("model")));
                emit robotStateReceived(state);
            } else {
                error = QStringLiteral("Gateway returned invalid robot JSON");
            }
        }
        const bool available = error.isEmpty();
        if (m_available != available || m_lastAvailabilityError != error) {
            m_available = available;
            m_lastAvailabilityError = error;
            emit availabilityChanged(available, error);
        }
        reply->deleteLater();
    });
}

void GatewayClient::fetchTaskStatus()
{
    postCommand(QStringLiteral("query_task_status"), {}, QStringLiteral("task-poll"), true);
}

void GatewayClient::sendAction(const QString &action, const QJsonObject &payload, const QString &requestId)
{
    static const QSet<QString> allowed {
        QStringLiteral("navigate"), QStringLiteral("pause_navigation"),
        QStringLiteral("resume_navigation"), QStringLiteral("cancel")
    };
    if (!allowed.contains(action)) {
        emit actionResult(requestId, action, false, {}, QStringLiteral("Unsupported action"));
        return;
    }
    postCommand(action, payload, requestId, false);
}

void GatewayClient::postCommand(const QString &action, const QJsonObject &payload,
                                const QString &requestId, bool query)
{
    QJsonObject body {
        {QStringLiteral("type"), action},
        {QStringLiteral("tenant_id"), m_config.gatewayTenantId},
        {QStringLiteral("robot_id"), m_config.gatewayRobotId},
        {QStringLiteral("payload"), payload},
        {QStringLiteral("correlation_id"), requestId}
    };
    // Query results must never be cached. Actions use the UI request ID so a
    // reconnect cannot accidentally issue the same physical command twice.
    if (!query) body.insert(QStringLiteral("idempotency_key"), requestId);

    auto *reply = m_network.post(requestFor(QUrl(m_config.gatewayBaseUrl + QStringLiteral("/commands"))),
                                 QJsonDocument(body).toJson(QJsonDocument::Compact));
    QTimer::singleShot(m_config.gatewayTimeoutMs, reply, [reply] {
        if (reply->isRunning()) reply->abort();
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply, requestId, action, query] {
        const auto bytes = reply->readAll();
        const auto document = QJsonDocument::fromJson(bytes);
        const auto ack = document.isObject() ? document.object() : QJsonObject{};
        const bool httpOk = reply->error() == QNetworkReply::NoError;
        const bool accepted = httpOk && ack.value(QStringLiteral("accepted")).toBool(false);
        QString error;
        if (!httpOk) error = reply->errorString();
        else if (!accepted) error = ack.value(QStringLiteral("message")).toString(QStringLiteral("Command rejected"));

        const auto result = parseMessageObject(ack);
        if (query) {
            if (accepted) emit taskStatusReceived(result);
        } else {
            emit actionResult(requestId, action, accepted, ack, error);
        }
        reply->deleteLater();
    });
}

QJsonObject GatewayClient::parseMessageObject(const QJsonObject &ack)
{
    const auto message = ack.value(QStringLiteral("message"));
    if (message.isString()) {
        const auto document = QJsonDocument::fromJson(message.toString().toUtf8());
        if (document.isObject()) return document.object();
    }
    return ack.value(QStringLiteral("result")).toObject();
}
