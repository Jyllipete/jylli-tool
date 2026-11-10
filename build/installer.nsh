; Branded uninstaller wiring.
;
; electron-builder's upgrade path (uninstallOldVersion, also used by electron-updater) reads "UninstallString", copies that exe to a temp
; folder and runs it silently. We point UninstallString at the branded wrapper after install (customInstall), so before an upgrade
; starts (customInit) we point it back at the real NSIS uninstaller of the old install, otherwise the upgrade fails with exit code 2.

!macro jylliRestoreNsisUninstaller ROOT MODE
  ReadRegStr $R0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ReadRegStr $R1 ${ROOT} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R0 != ""
  ${AndIf} $R1 != ""
    IfFileExists "$R1\Uninstall ${PRODUCT_FILENAME}.exe" 0 +2
    WriteRegStr ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "UninstallString" '"$R1\Uninstall ${PRODUCT_FILENAME}.exe" ${MODE}'
  ${EndIf}
!macroend

!macro customInit
  Push $R0
  Push $R1
  !insertmacro jylliRestoreNsisUninstaller HKCU /currentuser
  !insertmacro jylliRestoreNsisUninstaller HKLM /allusers
  Pop $R1
  Pop $R0
!macroend

; Points Settings > Apps > Uninstall at the branded uninstaller (restored to NSIS by customInit before the next upgrade).
!macro customInstall
  IfFileExists "$INSTDIR\Jylli Tool Uninstaller.exe" 0 +2
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString" '"$INSTDIR\Jylli Tool Uninstaller.exe" /$installMode'
!macroend
