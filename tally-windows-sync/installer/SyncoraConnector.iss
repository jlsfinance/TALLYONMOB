; SYNCORA Connector installer (Inno Setup 6)
; Build:  ISCC.exe installer\SyncoraConnector.iss
; Needs:  dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o publish\installer-input

#define AppName "SYNCORA Connector"
#define AppVersion "3.2.0"
#ifndef PublishDir
  #define PublishDir "..\publish\installer-input"
#endif
#define AppExe "SyncoraConnector.exe"

[Setup]
AppId={{9C4B7E51-2F4A-4C8D-9B3E-6A1D5F8E7C20}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Shaurya Ltd
AppPublisherURL=https://tallyonmobile.com
DefaultDirName={localappdata}\SyncoraConnector
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\publish\installer
OutputBaseFilename=SyncoraConnector-Setup-{#AppVersion}
SetupIconFile=..\app_icon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb"

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
