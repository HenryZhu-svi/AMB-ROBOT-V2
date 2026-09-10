#include "SeerStationClient.h"

#include <QJsonDocument>
#include <QJsonObject>

namespace {
void appendLe16(QByteArray &bytes, quint16 value)
{
    bytes.append(char(value & 0xff));
    bytes.append(char((value >> 8) & 0xff));
}
void appendLe32(QByteArray &bytes, quint32 value)
{
    for (int shift = 0; shift < 32; shift += 8) bytes.append(char((value >> shift) & 0xff));
}

quint32 readLe32(const QByteArray &bytes, int offset)
{
    return quint32(quint8(bytes[offset]))
        | (quint32(quint8(bytes[offset + 1])) << 8)
        | (quint32(quint8(bytes[offset + 2])) << 16)
        | (quint32(quint8(bytes[offset + 3])) << 24);
}
}

SeerStationClient::SeerStationClient(const AppConfig &config, QObject *parent)
    : QObject(parent), m_config(config)
{
    m_timeout.setSingleShot(true);
    connect(&m_timeout, &QTimer::timeout, this, [this] { finishWithError(QStringLiteral("SEER station request timed out")); });
    connect(&m_socket, &QTcpSocket::connected, this, [this] { m_socket.write(requestPacket()); });
    connect(&m_socket, &QTcpSocket::readyRead, this, [this] {
        m_buffer.append(m_socket.readAll());
        parseAvailableData();
    });
    connect(&m_socket, &QTcpSocket::errorOccurred, this, [this](QAbstractSocket::SocketError) {
        if (m_busy) finishWithError(m_socket.errorString());
    });
}

void SeerStationClient::fetchStations()
{
    if (m_busy || m_config.seerHost.isEmpty()) return;
    m_busy = true;
    m_buffer.clear();
    m_timeout.start(m_config.seerTimeoutMs);
    m_socket.connectToHost(m_config.seerHost, m_config.seerStatusPort);
}

QByteArray SeerStationClient::requestPacket() const
{
    QByteArray packet;
    packet.reserve(12);
    packet.append(char(0x5a));
    packet.append(char(0x01));
    appendLe16(packet, m_config.seerProtocolVersion);
    appendLe32(packet, 1301U);
    appendLe32(packet, 0U);
    return packet;
}

void SeerStationClient::parseAvailableData()
{
    if (m_buffer.size() < 12) return;
    if (quint8(m_buffer[0]) != 0x5a || quint8(m_buffer[1]) != 0x01) {
        finishWithError(QStringLiteral("Invalid SEER packet marker"));
        return;
    }
    const quint32 payloadSize = readLe32(m_buffer, 8);
    if (payloadSize > m_config.seerMaxPayloadBytes) {
        finishWithError(QStringLiteral("SEER payload exceeds configured limit"));
        return;
    }
    if (m_buffer.size() < 12 + int(payloadSize)) return;

    const auto document = QJsonDocument::fromJson(m_buffer.mid(12, payloadSize));
    if (!document.isObject()) {
        finishWithError(QStringLiteral("SEER station payload is not valid JSON"));
        return;
    }
    const auto root = document.object();
    if (root.contains(QStringLiteral("ret_code")) && root.value(QStringLiteral("ret_code")).toInt() != 0) {
        finishWithError(root.value(QStringLiteral("err_msg")).toString(QStringLiteral("SEER rejected station query")));
        return;
    }

    QJsonArray result;
    for (const auto &entry : root.value(QStringLiteral("stations")).toArray()) {
        const auto station = entry.toObject();
        const auto id = station.value(QStringLiteral("id")).toString();
        if (id.isEmpty()) continue;
        QJsonObject point {
            {QStringLiteral("id"), id},
            {QStringLiteral("name"), id},
            {QStringLiteral("type"), station.value(QStringLiteral("type")).toString(QStringLiteral("LocationMark"))},
            {QStringLiteral("x"), station.value(QStringLiteral("x"))},
            {QStringLiteral("y"), station.value(QStringLiteral("y"))},
            {QStringLiteral("r"), station.value(QStringLiteral("r"))},
            {QStringLiteral("desc"), station.value(QStringLiteral("desc")).toString()}
        };
        result.append(point);
    }

    m_timeout.stop();
    m_socket.disconnectFromHost();
    m_busy = false;
    emit stationsReceived(result);
}

void SeerStationClient::finishWithError(const QString &error)
{
    m_timeout.stop();
    m_socket.abort();
    m_busy = false;
    emit failed(error);
}
