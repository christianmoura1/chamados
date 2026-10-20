# Restaura as 2 tarefas que falharam no script principal.
# RODAR COMO ADMINISTRADOR: powershell -ExecutionPolicy Bypass -File C:\projetos\chamados\scripts\restaura_2_faltantes.ps1
$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output "ABORTADO: $env:COMPUTERNAME"; exit 9 }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Output "ERRO: precisa rodar como Administrador"; exit 1 }

$node = 'C:\Program Files\nodejs\node.exe'
$repo = 'C:\projetos\chamados'
$mordomo = 'C:\projetos\mordomo'

Write-Output "=== Restaurando Campo - Chamados Criticos 20min ==="
$nome1 = 'Campo - Chamados Criticos 20min'
$existe1 = Get-ScheduledTask -TaskName $nome1 -ErrorAction SilentlyContinue
if ($existe1) { Unregister-ScheduledTask -TaskName $nome1 -Confirm:$false }

# Usar schtasks em vez de Register-ScheduledTask para evitar problema com muitos triggers
$cmd1 = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"chcp 65001 > `$null; [Console]::OutputEncoding = [Text.Encoding]::UTF8; Set-Location '$repo'; & '$node' 'scripts\campo_daily.mjs' *>> '$repo\logs\campo_daily.log'; exit `$LASTEXITCODE`""

# Criar com schtasks /create com repetição a cada 20 minutos
schtasks /create /tn $nome1 /tr $cmd1 /sc minute /mo 20 /st 07:00 /et 23:00 /rl HIGHEST /f 2>&1 | Out-Null
$t1 = Get-ScheduledTask -TaskName $nome1 -ErrorAction SilentlyContinue
if ($t1) {
    $i1 = $t1 | Get-ScheduledTaskInfo
    Write-Output "  OK: Estado=$($t1.State) | Proxima=$($i1.NextRunTime)"
} else {
    Write-Output "  FALHOU com schtasks, tentando metodo alternativo..."
    # Metodo alternativo: criar com trigger unico e repetir via settings
    $acao1 = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"$cmd1`""
    $gatilho1 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(7) -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Hours 16)
    $cfg1 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
    try {
        Register-ScheduledTask -TaskName $nome1 -Action $acao1 -Trigger $gatilho1 -Settings $cfg1 -RunLevel Highest -Description 'Alertas WhatsApp chamados criticos a cada 20min' | Out-Null
        $t1b = Get-ScheduledTask -TaskName $nome1 -ErrorAction SilentlyContinue
        if ($t1b) { Write-Output "  OK (metodo alt): Estado=$($t1b.State)" }
        else { Write-Output "  ERRO: nao conseguiu registrar" }
    } catch {
        Write-Output "  ERRO: $($_.Exception.Message)"
    }
}

Write-Output ""
Write-Output "=== Restaurando Chrome CDP - Guardiao ==="
$nome2 = 'Chrome CDP - Guardiao'
$existe2 = Get-ScheduledTask -TaskName $nome2 -ErrorAction SilentlyContinue
if ($existe2) { Unregister-ScheduledTask -TaskName $nome2 -Confirm:$false }

# O guardiao eh um .ps1, nao .js
$guardiaoPath = Join-Path $mordomo 'scripts\chrome-guardiao.ps1'
$cmd2 = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$guardiaoPath`""

schtasks /create /tn $nome2 /tr $cmd2 /sc minute /mo 15 /st 00:00 /et 23:45 /rl HIGHEST /f 2>&1 | Out-Null
$t2 = Get-ScheduledTask -TaskName $nome2 -ErrorAction SilentlyContinue
if ($t2) {
    $i2 = $t2 | Get-ScheduledTaskInfo
    Write-Output "  OK: Estado=$($t2.State) | Proxima=$($i2.NextRunTime)"
} else {
    Write-Output "  FALHOU com schtasks, tentando metodo alternativo..."
    $acao2 = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$guardiaoPath`""
    $gatilho2 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Hours 24)
    $cfg2 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
    try {
        Register-ScheduledTask -TaskName $nome2 -Action $acao2 -Trigger $gatilho2 -Settings $cfg2 -RunLevel Highest -Description 'Reergue Chrome CDP se cair a cada 15min' | Out-Null
        $t2b = Get-ScheduledTask -TaskName $nome2 -ErrorAction SilentlyContinue
        if ($t2b) { Write-Output "  OK (metodo alt): Estado=$($t2b.State)" }
        else { Write-Output "  ERRO: nao conseguiu registrar" }
    } catch {
        Write-Output "  ERRO: $($_.Exception.Message)"
    }
}

Write-Output ""
Write-Output "=== VERIFICACAO FINAL ==="
foreach ($n in @('Campo - Chamados Criticos 20min', 'Chrome CDP - Guardiao')) {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if ($t) {
        $i = $t | Get-ScheduledTaskInfo
        Write-Output "OK: $n | $($t.State) | Proxima=$($i.NextRunTime)"
    } else {
        Write-Output "FALTA: $n"
    }
}