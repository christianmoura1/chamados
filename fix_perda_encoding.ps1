$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }

$f = 'C:\projetos\perdadereceita\data\chamados-abertos-perda.json'
if (-not (Test-Path $f)) { Write-Output 'File not found'; exit 1 }

# Read as UTF-16 LE (current encoding) and rewrite as UTF-8 no BOM
$text = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::Unicode)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($f, $text, $utf8NoBom)

# Verify
$bytes = [System.IO.File]::ReadAllBytes($f)
Write-Output ('New size: ' + $bytes.Length)
Write-Output ('First 10 bytes: ' + [string]::Join(',', $bytes[0..9]))
if ($bytes[0] -eq 255 -and $bytes[1] -eq 254) {
    Write-Output 'FAIL: still UTF-16 LE BOM'
} elseif ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
    Write-Output 'WARN: UTF-8 with BOM'
} else {
    Write-Output 'OK: UTF-8 no BOM'
}

# Also fix the copy in chamados project if it exists
$f2 = 'C:\projetos\chamados\data\chamados-abertos-perda.json'
if (Test-Path $f2) {
    $text2 = [System.IO.File]::ReadAllText($f2, [System.Text.Encoding]::Unicode)
    [System.IO.File]::WriteAllText($f2, $text2, $utf8NoBom)
    Write-Output 'Also fixed chamados project copy'
}