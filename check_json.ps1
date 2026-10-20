$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }
$f = 'C:\projetos\chamados\docs\perda_receita.json'
if (Test-Path $f) {
    $bytes = [System.IO.File]::ReadAllBytes($f)
    Write-Output ('Size: ' + $bytes.Length)
    Write-Output ('First 20 bytes: ' + [string]::Join(',', $bytes[0..19]))
    try {
        $text = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
        $len = [Math]::Min(100, $text.Length)
        Write-Output ('First 100 chars: ' + $text.Substring(0, $len))
    } catch {
        Write-Output ('Read error: ' + $_.Exception.Message)
    }
} else {
    Write-Output 'File not found'
}