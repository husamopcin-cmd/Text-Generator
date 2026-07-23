Add-Type -AssemblyName System.IO.Compression.FileSystem

$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$zips = Get-ChildItem "$desktopPath\*.zip" | Where-Object { $_.Name -match "Text-Generator" -and $_.Name -notmatch "safe" }

$hasPublishable = $false
$hasAnon = $false
$hasSecret = $false
$hasServiceRole = $false
$hasSbSecretValue = $false
$hasJwtValue = $false

foreach ($zip in $zips) {
    try {
        $zipArchive = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
        $entries = $zipArchive.Entries | Where-Object { $_.FullName -match '\.env$' -or $_.FullName -match '\.env\.local$' }
        
        foreach ($entry in $entries) {
            $stream = $entry.Open()
            $reader = New-Object System.IO.StreamReader($stream)
            $content = $reader.ReadToEnd()
            $reader.Close()
            $stream.Close()
            
            $lines = $content -split "`r`n|`n"
            foreach ($line in $lines) {
                if ($line -match '^\s*#') { continue }
                if ($line -match '^([^=]+)=(.*)$') {
                    $key = $matches[1].Trim()
                    $val = $matches[2].Trim()
                    
                    if ($key -eq "SUPABASE_PUBLISHABLE_KEY") { $hasPublishable = $true }
                    if ($key -eq "SUPABASE_ANON_KEY") { $hasAnon = $true }
                    if ($key -eq "SUPABASE_SECRET_KEY") { $hasSecret = $true }
                    if ($key -eq "SUPABASE_SERVICE_ROLE_KEY") { $hasServiceRole = $true }
                    
                    if ($val -match '^sb_secret_') { $hasSbSecretValue = $true }
                    
                    if ($val -match '^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$') {
                        try {
                            $parts = $val -split '\.'
                            $payloadBase64 = $parts[1]
                            $payloadBase64 = $payloadBase64 -replace '-','+' -replace '_','/'
                            $padLen = 4 - ($payloadBase64.Length % 4)
                            if ($padLen -lt 4) { $payloadBase64 += ('=' * $padLen) }
                            $payloadJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payloadBase64))
                            if ($payloadJson -match '"role"\s*:\s*"service_role"') {
                                $hasJwtValue = $true
                            }
                        } catch {}
                    }
                }
            }
        }
        $zipArchive.Dispose()
    } catch {
        # ignore read errors
    }
}

function YesNo($val) {
    if ($val) { return "Evet" } else { return "Hayir" }
}

Write-Output "1. SUPABASE_PUBLISHABLE_KEY mevcut mu?: $(YesNo $hasPublishable)"
Write-Output "2. SUPABASE_ANON_KEY mevcut mu?: $(YesNo $hasAnon)"
Write-Output "3. SUPABASE_SECRET_KEY mevcut mu?: $(YesNo $hasSecret)"
Write-Output "4. SUPABASE_SERVICE_ROLE_KEY mevcut mu?: $(YesNo $hasServiceRole)"
Write-Output "5. Herhangi bir deger sb_secret_ formatinda mi?: $(YesNo $hasSbSecretValue)"
Write-Output "6. Herhangi bir deger service_role JWT biciminde mi?: $(YesNo $hasJwtValue)"

$hasHighPriv = $hasSecret -or $hasServiceRole -or $hasSbSecretValue -or $hasJwtValue
$hasAnyPriv = $hasPublishable -or $hasAnon

if ($hasHighPriv) {
    Write-Output "7. Sonuc: yuksek yetkili key de vardi"
} elseif ($hasAnyPriv) {
    Write-Output "7. Sonuc: yalniz public key vardi"
} else {
    Write-Output "7. Sonuc: kanit yetersiz"
}
