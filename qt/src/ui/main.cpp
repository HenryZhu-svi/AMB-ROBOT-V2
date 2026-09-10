#include "AppConfig.h"
#include "UiBackend.h"

#include <QCommandLineParser>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QCoreApplication::setOrganizationName(QStringLiteral("SVI"));
    QCoreApplication::setApplicationName(QStringLiteral("svi-amr-ui"));

    QCommandLineParser parser;
    parser.addHelpOption();
    parser.addOption({QStringLiteral("config"), QStringLiteral("Configuration file"), QStringLiteral("path"),
                      QStringLiteral("/etc/svi-amr/config.json")});
    parser.process(app);

    QString configError;
    const auto config = AppConfig::load(parser.value(QStringLiteral("config")), &configError);
    UiBackend backend(config);

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("backend"), &backend);
    engine.load(QUrl(QStringLiteral("qrc:/qt/qml/Svi/AmrUi/Main.qml")));
    if (engine.rootObjects().isEmpty()) return 1;
    return app.exec();
}
