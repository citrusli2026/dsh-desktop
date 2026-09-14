; dsh-desktop NSIS customizations (decision 0032 / #39 residue family).
;
; The assisted installer's upgrade path removes the old install with a plain
; per-file RMDir /r (the atomic whole-dir rename only runs on the --updated
; auto-update path), and RMDir /r silently skips read-only/hidden/system and
; locked files. That is exactly how a stale or AV-damaged harness closure
; survives an upgrade and later fails with spawn EFTYPE (issue #39).
;
; Both steps below run in the NEW installer's .onInit, so they are effective
; for upgrades from any published baseline immediately:
;  1. Clear R/H/S attributes under the previous install's resources tree, so
;     the old uninstaller's RMDir /r can actually remove every bundled file.
;     Attribute changes are cancel-safe: if the user aborts, only the
;     read-only bit is gone.
;  2. Exclusive-open probe on the previous bundled node.exe. A running
;     harness or terminal keeps it mapped; without the probe the copy step
;     fails and the assisted UI offers "ignore", which is how the silent
;     corruption happened. Silent installs exit with code 5 so CI and
;     electron-updater see an explicit failure instead of a broken upgrade.

!include "LogicLib.nsh"

!macro customInit
  ; --- attribute clear (best effort): let the old uninstaller fully remove ---
  nsExec::Exec `cmd /c attrib -R -H -S "$INSTDIR\resources\*" /S /D`
  Pop $R7

  ; --- occupancy probe on the previous bundled node.exe ---
dsh_probe_loop:
  System::Call 'kernel32::CreateFile(t "$INSTDIR\resources\harness\node\node.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) i .R0 ?e'
  Pop $R1
  IntCmp $R0 -1 0 dsh_probe_close dsh_probe_close
  ; CreateFile failed: a missing old install (2 / 3) is fine, anything else
  ; means the file cannot be replaced right now.
  IntCmp $R1 2 dsh_probe_done dsh_probe_done 0
  IntCmp $R1 3 dsh_probe_done dsh_probe_done 0
  ${If} ${Silent}
    SetErrorLevel 5
    Quit
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
    "dsh-desktop is still running, or its bundled runtime files are in use.$\n请关闭 dsh-desktop（以及正在使用它的终端窗口），然后点击「重试」。$\n$\nClose dsh-desktop and any terminal using it, then click Retry." \
    IDRETRY dsh_probe_loop
  SetErrorLevel 5
  Quit
dsh_probe_close:
  System::Call 'kernel32::CloseHandle(p $R0)'
dsh_probe_done:
!macroend

; Authoritative occupancy gate inside the install Section, where $INSTDIR is
; final in every mode (assisted, silent /D, electron-updater). If a holder
; kept the old node.exe mapped, the file copy above could not replace it —
; fail explicitly instead of shipping a broken mixed install (#39 family).
!macro customInstall
  System::Call 'kernel32::CreateFile(t "$INSTDIR\resources\harness\node\node.exe", i 0x40000000, i 0, p 0, i 3, i 0, p 0) i .R0 ?e'
  Pop $R1
  IntCmp $R0 -1 0 dsh_post_close dsh_post_close
  IntCmp $R1 2 dsh_post_done dsh_post_done 0
  IntCmp $R1 3 dsh_post_done dsh_post_done 0
  ${If} ${Silent}
    SetErrorLevel 5
    Quit
  ${EndIf}
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
    "The bundled runtime could not be updated: dsh-desktop is still running, or its files are in use.$\n内置运行文件无法更新：dsh-desktop 仍在运行或其文件被占用。$\n$\nClose it and run the installer again." \
    IDCANCEL dsh_post_done
  SetErrorLevel 5
  Quit
dsh_post_close:
  System::Call 'kernel32::CloseHandle(p $R0)'
dsh_post_done:
!macroend
