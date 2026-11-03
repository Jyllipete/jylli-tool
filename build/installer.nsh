; Points Settings > Apps > Uninstall at the branded uninstaller.
; QuietUninstallString is left untouched so electron-builder's silent paths keep using NSIS directly.
!macro customInstall
  IfFileExists "$INSTDIR\Jylli Tool Uninstaller.exe" 0 +2
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString" '"$INSTDIR\Jylli Tool Uninstaller.exe" /$installMode'
!macroend
