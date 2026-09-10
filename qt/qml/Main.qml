import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: window
    width: 1280
    height: 800
    visible: true
    color: "#eaf1f4"
    title: backend.robotName

    property bool driving: backend.runtimeMode === "running"
                           || backend.runtimeMode === "waiting"
                           || backend.runtimeMode === "suspended"

    Loader {
        anchors.fill: parent
        sourceComponent: window.driving ? drivePage : homePage
    }

    Component { id: homePage; HomePage {} }
    Component { id: drivePage; DrivePage {} }

    Rectangle {
        visible: !backend.coreConnected
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 44
        color: "#a82222"
        z: 100
        Text {
            anchors.centerIn: parent
            text: "Control service disconnected — reconnecting"
            color: "white"
            font.pixelSize: 18
            font.weight: Font.DemiBold
        }
    }
}
