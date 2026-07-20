$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Test-PortAvailable([int]$candidate) {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  return -not ($listeners | Where-Object { $_.Port -eq $candidate })
}

$basePort = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$portNumber = $basePort
while (-not (Test-PortAvailable $portNumber) -and $portNumber -lt ($basePort + 20)) {
  Write-Host "Port $portNumber is busy, trying $($portNumber + 1) ..."
  $portNumber += 1
}

$port = "$portNumber"
$env:PORT = $port
$tunnelLog = Join-Path $PSScriptRoot "tunnel-url.txt"
$tunnelErrorLog = Join-Path $PSScriptRoot "tunnel-error.txt"

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

if (Test-Path $tunnelLog) {
  Remove-Item -LiteralPath $tunnelLog -Force
}
if (Test-Path $tunnelErrorLog) {
  Remove-Item -LiteralPath $tunnelErrorLog -Force
}

Write-Host "Starting local service..."
$server = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Host "Starting public tunnel..."
$tunnel = Start-Process -FilePath "node" -ArgumentList "start-tunnel.js $port" -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrorLog -PassThru -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $content = ""
  if (Test-Path $tunnelLog) {
    $content += Get-Content -Raw -LiteralPath $tunnelLog -ErrorAction SilentlyContinue
  }
  if (Test-Path $tunnelErrorLog) {
    $content += "`n"
    $content += Get-Content -Raw -LiteralPath $tunnelErrorLog -ErrorAction SilentlyContinue
  }

  $match = [regex]::Match($content, "https://\S+")
  if ($match.Success) {
    $url = $match.Value.Trim()
    break
  }
}

Write-Host ""
Write-Host "========================"
Write-Host "Service started"
Write-Host "Local address: http://localhost:$port"

if ($url) {
  Write-Host "Public address: $url"
  Write-Host "On first localtunnel visit, click Continue on the landing page."
  Start-Process $url
} else {
  Write-Host "Public address not ready yet; tunnel log:"
  if (Test-Path $tunnelLog) { Get-Content -LiteralPath $tunnelLog }
  if (Test-Path $tunnelErrorLog) { Get-Content -LiteralPath $tunnelErrorLog }
}

Write-Host "Press Enter to close this project service..."
Write-Host "========================"
[void][Console]::ReadLine()

foreach ($process in @($tunnel, $server)) {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}
