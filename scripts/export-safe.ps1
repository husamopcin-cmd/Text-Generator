[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot -or $LASTEXITCODE -ne 0) {
    throw 'Bu komut bir Git deposu içinde çalıştırılmalıdır.'
}

$trackedChanges = @(& git -C $repoRoot status --porcelain --untracked-files=no)
if ($trackedChanges.Count -gt 0) {
    throw 'Güvenli export için takip edilen çalışma ağacı temiz olmalıdır. Önce değişiklikleri commit edin.'
}

$blockedPatterns = @(
    '(^|/)\.env($|\.)',
    '(^|/)\.git(/|$)',
    '(^|/)\.idea(/|$)',
    '(^|/)\.vs(/|$)',
    '(^|/)node_modules(/|$)',
    '(^|/)venv(/|$)',
    '(^|/)(id_rsa|id_ed25519)($|\.)',
    '(^|/)(credentials|service[-_]?account)[^/]*\.json$',
    '\.(pem|key|p12|pfx)$'
)

$trackedFiles = @(& git -C $repoRoot ls-files)
$blockedFiles = @($trackedFiles | Where-Object {
    $path = $_ -replace '\\', '/'
    $blockedPatterns | Where-Object { $path -match $_ } | Select-Object -First 1
})
if ($blockedFiles.Count -gt 0) {
    throw "Export durduruldu; hassas yol Git tarafından takip ediliyor: $($blockedFiles -join ', ')"
}

if (-not $OutputPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path (Split-Path -Parent $repoRoot) "CinoCode-safe-$timestamp.zip"
} elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $repoRoot $OutputPath
}

$fullOutputPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $fullOutputPath) {
    throw "Hedef dosya zaten var: $fullOutputPath"
}

$outputDirectory = Split-Path -Parent $fullOutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

& git -C $repoRoot archive --format=zip --output=$fullOutputPath HEAD
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $fullOutputPath)) {
    throw 'Git archive güvenli export dosyasını oluşturamadı.'
}

Write-Output "Güvenli export hazır: $fullOutputPath"
