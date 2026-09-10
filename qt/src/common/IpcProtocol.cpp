#include "IpcProtocol.h"

#include <QJsonDocument>
#include <QJsonParseError>

QByteArray IpcProtocol::encode(const QJsonObject &message)
{
    return QJsonDocument(message).toJson(QJsonDocument::Compact) + '\n';
}
QList<QJsonObject> IpcProtocol::takeMessages(QByteArray &buffer, QString *error)
{
    QList<QJsonObject> messages;
    while (true) {
        const auto newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const auto line = buffer.left(newline).trimmed();
        buffer.remove(0, newline + 1);
        if (line.isEmpty()) continue;

        QJsonParseError parseError;
        const auto document = QJsonDocument::fromJson(line, &parseError);
        if (!document.isObject()) {
            if (error) *error = parseError.errorString();
            continue;
        }
        messages.append(document.object());
    }
    return messages;
}
