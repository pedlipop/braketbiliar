# Setup portable Node.js environment and install dependencies

$ErrorActionPreference = "Stop"

$nodeVersion = "v20.11.1"
$zipName = "node-$nodeVersion-win-x64.zip"
$downloadUrl = "https://nodejs.org/dist/$nodeVersion/$zipName"
$extractDir = "$PSScriptRoot\node-portable"
$zipPath = "$PSScriptRoot\$zipName"

# 1. Download Node.js if not already present
if (-not (Test-Path $extractDir)) {
    if (-not (Test-Path $zipPath)) {
        Write-Host "Downloading Node.js $nodeVersion portable..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
        Write-Host "Download complete." -ForegroundColor Green
    }
    
    Write-Host "Extracting Node.js to $extractDir..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $extractDir
    Write-Host "Extraction complete." -ForegroundColor Green
    
    # Clean up the zip file
    Remove-Item $zipPath
} else {
    Write-Host "Node.js portable already extracted." -ForegroundColor Green
}

# Find node.exe and npm.cmd paths
$nodeFolder = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
$nodeBinPath = $nodeFolder.FullName
$nodeExe = "$nodeBinPath\node.exe"
$npmCmd = "$nodeBinPath\npm.cmd"

Write-Host "Using Node.exe at: $nodeExe" -ForegroundColor Yellow
Write-Host "Using Npm.cmd at: $npmCmd" -ForegroundColor Yellow

# Verify node and npm version
& $nodeExe -v
& $npmCmd -v

# 2. Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\backend"
try {
    & $npmCmd install
    Write-Host "Backend dependencies installed successfully." -ForegroundColor Green
} finally {
    Pop-Location
}

# 3. Install frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\frontend"
try {
    & $npmCmd install
    Write-Host "Frontend dependencies installed successfully." -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "All setups completed successfully!" -ForegroundColor Green
