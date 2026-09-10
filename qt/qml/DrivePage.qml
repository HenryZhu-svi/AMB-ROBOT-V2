import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: drive
    readonly property bool suspended: backend.runtimeMode === "suspended"

    Rectangle { anchors.fill: parent; color: "#050708" }

    MouseArea {
        anchors.fill: parent
        enabled: !drive.suspended
        onClicked: backend.pauseNavigation()
    }

    Row {
        id: eyes
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        anchors.verticalCenterOffset: -45
        spacing: 90
        visible: !drive.suspended
        Repeater {
            model: 2
            Rectangle {
                width: 96
                height: 178
                radius: 48
                color: "transparent"
                border.width: 14
                border.color: "white"
            }
        }
        SequentialAnimation on x {
            running: eyes.visible
            loops: Animation.Infinite
            NumberAnimation { from: (drive.width - eyes.width) / 2 - 42; to: (drive.width - eyes.width) / 2 + 42; duration: 850; easing.type: Easing.InOutSine }
            NumberAnimation { from: (drive.width - eyes.width) / 2 + 42; to: (drive.width - eyes.width) / 2 - 42; duration: 850; easing.type: Easing.InOutSine }
        }
    }

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 54
        spacing: 10
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: drive.suspended ? "Navigation Paused" : "Moving to " + (backend.targetPoi || "destination")
            color: "white"
            font.pixelSize: 30
            font.bold: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: drive.suspended ? backend.taskDetail : "Tap anywhere to pause"
            color: "#a9b4bc"
            font.pixelSize: 17
        }
        Row {
            visible: drive.suspended
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 18
            Button { text: "Resume"; width: 190; height: 58; onClicked: backend.resumeNavigation() }
            Button { text: "Cancel Task"; width: 190; height: 58; onClicked: cancelDialog.open() }
        }
    }

    Dialog {
        id: cancelDialog
        anchors.centerIn: parent
        modal: true
        title: "Cancel current task?"
        standardButtons: Dialog.Yes | Dialog.No
        onAccepted: backend.cancelNavigation()
        Label { text: "The robot will stop its current navigation task."; padding: 20 }
    }
}
