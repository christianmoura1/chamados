$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output "ABORTADO: $env:COMPUTERNAME"; exit 9 }
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/list' -UseBasicParsing -TimeoutSec 5
    Write-Output "CDP_OK"
    Write-Output $r.Content
} catch {
    Write-Output "CDP_ERRO"
    Write-Output $_.Exception.Message
}