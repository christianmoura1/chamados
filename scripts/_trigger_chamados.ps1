$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output "ABORTADO: $env:COMPUTERNAME"; exit 9 }
Start-ScheduledTask -TaskName 'Chamados - Diario 0715'
Write-Output 'TAREFA_DISPARADA'