!macro customUnInstall
  nsExec::ExecToLog 'schtasks.exe /Delete /TN "QuanLai Daily Coupon" /F'
!macroend
