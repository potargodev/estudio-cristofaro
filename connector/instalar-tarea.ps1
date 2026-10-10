<#
  Crea (o actualiza) una tarea programada de Windows que sincroniza Tango con
  la plataforma del Estudio Cristofaro cada N minutos.

  Uso (PowerShell como administrador, desde la carpeta del conector):
    .\instalar-tarea.ps1                       # cada 60 minutos
    .\instalar-tarea.ps1 -IntervaloMinutos 30
    .\instalar-tarea.ps1 -Desinstalar
#>
param(
  [int]$IntervaloMinutos = 60,
  [string]$NombreTarea = "Conector Tango - Estudio Cristofaro",
  [switch]$Desinstalar
)

$ErrorActionPreference = "Stop"
$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Desinstalar) {
  Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarea '$NombreTarea' eliminada."
  exit 0
}

if ($IntervaloMinutos -lt 5) { throw "El intervalo mínimo es de 5 minutos." }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "No encontré Node.js. Instalá Node 22 LTS desde https://nodejs.org y volvé a correr este script." }
$version = & $node -p "process.versions.node.split('.')[0]"
if ([int]$version -lt 22) { throw "Se necesita Node 22 o superior (tenés la versión $version)." }

if (-not (Test-Path (Join-Path $carpeta "config.json"))) {
  throw "Falta config.json en $carpeta. Bajalo desde /admin/conexiones/tango de la plataforma."
}

Write-Host "Probando la conexión antes de crear la tarea..."
& $node (Join-Path $carpeta "index.mjs") test
if ($LASTEXITCODE -ne 0) { throw "La prueba falló. Corregí config.json y volvé a intentar." }

$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$(Join-Path $carpeta 'index.mjs')`" sync" -WorkingDirectory $carpeta
$disparador = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervaloMinutos) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
# Corre con la cuenta SYSTEM: funciona aunque nadie haya iniciado sesión en la PC
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparador -Settings $opciones -Principal $principal -Force | Out-Null

Write-Host ""
Write-Host "Listo: la tarea '$NombreTarea' sincroniza cada $IntervaloMinutos minutos."
Write-Host "Logs: $(Join-Path $carpeta 'logs\conector.log')"
Write-Host "Para correrla ahora: Start-ScheduledTask -TaskName '$NombreTarea'"
