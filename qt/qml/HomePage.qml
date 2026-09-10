import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: page
    readonly property color navy: "#103955"
    readonly property color muted: "#718395"
    readonly property color card: "#ffffff"

    Rectangle {
        anchors.fill: parent
        color: "#eaf1f4"
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 30
        spacing: 18

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 98
            radius: 24
            color: page.card
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 26
                anchors.rightMargin: 28
                spacing: 18
                Image {
                    source: "assets/svi_logo.svg"
                    Layout.preferredWidth: 82
                    Layout.preferredHeight: 62
                    fillMode: Image.PreserveAspectFit
                }
                ColumnLayout {
                    spacing: 1
                    Text { text: backend.robotName; color: page.navy; font.pixelSize: 27; font.bold: true }
                    Text { text: "Autonomous Mobile Robot"; color: page.muted; font.pixelSize: 15; font.letterSpacing: 1.5 }
                }
                Item { Layout.fillWidth: true }
                StatusItem { title: "Robot"; value: backend.robotOnline ? backend.robotMode : "Offline"; active: backend.robotOnline }
                StatusItem { title: "Fleet"; value: backend.fleetOnline ? "Online" : "Offline"; active: backend.fleetOnline }
                Text { text: backend.batteryPercent + "%"; color: page.navy; font.pixelSize: 22; font.bold: true }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 18

            Rectangle {
                Layout.preferredWidth: 420
                Layout.fillHeight: true
                radius: 28
                color: page.card
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 28
                    Text { text: "ROBOT"; color: "#7f99ac"; font.pixelSize: 13; font.bold: true; font.letterSpacing: 3 }
                    Image {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        source: "assets/amr.png"
                        fillMode: Image.PreserveAspectFit
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        InfoTile { Layout.fillWidth: true; label: "Device"; value: backend.robotName }
                        InfoTile { Layout.fillWidth: true; label: "Current POI"; value: backend.currentPoi }
                    }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 18
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 180
                    radius: 28
                    color: page.card
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 28
                        Text { text: "CURRENT TASK"; color: "#7f99ac"; font.pixelSize: 13; font.bold: true; font.letterSpacing: 3 }
                        Text { text: backend.taskTitle; color: page.navy; font.pixelSize: 38; font.bold: true }
                        Text { text: backend.taskDetail; color: page.muted; font.pixelSize: 17 }
                    }
                }
                GridLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    columns: 2
                    columnSpacing: 18
                    rowSpacing: 18
                    ActionCard { title: "Fleet Tasks"; detail: "View assigned Fleet work"; iconText: "F"; accent: "#1685c7"; enabled: backend.fleetOnline }
                    ActionCard {
                        title: "Go to Point"; detail: backend.stations.length + " destinations available"
                        iconText: "⌖"; accent: "#13a8a2"; enabled: backend.robotOnline
                        onClicked: pointDialog.open()
                    }
                    ActionCard { title: "Go Charge"; detail: "Charging point configuration follows"; iconText: "ϟ"; accent: "#d88b00"; enabled: false }
                    ActionCard { title: "Return to Standby"; detail: "Standby point configuration follows"; iconText: "↩"; accent: "#596fc7"; enabled: false }
                }
            }
        }
    }

    Dialog {
        id: pointDialog
        anchors.centerIn: parent
        width: Math.min(620, page.width - 80)
        height: Math.min(650, page.height - 80)
        modal: true
        title: "Go to Point"
        standardButtons: Dialog.Cancel
        ColumnLayout {
            anchors.fill: parent
            spacing: 10
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Choose a destination from the current robot map."; Layout.fillWidth: true }
                Button { text: "Reload"; onClicked: backend.refreshStations() }
            }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 8
                model: backend.stations
                delegate: Button {
                    required property var modelData
                    width: ListView.view.width
                    height: 58
                    text: modelData.name + (modelData.desc ? "  ·  " + modelData.desc : "")
                    onClicked: {
                        backend.navigateTo(modelData.id)
                        pointDialog.close()
                    }
                }
            }
        }
    }

    component StatusItem: RowLayout {
        property string title
        property string value
        property bool active
        spacing: 8
        Rectangle { width: 12; height: 12; radius: 6; color: active ? "#3dbb78" : "#d8962a" }
        Text { text: title; color: page.muted; font.pixelSize: 16 }
        Text { text: value; color: page.navy; font.pixelSize: 17; font.bold: true }
    }

    component InfoTile: Rectangle {
        property string label
        property string value
        height: 72
        radius: 18
        color: "#f1f6f8"
        Column {
            anchors.centerIn: parent
            spacing: 4
            Text { text: label; color: page.muted; font.pixelSize: 13 }
            Text { text: value; color: page.navy; font.pixelSize: 19; font.bold: true }
        }
    }

    component ActionCard: Rectangle {
        id: actionCard
        property string title
        property string detail
        property string iconText
        property color accent
        signal clicked()
        Layout.fillWidth: true
        Layout.fillHeight: true
        radius: 24
        color: enabled ? page.card : "#f2f5f6"
        opacity: enabled ? 1 : 0.6
        RowLayout {
            anchors.fill: parent
            anchors.margins: 26
            spacing: 18
            Rectangle {
                width: 56; height: 56; radius: 16
                color: Qt.rgba(actionCard.accent.r, actionCard.accent.g, actionCard.accent.b, 0.12)
                Text { anchors.centerIn: parent; text: actionCard.iconText; color: actionCard.accent; font.pixelSize: 25; font.bold: true }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: actionCard.title; color: page.navy; font.pixelSize: 21; font.bold: true }
                Text { text: actionCard.detail; color: page.muted; font.pixelSize: 14 }
            }
            Text { text: "›"; color: "#8ba0ae"; font.pixelSize: 30 }
        }
        MouseArea { anchors.fill: parent; enabled: actionCard.enabled; onClicked: actionCard.clicked() }
    }
}
