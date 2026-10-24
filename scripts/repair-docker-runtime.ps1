# Windows-only recovery for Docker Desktop's stale Unix socket reparse points.
# This script never deletes Docker images, containers, WSL disks or volumes.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This helper is for Windows only.' }
function Test-LocalEngine {
    $probe = New-Object System.Diagnostics.Process
    $probe.StartInfo.FileName = 'docker.exe'
    $probe.StartInfo.Arguments = 'info --format {{.ServerVersion}}'
    $probe.StartInfo.UseShellExecute = $false
    $probe.StartInfo.CreateNoWindow = $true
    $probe.StartInfo.RedirectStandardOutput = $true
    $probe.StartInfo.RedirectStandardError = $true
    try {
        [void]$probe.Start()
        if (-not $probe.WaitForExit(8000)) { $probe.Kill(); return $false }
        return ($probe.ExitCode -eq 0 -and $probe.StandardOutput.ReadToEnd().Trim() -match '^\d+\.\d+')
    } finally {
        $probe.Dispose()
    }
}
if (Test-LocalEngine) { Write-Output 'Docker engine is already running. No recovery needed.'; exit 0 }
if (Test-LocalEngine) { Write-Output 'Docker engine is already running. No recovery needed.'; exit 0 }
if ((Get-Service -Name WslService).Status -ne 'Running') { throw 'WslService is not running. Start it from an administrator PowerShell first.' }
$localRoot = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)
$runtimeTargets = @(
    @{ Path = (Join-Path $localRoot 'Docker\run'); Names = @('dockerInference','dockerEthernetVfkit','userAnalyticsOtlpHttp.sock') },
    @{ Path = (Join-Path $localRoot 'docker-secrets-engine'); Names = @('engine.sock') }
)
foreach ($target in $runtimeTargets) {
    $resolved = [System.IO.Path]::GetFullPath($target.Path)
    if (-not $resolved.StartsWith($localRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime target is outside LocalAppData.' }
    if (Test-Path -LiteralPath $resolved) {
        $folder = Get-Item -LiteralPath $resolved
        if ($folder.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Runtime folder itself is a reparse point; inspect manually.' }
        foreach ($entry in (Get-ChildItem -LiteralPath $resolved -Force)) {
            if ($entry.Name -notin $target.Names -or $entry.Length -ne 0 -or -not ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
                throw "Unexpected runtime content at $($entry.FullName); recovery stopped."
            }
        }
    }
}
$dockerInstallRoot = [System.IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'Docker\Docker'))
Get-Process -Name 'Docker Desktop','com.docker.backend','com.docker.build','docker' -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Path -and $_.Path.StartsWith($dockerInstallRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { Stop-Process -Id $_.Id -Force }
}
# Stop only Docker's WSL distro so an orphan bootstrap cannot block restart.
& wsl.exe --terminate docker-desktop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop docker-desktop; inspect WSL before retrying.' }
$recoveryStamp = [guid]::NewGuid().ToString('N').Substring(0,8)
foreach ($target in $runtimeTargets) {
    $resolved = [System.IO.Path]::GetFullPath($target.Path)
    if (Test-Path -LiteralPath $resolved) {
        if ((Get-Item -LiteralPath $resolved).FullName -ne $resolved) { throw 'Resolved runtime path changed.' }
        Rename-Item -LiteralPath $resolved -NewName ((Split-Path -Leaf $resolved) + '.before-sirocco-' + $recoveryStamp)
    }
}
Start-Process -FilePath (Join-Path $dockerInstallRoot 'Docker Desktop.exe') -WindowStyle Hidden
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (Test-LocalEngine) { Write-Output 'Docker engine is ready. Run pnpm demo:up, then open http://localhost:8088.'; exit 0 }
    Start-Sleep -Seconds 2
}
throw 'Docker did not become ready. Inspect Docker Desktop diagnostics; do not reset volumes.'
