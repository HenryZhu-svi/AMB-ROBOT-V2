#pragma once

#include <QByteArray>
#include <QJsonObject>
#include <QList>

namespace IpcProtocol {
QByteArray encode(const QJsonObject &message);
QList<QJsonObject> takeMessages(QByteArray &buffer, QString *error = nullptr);
}
