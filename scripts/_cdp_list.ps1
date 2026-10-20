try {
    $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:9222/json/list' -TimeoutSec 5
    foreach ($t in $resp) {
        Write-Output ($t.id + ' | ' + $t.title + ' | ' + $t.url)
    }
} catch {
    Write-Output ("CDP_ERRO: " + $_.Exception.Message)
}