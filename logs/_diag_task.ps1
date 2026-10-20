$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike $ESPERADO + '*') {
    Write-Output "ABORTADO"
    exit 9
}

Write-Output "=== TASK INFO ==="
$info = Get-ScheduledTaskInfo -TaskName 'Chamados - Diario 0715'
Write-Output "LastRunTime: $($info.LastRunTime)"
Write-Output "LastTaskResult: $($info.LastTaskResult)"
Write-Output "NextRunTime: $($info.NextRunTime)"

Write-Output "=== NODE PROCS ==="
$procs = Get-Process node -ErrorAction SilentlyContinue
if ($procs) {
    foreach ($p in $procs) {
        Write-Output "PID=$($p.Id) CPU=$($p.CPU) StartTime=$($p.StartTime)"
    }
} else {
    Write-Output "Nenhum processo node ativo"
}

Write-Output "=== CDP CHECK ==="
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/list' -UseBasicParsing -TimeoutSec 5
    $tabs = $r.Content | ConvertFrom-Json
    Write-Output "CDP_OK abas=$($tabs.Count)"
    foreach ($t in $tabs) {
        Write-Output "TAB: $($t.title) | $($t.url)"
    }
} catch {
    Write-Output "CDP_ERRO: $($_.Exception.Message)"
}