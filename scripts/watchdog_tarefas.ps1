# Watchdog das tarefas criticas.
#
# Antes ele so conferia se a tarefa EXISTIA, e por isso deu "todas as 10
# presentes" de hora em hora enquanto tres estavam quebradas:
#   - Sorvete 2359 existia e chamava node.exe num .ps1 (nunca rodou);
#   - Campo 20min existia com gatilho de data unica, ja esgotado;
#   - PerdaReceita 0730 existia apontando para o script errado.
# Existir nao e funcionar. Agora confiro tambem resultado, proxima execucao e
# ha quanto tempo rodou.
$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { exit 9 }
$log = 'C:\projetos\chamados\logs\watchdog_tarefas.log'
$ts = Get-Date -Format 'dd/MM/yyyy HH:mm:ss'
$agora = Get-Date

# nome -> horas toleradas desde a ultima execucao (0 = nao cobro frescor)
$criticas = [ordered]@{
  'Risco - Painel Diario 0600'      = 26
  'Chamados - Diario 0715'          = 3
  'PerdaReceita - Diario 0730'      = 26
  'PerdaReceita - Completo 0735'    = 26
  'Preventivas - Diario 0745'       = 26
  'Analista Seguranca - Risco 0750' = 26
  'Campo - Chamados Criticos 20min' = 3
  'Sorvete - Foto Diaria 2359'      = 26
  'CertPonto - KeepAlive Sessao'    = 0
  'PowerBI - KeepAlive Sessao'      = 0
  'Chrome CDP - Guardiao'           = 0
}

$faltando = @()
$doentes  = @()

foreach ($nome in $criticas.Keys) {
  $t = Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  if (-not $t) { $faltando += $nome; continue }
  $i = Get-ScheduledTaskInfo -TaskName $nome -ErrorAction SilentlyContinue
  if (-not $i) { continue }

  # 1) ultima execucao falhou. 267009 = esta rodando agora, nao e falha.
  if ($i.LastTaskResult -ne 0 -and $i.LastTaskResult -ne 267009 -and $i.LastTaskResult -ne 267011) {
    $doentes += ($nome + ' -> resultado=' + $i.LastTaskResult)
  }

  # 2) sem proxima execucao: gatilho morto (foi o caso do Campo 20min)
  if ($t.State -ne 'Disabled' -and -not $i.NextRunTime) {
    $doentes += ($nome + ' -> SEM PROXIMA EXECUCAO (gatilho morto)')
  }

  # 3) nao roda ha tempo demais
  $limite = $criticas[$nome]
  if ($limite -gt 0 -and $i.LastRunTime -and $i.LastRunTime.Year -gt 2000) {
    $h = [int]($agora - $i.LastRunTime).TotalHours
    if ($h -gt $limite) { $doentes += ($nome + ' -> sem rodar ha ' + $h + 'h (limite ' + $limite + 'h)') }
  }
}

if ($faltando.Count -gt 0) {
  "[$ts] WATCHDOG: $($faltando.Count) tarefa(s) faltando: $($faltando -join ', ')" | Out-File $log -Append -Encoding UTF8
  & powershell -ExecutionPolicy Bypass -File 'C:\projetos\chamados\scripts\restaura_tarefas.ps1' *>> $log
  "[$ts] WATCHDOG: restauracao executada" | Out-File $log -Append -Encoding UTF8
}

if ($doentes.Count -gt 0) {
  "[$ts] WATCHDOG: ALERTA -- $($doentes.Count) tarefa(s) presentes mas com problema:" | Out-File $log -Append -Encoding UTF8
  foreach ($d in $doentes) { "[$ts]    $d" | Out-File $log -Append -Encoding UTF8 }
}

if ($faltando.Count -eq 0 -and $doentes.Count -eq 0) {
  "[$ts] WATCHDOG: as $($criticas.Count) tarefas criticas existem, rodaram e tem proxima execucao" | Out-File $log -Append -Encoding UTF8
}
