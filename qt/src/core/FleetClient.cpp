#include "FleetClient.h"

#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTimer>
#include <QUrl>

FleetClient::FleetClient(const AppConfig &config, QObject *parent)
    : QObject(parent), m_config(config)
{
}

void FleetClient::fetchJobProgress()
{
    if (m_config.fleetBaseUrl.isEmpty() || m_config.fleetAmrId.isEmpty()) return;
    const auto url = QUrl(m_config.fleetBaseUrl + QStringLiteral("/queue/check-queue/?amr_id=")
                          + QString::fromUtf8(QUrl::toPercentEncoding(m_config.fleetAmrId)));
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    if (!m_config.fleetBearerToken.isEmpty())
        request.setRawHeader("Authorization", "Bearer " + m_config.fleetBearerToken.toUtf8());
    auto *reply = m_network.get(request);
    QTimer::singleShot(m_config.fleetTimeoutMs, reply, [reply] {
        if (reply->isRunning()) reply->abort();
    });
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        const auto document = QJsonDocument::fromJson(reply->readAll());
        const bool ok = reply->error() == QNetworkReply::NoError && document.isObject();
        const QString error = ok ? QString() :
            (reply->error() == QNetworkReply::NoError
                 ? QStringLiteral("Fleet returned invalid JSON") : reply->errorString());
        if (ok) emit jobProgressReceived(document.object());
        if (m_available != ok || m_lastAvailabilityError != error) {
            m_available = ok;
            m_lastAvailabilityError = error;
            emit availabilityChanged(ok, error);
        }
        reply->deleteLater();
    });
}
