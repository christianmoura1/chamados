# Desabilita a tarefa TikTok - Flow Worker e mata todos os processos flow-worker.
# RODAR COMO ADMINISTRADOR:
# powershell -ExecutionPolicy Bypass -File C:\projetos\chamados\scripts\desabilita_flow.ps1
$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output "ABORTADO: $env:COMPUTERNAME"; exit 9 }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output "ERRO: precisa rodar como Administrador"; exit 1 }
Write-Output "=========================================="
Write-Output "DESABILITANDO TIKTOK FLOW WORKER"
Write-Output ("Data: " + (Get-Date -Format 'dd/MM/yyyy HH:mm:ss'))
Write-Output "=========================================="
Write-Output ""
# 1. Desabilitar a tarefa agendada
Write-Output "--- Desabilitando tarefa agendada ---"
$t = Get-ScheduledTask -TaskName 'TikTok - Flow Worker' -ErrorAction SilentlyContinue
if ($t) {
    Disable-ScheduledTask -TaskName 'TikTok - Flow Worker' | Out-Null
    $t2 = Get-ScheduledTask -TaskName 'TikTok - Flow Worker'
    Write-Output ("OK: Estado agora = " + $t2.State)
} else {
    Write-Output "Tarefa nao encontrada (ja pode estar desabilitada)"
}
Write-Output ""
# 2. Matar todos os processos flow-worker
Write-Output "--- Matando processos flow-worker ---"
$procs = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match 'flow-worker' -or $_.CommandLine -match 'rodar-oculto' -or $_.CommandLine -match 'flow-shop'
}
$killed = 0
foreach ($p in $procs) {
    Write-Output ("Matando PID=" + $p.ProcessId + " Nome=" + $p.Name)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    $killed++
}
if ($killed -eq 0) { Write-Output "Nenhum processo flow-worker encontrado" }
else { Write-Output ("OK: " + $killed + " processo(s) parado(s)") }
Write-Output ""
# 3. Fechar aba Google Flow no Chrome
Write-Output "--- Fechando aba Google Flow ---"
try {
    $tabs = Invoke-RestMethod -Uri 'http://127.0.0.1:9222/json/list' -TimeoutSec 10
    $flowTabs = $tabs | Where-Object { $_.url -like '*flow.google.com*' -or $_.title -like '*Google Flow*' -or $_.title -eq 'Google' }
    foreach ($ft in $flowTabs) {
        Write-Output ("Fechando: " + $ft.title)
        Invoke-RestMethod -Uri ('http://127.0.0.1:9222/json/close/' + $ft.id) -TimeoutSec 10 | Out-Null
        Write-Output " Fechada"
    }
    if (-not $flowTabs) { Write-Output "Nenhuma aba Flow encontrada" }
} catch {
    Write-Output ("CDP erro: " + $_.Exception.Message)
}
Write-Output ""
# 4. Verificacao final
Write-Output "=========================================="
Write-Output "VERIFICACAO FINAL"
Write-Output "=========================================="
$t3 = Get-ScheduledTask -TaskName 'TikTok - Flow Worker' -ErrorAction SilentlyContinue
if ($t3) { Write-Output ("Tarefa: Estado=" + $t3.State) }
$still = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'flow-worker' }
if ($still) { Write-Output ("AVISO: processo ainda vivo: " + (($still | ForEach-Object { $_.ProcessId }) -join ', ')) }
else { Write-Output "OK: nenhum processo flow-worker rodando" }
Write-Output ""
Write-Output "PRONTO. O Google Flow nao vai mais abrir automaticamente."
Write-Output 'Para reativar no futuro: Enable-ScheduledTask -TaskName "TikTok - Flow Worker"'