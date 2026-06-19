[Setup]
AppId={{B8E3C7A1-4F2D-4E8B-9C6A-1D5E3F7B2A9C}
AppName=TallyLink
AppVersion=3.1.0
AppPublisher=TallySync
DefaultDirName={autopf}\TallyLink
DefaultGroupName=TallyLink
OutputDir=D:\New folder (2)\tallysyncapp\installer
OutputBaseFilename=TallyLink-Setup-3.1.0
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=D:\New folder (2)\tally-windows-sync\app_icon.ico
UninstallDisplayIcon={app}\TallyLink.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce
Name: "startup"; Description: "Start with Windows"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "D:\New folder (2)\tallysyncapp\TallyLink.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\New folder (2)\tally-windows-sync\appsettings.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\TallyLink"; Filename: "{app}\TallyLink.exe"
Name: "{group}\Uninstall TallyLink"; Filename: "{uninstallexe}"
Name: "{autodesktop}\TallyLink"; Filename: "{app}\TallyLink.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "TallyLink"; ValueData: """{app}\TallyLink.exe"" --minimized"; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\TallyLink.exe"; Description: "Launch TallyLink now"; Flags: nowait postinstall skipifsilent
