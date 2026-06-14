param(
  [string]$Token = "",
  [string]$ServerUrl = "ws://your-server.com:3000/ws/agent",
  [string]$DownloadUrl = "",
  [switch]$RemoveSelf
)

$ErrorActionPreference = "Stop"

$Repo = "imblowsnow/monitor-system"
$InstallDir = Join-Path $env:ProgramData "monitor-agent"
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

# 把安装脚本自身复制到安装目录，供 agent 自更新时复用（覆盖安装）。
$ScriptSrc = $MyInvocation.MyCommand.Path
$ScriptDst = Join-Path $InstallDir "install.ps1"
if ($ScriptSrc -and ($ScriptSrc -ne $ScriptDst)) {
  Copy-Item -Path $ScriptSrc -Destination $ScriptDst -Force -ErrorAction SilentlyContinue
}

$ExePath = "$InstallDir\monitor-agent.exe"
$ExeNew = "$InstallDir\monitor-agent.exe.new"

Write-Host "Downloading agent binary..."
Invoke-WebRequest -Uri $DownloadUrl -OutFile $ExeNew

# 下载校验：非空才继续，避免下载中断损坏现有二进制。
if (-not (Test-Path $ExeNew) -or (Get-Item $ExeNew).Length -eq 0) {
  Write-Host "Downloaded binary is empty, abort" -ForegroundColor Red
  Remove-Item $ExeNew -Force -ErrorAction SilentlyContinue
  exit 1
}

# 运行中的 exe 被服务占用而锁定，必须先停止服务才能覆盖。
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
  Write-Host "Stopping service for update..."
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  # 等待进程真正退出释放文件句柄，最多重试 10 次。
  for ($i = 0; $i -lt 10; $i++) {
    if ((Get-Service -Name $ServiceName).Status -eq "Stopped") { break }
    Start-Sleep -Seconds 1
  }
  Start-Sleep -Seconds 1
}

# 原子替换：覆盖 exe，失败则保留 .new 供排查。
Move-Item -Path $ExeNew -Destination $ExePath -Force

# config.json 幂等：已存在且本次未显式传入 Token 时保留原配置（用于覆盖更新场景）。
if ((-not [string]::IsNullOrEmpty($Token)) -or (-not (Test-Path "$InstallDir\config.json"))) {
  $Config = @{
    server_url = $ServerUrl
    token      = $Token
  } | ConvertTo-Json
  $Config | Out-File "$InstallDir\config.json" -Encoding UTF8
} else {
  Write-Host "Keeping existing config.json"
}

# 注册服务（不存在则创建），并启动/重启以加载新二进制。
if (-not $existingService) {
  sc.exe create $ServiceName binPath="$ExePath" start=auto | Out-Null
  sc.exe description $ServiceName "Monitor Agent Service" | Out-Null
}
Start-Service -Name $ServiceName

Write-Host "Monitor Agent installed and started." -ForegroundColor Green
Write-Host "Status: Get-Service $ServiceName"

# 自更新场景：脚本由 agent 下载到临时文件并以分离进程执行，执行完需删除自身临时文件。
if ($RemoveSelf -and $MyInvocation.MyCommand.Path) {
  Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
}
