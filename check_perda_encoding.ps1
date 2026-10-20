$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }
$f = 'C:\projetos\perdadereceita\data\chamados-abertos-perda.json'
if (Test-Path $f) {
    $bytes = [System.IO.File]::ReadAllBytes($f)
    Write-Output ('Size: ' + $bytes.Length)
    Write-Output ('First 20 bytes: ' + [string]::Join(',', $bytes[0..19]))
    if ($bytes[0] -eq 255 -and $bytes[1] -eq 254) {
        Write-Output 'Encoding: UTF-16 LE with BOM detected'
    } elseif ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191) {
        Write-Output 'Encoding: UTF-8 with BOM detected'
    } else {
        Write-Output 'Encoding: No BOM detected (likely UTF-8)'
    }
} else {
    Write-Output 'File not found'
}