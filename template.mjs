export const workflowPath = '.github/workflows/vibedock-build.yml'

const workflow = String.raw`name: Pacchetti installabili
on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  package:
    timeout-minutes: 40
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows
            runner: windows-2025
          - platform: macos
            runner: macos-15
          - platform: android
            runner: ubuntu-24.04
          - platform: linux
            runner: ubuntu-24.04
    runs-on: \${{ matrix.runner }}
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          persist-credentials: false
      - name: Installa Flutter
        shell: bash
        run: |
          git clone --depth 1 --branch 3.44.9 https://github.com/flutter/flutter.git "$RUNNER_TEMP/flutter"
          echo "$RUNNER_TEMP/flutter/bin" >> "$GITHUB_PATH"
      - name: Installa dipendenze Linux
        if: matrix.platform == 'linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y clang cmake ninja-build pkg-config libgtk-3-dev liblzma-dev
      - name: Installa Inno Setup
        if: matrix.platform == 'windows'
        shell: pwsh
        run: choco install innosetup --yes --no-progress
      - name: Prepara e compila
        working-directory: vibedock_app
        shell: bash
        env:
          PLATFORM: \${{ matrix.platform }}
        run: |
          set -euo pipefail
          export CI=true
          if [ "$PLATFORM" = android ]; then
            export JAVA_HOME="$JAVA_HOME_17_X64"
            export PATH="$JAVA_HOME/bin:$PATH"
          fi
          flutter create --no-pub --project-name vibedock_app --platforms="$PLATFORM" .
          flutter pub get
          flutter analyze lib
          mkdir -p ../packages
          case "$PLATFORM" in
            android)
              flutter build apk --debug
              cp build/app/outputs/flutter-apk/app-debug.apk ../packages/
              ;;
            windows)
              flutter build windows --release
              "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" installer.iss
              ;;
            macos)
              flutter build macos --release
              shopt -s nullglob
              apps=(build/macos/Build/Products/Release/*.app)
              test "\${#apps[@]}" = 1
              mkdir -p "$RUNNER_TEMP/dmg"
              ditto "\${apps[0]}" "$RUNNER_TEMP/dmg/$(basename "\${apps[0]}")"
              ln -s /Applications "$RUNNER_TEMP/dmg/Applications"
              hdiutil create -volname VibeDockApp -srcfolder "$RUNNER_TEMP/dmg" -format UDZO ../packages/VibeDockApp-macOS-arm64.dmg
              ;;
            linux)
              flutter build linux --release
              mkdir -p deb/DEBIAN deb/usr/bin deb/usr/lib/vibedock-app deb/usr/share/applications
              cp -a build/linux/x64/release/bundle/. deb/usr/lib/vibedock-app/
              ln -s ../lib/vibedock-app/vibedock_app deb/usr/bin/vibedock-app
              printf '%s\n' 'Package: vibedock-app' 'Version: 1.0.0' 'Architecture: amd64' 'Maintainer: VibeDock App' 'Depends: libgtk-3-0t64 | libgtk-3-0, liblzma5, libstdc++6' 'Description: App Flutter' > deb/DEBIAN/control
              printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=VibeDock App' 'Exec=/usr/bin/vibedock-app' 'Terminal=false' > deb/usr/share/applications/vibedock-app.desktop
              dpkg-deb --root-owner-group --build deb ../packages/vibedock-app-linux-amd64.deb
              ;;
          esac
      - name: Carica pacchetto
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
        with:
          name: pacchetto-\${{ matrix.platform }}
          path: packages/*
          if-no-files-found: error
`.replaceAll('\\${', '${')

export const starter = [
  {path: workflowPath, content: workflow},
  {path: 'vibedock_app/installer.iss', content: String.raw`[Setup]
AppId=VibeDockFlutterApp
AppName=VibeDock App
AppVersion=1.0.0
DefaultDirName={localappdata}\Programs\VibeDock App
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\packages
OutputBaseFilename=VibeDockApp-Windows-x64-Setup

[Files]
Source: "build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\VibeDock App"; Filename: "{app}\vibedock_app.exe"
`},
  {path: 'vibedock_app/pubspec.yaml', content: `name: vibedock_app
description: App Flutter creata da VibeDock.
publish_to: none
version: 1.0.0+1
environment:
  sdk: '>=3.8.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^6.0.0
flutter:
  uses-material-design: true
`},
  {path: 'vibedock_app/lib/main.dart', content: `import 'package:flutter/material.dart';

void main() => runApp(const VibeDockApp());

class VibeDockApp extends StatelessWidget {
  const VibeDockApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'La mia app',
      theme: ThemeData(colorSchemeSeed: Colors.teal),
      home: Scaffold(
        appBar: AppBar(title: const Text('La mia app')),
        body: const Center(child: Text('La tua app inizia qui.')),
      ),
    );
  }
}
`}
]
