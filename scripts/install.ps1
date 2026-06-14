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

$ExePath = "$InstallDir\monitor-agent.exe"
$ExeNew = "$InstallDir\monitor-agent.exe.new"

Write-Host "Downloading agent binary..."
# 先直连 GitHub，失败则用 gh-proxy.org 代理重试（适配国内网络）。
try {
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $ExeNew
} catch {
  $ProxyUrl = "https://gh-proxy.org/$DownloadUrl"
  Write-Host "Direct download failed, retrying via proxy: $ProxyUrl" -ForegroundColor Yellow
  Invoke-WebRequest -Uri $ProxyUrl -OutFile $ExeNew
}

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
  # 用 .NET 写文件而非 Out-File -Encoding UTF8：后者在 PowerShell 5.1 下会写入 BOM
  # 头（EF BB BF），Go 的 json.Unmarshal 不识别 BOM，会报 "invalid character 'ï'"。
  [System.IO.File]::WriteAllText("$InstallDir\config.json", $Config, (New-Object System.Text.UTF8Encoding($false)))
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
