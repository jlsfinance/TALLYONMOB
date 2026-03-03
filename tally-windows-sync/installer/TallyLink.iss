; TallyLink Installer Script for Inno Setup 6
; Creates a proper Windows installer with license, path selection, shortcuts, etc.

#define AppName "TallyLink"
#define AppVersion "2.7.0"
#define AppPublisher "TallyLink"
#define AppURL "https://tallyonmob.vercel.app"
#define AppExeName "TallyLink.exe"
#define AppDescription "Sync Tally ERP data to Cloud for Mobile & Web access"

[Setup]
; App identity
AppId={{F8A2B3C4-D5E6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}

; Install location
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
DisableProgramGroupPage=yes

; License
LicenseFile=LICENSE.txt

; Output
OutputDir=Output
OutputBaseFilename=TallyLink_Setup_v{#AppVersion}
; Note: SetupIconFile requires a valid .ico with proper Windows icon format
; SetupIconFile=..\app_icon.ico

; Compression
Compression=lzma2/ultra64
SolidCompression=yes

; UI
WizardStyle=modern
WizardSizePercent=110

; Privileges
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog

; Misc
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppDescription}
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Restart handling
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "startupicon"; Description: "Start TallyLink when Windows starts"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
; Main exe (published single file)
Source: "..\..\tallysyncapp\TallyLink.exe"; DestDir: "{app}"; Flags: ignoreversion
; Config file
Source: "..\..\tallysyncapp\appsettings.json"; DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist
; Icon (embedded in the exe already)

[Icons]
; Start Menu
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
; Desktop
Name: "{commondesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
; Startup
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Parameters: "--minimized"; Tasks: startupicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Kill the app before uninstalling
Filename: "taskkill"; Parameters: "/F /IM {#AppExeName}"; Flags: runhidden; RunOnceId: "KillApp"

[UninstallDelete]
; Remove Logs and data created during usage
Type: dirifempty; Name: "{app}\Logs"
Type: dirifempty; Name: "{app}\Data"
Type: files; Name: "{app}\sync.db"
Type: files; Name: "{app}\startup_error.txt"

[Code]
// Custom code for install/uninstall logic

function InitializeSetup(): Boolean;
begin
  Result := True;
  // Check if app is already running
  if CheckForMutexes('{#AppName}_Mutex') then
  begin
    MsgBox('{#AppName} is currently running. Please close it before installing.', mbError, MB_OK);
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Create Logs directory
    ForceDirectories(ExpandConstant('{app}\Logs'));
  end;
end;
