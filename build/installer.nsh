!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Persist disabled before task removal. Use the same service and task identity.
    nsExec::ExecToLog '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --disable-auto'
    Pop $0
    ${If} $0 != 0
      DetailPrint "Automatic task cleanup needs attention. Open Windows Task Scheduler to check QuanLai Daily Coupon."
    ${EndIf}
  ${endIf}
!macroend
