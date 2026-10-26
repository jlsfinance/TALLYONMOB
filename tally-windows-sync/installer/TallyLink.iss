; ============================================================================
; TallyLink — Inno Setup 6.x installer script
; ============================================================================
; Mirrors the deployment behaviour of the reference competitor
; ("LiveKeeping Data Connector" v3.2.1, Inno Setup 6.7.0 Unicode) while
; adapting every identity value to THIS product:
;
;   AppName        TallyLink
;   Publisher      TallySync   (Company=TallySync, Product=TallySync - Tally Data Sync)
;   Version        2.0.1
;   Executable     TallyLink.exe
;   Icon           app_icon.ico
;
; Properties carried over from the reference:
;   * per-user install under {localappdata}  -> no administrator rights needed
;   * PrivilegesRequired=lowest             -> no UAC elevation prompt
;   * DisableDirPage=yes / DisableProgramGroupPage=yes
;   * AppMutex for single-instance enforcement
;   * Start Menu + Desktop shortcuts
;   * [Registry] autostart entry using the /auto argument
;   * first-run [Run] entry using the /installation@1 argument
;   * [UninstallDelete] removing the app's local data folders
;   * modern light wizard style
;
; The script expects the self-contained single-file publish output in the
; "publish" folder next to this script, produced by build-installer.ps1.
; ============================================================================

[Setup]
; --- Product identity -------------------------------------------------------
AppName=TallyLink
; AppId must be stable across releases so upgrades replace in place.
AppId={{7B1D4A6E-2C9F-4E31-9A5D-6F0C8B3E5A27}
AppVersion=2.0.2
AppVerName=TallyLink 2.0.1
AppPublisher=TallySync
AppPublisherURL=https://tallysync.example.com
AppSupportURL=https://tallysync.example.com/support
AppUpdatesURL=https://tallysync.example.com/downloads
AppCopyright=Copyright (C) 2026 TallySync

; --- Executable / display ---------------------------------------------------
UninstallDisplayName=TallyLink
UninstallDisplayIcon={app}\TallyLink.exe

; --- Single instance --------------------------------------------------------
; Mirrors the reference AppMutex=LKDataConnector,Global\LKDataConnector.
; Inno checks this before setup starts; the runtime SingleInstanceGuard
; (Services\SingleInstanceGuard.cs) covers launching a second copy of the app.
AppMutex=TallyLink,Global\TallyLink

; --- Per-user, no-admin install --------------------------------------------
; {localappdata} = %LOCALAPPDATA%  ->  C:\Users\<user>\AppData\Local
DefaultDirName={localappdata}\TallySync\TallyLink
DefaultGroupName=TallyLink
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UsePreviousAppDir=yes

; --- Wizard pages / style ---------------------------------------------------
DisableDirPage=yes
DisableProgramGroupPage=yes
WizardStyle=modern light
; ShowLanguageDialog is off: we ship English only (see [Languages]).

; --- Misc -------------------------------------------------------------------
Compression=lzma2/ultra64
SolidCompression=yes
OutputBaseFilename=TallyLink-Setup
OutputDir=output
; TallyLink is a .NET 8 self-contained win-x64 app: require a 64-bit OS.
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no

[Files]
; The single-file self-contained publish output. One file carries the whole app,
; so the [Files] section stays short.
Source: "..\publish\TallyLink.exe"; DestDir: "{app}"; Flags: ignoreversion
; Optional debug symbols — silently skipped when the pdb is not published.
Source: "..\publish\TallyLink.pdb"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
; Brand icon, referenced by the shortcuts below.
Source: "..\app_icon.ico"; DestDir: "{app}"; DestName: "app_icon.ico"; Flags: ignoreversion

[Registry]
; --- Run at login (per-user, HKCU — never needs admin) ----------------------
; Mirrors the reference entry:
;   HKCU\Software\Microsoft\Windows\CurrentVersion\Run
;   ValueName "LKDataConnector" -> "<exe>" /auto
; We use value name "TallyLink" with the /auto switch. Services\StartupService.cs
; keeps this entry in sync with the user's in-app preference.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "TallyLink"; ValueData: """{app}\TallyLink.exe"" /auto"; Flags: uninsdeletevalue

; --- "Installed" marker (parity with reference TDCInstalled) ----------------
Root: HKCU; Subkey: "Software\TallySync"; ValueType: string; ValueName: "TallyLinkInstalled"; ValueData: "1"; Flags: uninsdeletekey

[Run]
; --- First run right after install -----------------------------------------
; Mirrors the competitor's "/installation@1" first-run switch.
Filename: "{app}\TallyLink.exe"; Parameters: "/installation@1"; Description: "{cm:LaunchProgram,TallyLink}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Belt-and-braces cleanup: the app may still be running (and therefore locking
; files) when uninstall starts, so force-remove the install directory.
Filename: "{cmd}"; Parameters: "/C RMDir /S /Q ""{app}"""; Flags: runhidden waituntilterminated

[Icons]
; --- Start Menu + Desktop shortcuts (parity with reference) -----------------
Name: "{group}\TallyLink"; Filename: "{app}\TallyLink.exe"; IconFilename: "{app}\app_icon.ico"
Name: "{group}\Uninstall TallyLink"; Filename: "{uninstallexe}"; IconFilename: "{app}\app_icon.ico"
Name: "{autodesktop}\TallyLink"; Filename: "{app}\TallyLink.exe"; IconFilename: "{app}\app_icon.ico"; Tasks: desktopicon

[Tasks]
; Ask (but do not force) for a desktop shortcut.
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[UninstallDelete]
; Remove the app's local data folders, mirroring the reference script's
;   Type: filesandordirs; Name: "{localappdata}\LKDataConnector"
; TallyLink stores its session under %LOCALAPPDATA%\TallySync\ (AuthService.cs)
; and its offline queue under %LOCALAPPDATA%\TallyLink\.
Type: filesandordirs; Name: "{localappdata}\TallyLink"
Type: filesandordirs; Name: "{localappdata}\TallySync"
Type: filesandordirs; Name: "{localappdata}\TallySync_TallyLink"

[CustomMessages]
; English entries so the script compiles cleanly (same set as the reference).
english.NameAndVersion=%1 version %2
english.AdditionalIcons=Additional shortcuts:
english.CreateDesktopIcon=Create a &desktop shortcut
english.CreateQuickLaunchIcon=Create a &Quick Launch shortcut
english.ProgramOnTheWeb=%1 on the Web
english.UninstallProgram=Uninstall %1
english.LaunchProgram=Launch %1
english.AssocFileExtension=&Associate %1 with the %2 file extension
english.AssocingFileExtension=Associating %1 with the %2 file extension...
english.AutoStartProgramGroupDescription=Startup:
english.AutoStartProgram=Automatically start %1
english.AddonHostProgramNotFound=%1 could not be located in the folder you selected.%n%nDo you want to continue anyway?
UninstallingProgressLabel=Uninstalling TallyLink...

[Languages]
; English only. The default English language file ships with Inno Setup 6.
Name: "english"; MessagesFile: "compiler:Default.isl"
