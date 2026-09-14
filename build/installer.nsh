; dsh-desktop NSIS customizations (decision 0032 / #39 residue family).
;
; electron-builder picks this file up by DEFAULT convention (build/installer.nsh
; inside buildResources): do not reference it via nsis.include — getResource
; matches names relative to buildResources, so a "build/installer.nsh" value
; silently matches nothing (observed: include never ran, no error anywhere).
;
; Delivered hooks:
;  - customInit: best-effort attribute clear of the previous install so the
;    old uninstaller can fully remove it.
;  - customInstall (inside the Section, $INSTDIR final in every mode):
;    exclusive-open probe on node.exe. A running harness/terminal keeps it
;    mapped; the file copy above could not replace it, so we fail explicitly
;    instead of shipping a broken mixed install (#39 family). Silent installs
;    exit with code 5 (visible to CI and electron-updater).
;  - Both steps append one diagnostic line to $TEMP\dsh-nsis-probe.log so a
;    failing residue-matrix run carries direct evidence.
;
; Each hook is written out inline (no shared macros): NSIS labels are
; function-global and each hook may only be inserted once.

!include "LogicLib.nsh"

!macro customInit
  ; --- attribute clear (best effort): let the old uninstaller fully remove ---
  nsExec::Exec `cmd /c attrib -R -H -S "$INSTDIR\resources\*" /S /D`
  Pop $R7

  ; --- occupancy probe (INSTDIR may be unfinal for silent /D here: log only) ---
dsh_init_probe:
  System::Call 'kernel32::CreateFile(t "$INSTDIR\resources\harness\node\bin\node.exe", i 1073741824, i 0, p 0, i 3, i 0, p 0) i .R0 ?e'
  Pop $R1
  FileOpen $R8 "$TEMP\dsh-nsis-probe.log" a
  ${If} $R8 != -1
    FileSeek $R8 0 END
    FileWrite $R8 "customInit dir=[$INSTDIR] handle=[$R0] err=[$R1]$\r$\n"
    FileClose $R8
  ${EndIf}
  IntCmp $R0 -1 0 dsh_init_close dsh_init_close
  IntCmp $R1 2 dsh_init_done dsh_init_done 0
  IntCmp $R1 3 dsh_init_done dsh_init_done 0
  ${If} ${Silent}
    SetErrorLevel 5
    Quit
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
    "dsh-desktop is still running, or its bundled runtime files are in use.$\n请关闭 dsh-desktop（以及正在使用它的终端窗口），然后点击「重试」。$\n$\nClose dsh-desktop and any terminal using it, then click Retry." \
    IDRETRY dsh_init_probe
  SetErrorLevel 5
  Quit
dsh_init_close:
  System::Call 'kernel32::CloseHandle(p $R0)'
dsh_init_done:
!macroend

!macro customInstall
dsh_post_probe:
  System::Call 'kernel32::CreateFile(t "$INSTDIR\resources\harness\node\bin\node.exe", i 1073741824, i 0, p 0, i 3, i 0, p 0) i .R0 ?e'
  Pop $R1
  FileOpen $R8 "$TEMP\dsh-nsis-probe.log" a
  ${If} $R8 != -1
    FileSeek $R8 0 END
    FileWrite $R8 "customInstall dir=[$INSTDIR] handle=[$R0] err=[$R1]$\r$\n"
    FileClose $R8
  ${EndIf}
  IntCmp $R0 -1 0 dsh_post_close dsh_post_close
  IntCmp $R1 2 dsh_post_done dsh_post_done 0
  IntCmp $R1 3 dsh_post_done dsh_post_done 0
  ${If} ${Silent}
    SetErrorLevel 5
    Quit
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
    "The bundled runtime could not be updated: dsh-desktop is still running, or its files are in use.$\n内置运行文件无法更新：dsh-desktop 仍在运行或其文件被占用。$\n$\nClose it and run the installer again." \
    IDRETRY dsh_post_probe
  SetErrorLevel 5
  Quit
dsh_post_close:
  System::Call 'kernel32::CloseHandle(p $R0)'
dsh_post_done:
!macroend
