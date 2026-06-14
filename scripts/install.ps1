param(
  [string]$Token = "",
  [string]$ServerUrl = "ws://your-server.com:3000/ws/agent",
  [string]$DownloadUrl = ""
)

$Repo = "imblowsnow/monitor-system"
$InstallDir = "C:\monitor-agent"
$ServiceName = "MonitorAgent"

if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Please run as Administrator" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrEmpty($DownloadUrl)) {
  # GitHub 的 latest/download 会自动重定向到最新 Release 的资产
  $DownloadUrl = "https://github.com/$Repo/releases/latest/download/monitor-agent-windows-amd64.exe"
}

Write-Host "Installing Monitor Agent..."
Write-Host "Download URL: $DownloadUrl"

if (-not (Test-Path $InstallDir)) {
  New-Item -Path $InstallDir -ItemType Directory | Out-Null
}

Write-Host "Downloading agent binary..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile "$InstallDir\monitor-agent.exe"

$Config = @{
  server_url = $ServerUrl
  token      = $Token
} | ConvertTo-Json

$Config | Out-File "$InstallDir\config.json" -Encoding UTF8

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
  Stop-Service -Name $ServiceName -Force
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

sc.exe create $ServiceName binPath="$InstallDir\monitor-agent.exe" start=auto | Out-Null
sc.exe description $ServiceName "Monitor Agent Service" | Out-Null
Start-Service -Name $ServiceName

Write-Host "Monitor Agent installed and started." -ForegroundColor Green
Write-Host "Status: Get-Service $ServiceName"
