#include "AppConfig.h"
#include "CoreService.h"

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QDebug>

int main(int argc, char *argv[])
{
    QCoreApplication app(argc, argv);
    QCoreApplication::setOrganizationName(QStringLiteral("SVI"));
    QCoreApplication::setApplicationName(QStringLiteral("svi-amr-core"));
    QCoreApplication::setApplicationVersion(QStringLiteral("0.1.0"));

    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("SVI AMR background controller"));
    parser.addHelpOption();
    parser.addVersionOption();
    parser.addOption({QStringLiteral("config"), QStringLiteral("Configuration file"), QStringLiteral("path"),
                      QStringLiteral("/etc/svi-amr/config.json")});
    parser.process(app);

    QString configError;
    const auto config = AppConfig::load(parser.value(QStringLiteral("config")), &configError);
    if (!configError.isEmpty()) qWarning().noquote() << configError;

    CoreService service(config);
    QString startError;
    if (!service.start(&startError)) {
        qCritical().noquote() << startError;
        return 2;
    }
    return app.exec();
}
