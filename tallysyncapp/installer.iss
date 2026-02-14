; Inno Setup Script for LiveKeeping Tally Sync
; Professional Installer with Icon, License, and Desktop Shortcut

[Setup]
AppId={{D3B2A1E4-7C9F-4A9B-B8D2-E4F5A6B7C8D9}
AppName=TallyLink Sync
AppVersion=2.0.1
AppPublisher=Shaurya Tech Sol
AppPublisherURL=https://shauryatechsol.com
AppComments=Finance & Accounting Sync Tool
DefaultDirName={autopf}\TallyLink\Sync
DefaultGroupName=TallyLink Sync
AllowNoIcons=yes
LicenseFile=LICENSE.txt
; Set the output folder and filename
OutputDir=setup
OutputBaseFilename=TallyLinkSetup
; SetupIconFile=app_icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Source files from the current directory
Source: "TallyLink.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "installer.iss,setup,Output,*.pdb,*.ipdb,*.iobj"
; NOTE: Exclude the exe itself from secondary copy if already included in publish\*
Source: "appsettings.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\TallyLink Sync"; Filename: "{app}\TallyLink.exe"
Name: "{autodesktop}\TallyLink Sync"; Filename: "{app}\TallyLink.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\TallyLink.exe"; Description: "{cm:LaunchProgram,TallyLink Sync}"; Flags: nowait postinstall skipifsilent
