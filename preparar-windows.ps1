# Prepara Windows 11 para el widget "Última conversión". Ejecutar en PowerShell como administrador.
$ErrorActionPreference = 'Continue'

# 1. Modo de desarrollador
New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name AllowDevelopmentWithoutDevLicense -Value 1 -Type DWord

# 2. Windows App SDK y panel de widgets
winget install --id Microsoft.WindowsAppRuntime.1.8 --accept-source-agreements --accept-package-agreements
winget upgrade --id 9MSSGKG348SP --source msstore --accept-source-agreements --accept-package-agreements

# 3. Versiones instaladas
Get-AppxPackage MicrosoftWindows.Client.WebExperience | Select-Object Name, Version
(Get-Item "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe").VersionInfo.ProductVersion

# 4. Reiniciar el panel de widgets
Get-Process Widgets* -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Listo. Instala la app desde Edge y abre Win+W > Agregar widgets > Última conversión.'
