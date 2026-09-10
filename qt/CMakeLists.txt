cmake_minimum_required(VERSION 3.21)

project(svi_amr_console VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Qt6 6.2 REQUIRED COMPONENTS Core Gui Network Qml Quick QuickControls2)

# qt_standard_project_setup() was added after the Qt 6.2 LTS release used by
# some deployed ARM64 devices. Keep the equivalent settings explicit so the
# same source configures on Qt 6.2 and newer versions.
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

add_library(svi_amr_common STATIC
    src/common/AppConfig.cpp
    src/common/AppConfig.h
    src/common/IpcProtocol.cpp
    src/common/IpcProtocol.h
)
target_link_libraries(svi_amr_common PUBLIC Qt6::Core Qt6::Network)
target_include_directories(svi_amr_common PUBLIC src/common)

qt_add_executable(svi-amr-core
    src/core/main.cpp
    src/core/CoreService.cpp
    src/core/CoreService.h
    src/core/GatewayClient.cpp
    src/core/GatewayClient.h
    src/core/FleetClient.cpp
    src/core/FleetClient.h
    src/core/SeerStationClient.cpp
    src/core/SeerStationClient.h
)
target_link_libraries(svi-amr-core PRIVATE svi_amr_common Qt6::Core Qt6::Network)

qt_add_executable(svi-amr-ui
    src/ui/main.cpp
    src/ui/UiBackend.cpp
    src/ui/UiBackend.h
)
target_link_libraries(svi-amr-ui PRIVATE svi_amr_common Qt6::Core Qt6::Gui Qt6::Network Qt6::Qml Qt6::Quick Qt6::QuickControls2)

set_source_files_properties(../src/assets/amr.png PROPERTIES QT_RESOURCE_ALIAS assets/amr.png)
set_source_files_properties(../src/assets/svi_logo.svg PROPERTIES QT_RESOURCE_ALIAS assets/svi_logo.svg)
set_source_files_properties(qml/Main.qml PROPERTIES QT_RESOURCE_ALIAS Main.qml)
set_source_files_properties(qml/HomePage.qml PROPERTIES QT_RESOURCE_ALIAS HomePage.qml)
set_source_files_properties(qml/DrivePage.qml PROPERTIES QT_RESOURCE_ALIAS DrivePage.qml)
qt_add_qml_module(svi-amr-ui
    URI Svi.AmrUi
    VERSION 1.0
    RESOURCE_PREFIX /qt/qml
    QML_FILES
        qml/Main.qml
        qml/HomePage.qml
        qml/DrivePage.qml
    RESOURCES
        ../src/assets/amr.png
        ../src/assets/svi_logo.svg
)

include(GNUInstallDirs)
install(TARGETS svi-amr-core svi-amr-ui RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR})
install(FILES config/svi-amr.json.example DESTINATION /etc/svi-amr RENAME config.json)
install(FILES packaging/svi-amr-core.service packaging/svi-amr-ui.service DESTINATION /lib/systemd/system)

set(CPACK_GENERATOR "DEB")
set(CPACK_PACKAGE_NAME "svi-amr-console")
set(CPACK_PACKAGE_CONTACT "SVI Engineering")
set(CPACK_DEBIAN_PACKAGE_DEPENDS "qml6-module-qtquick, qml6-module-qtquick-controls, qml6-module-qtquick-layouts, libqt6svg6")
set(CPACK_DEBIAN_FILE_NAME DEB-DEFAULT)
set(CPACK_DEBIAN_PACKAGE_CONTROL_EXTRA "${CMAKE_CURRENT_SOURCE_DIR}/packaging/conffiles")
include(CPack)
