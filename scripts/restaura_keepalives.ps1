# Restaura/corrige as tarefas de keepalive para impedir que as sessoes expirem.
# RODAR COMO ADMINISTRADOR:
#   powershell -ExecutionPolicy Bypass -File C:\projetos\chamados\scripts\restaura_keepalives.ps1
$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) {
    Write-Output "ABORTADO: esta nao e a VPS ($env:COMPUTERNAME)"
    exit 9
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Output "ERRO: precisa rodar como Administrador"
    exit 1
}

Write-Output "=========================================="
Write-Output "RESTAURANDO KEEPALIVES (a cada 15 min)"
Write-Output ("Data: " + (Get-Date -Format 'dd/MM/yyyy HH:mm:ss'))
Write-Output "=========================================="
Write-Output ""

$node = 'C:\Program Files\nodejs\node.exe'

function Restaurar-KeepAlive {
    param(
        [string]$Nome,
        [string]$ScriptJs,
        [string]$LogPath,
        [string]$Descricao
    )
    Write-Output ("--- " + $Nome + " ---")
    $existe = Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue
    if ($existe) {
        Unregister-ScheduledTask -TaskName $Nome -Confirm:$false -ErrorAction SilentlyContinue
    }
    $innerCmd = "chcp 65001 > `$null; [Console]::OutputEncoding = [Text.Encoding]::UTF8; & '" + $node + "' '" + $ScriptJs + "' *>> '" + $LogPath + "'; exit `$LASTEXITCODE"
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"" + $innerCmd + "`"")
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 365)
    $cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
    try {
        Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilho -Settings $cfg -RunLevel Highest -Description $Descricao | Out-Null
        $t = Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue
        if ($t) {
            $i = $t | Get-ScheduledTaskInfo
            Write-Output ("  OK: Estado=" + $t.State + " | Proxima=" + $i.NextRunTime)
        } else {
            Write-Output "  FALHA: tarefa nao apareceu apos registro"
        }
    } catch {
        Write-Output ("  ERRO: " + $_.Exception.Message)
    }
    Write-Output ""
}

Restaurar-KeepAlive -Nome 'SOMA - KeepAlive Sessao' `
    -ScriptJs 'C:\projetos\chamados\scripts\soma_keepalive.js' `
    -LogPath 'C:\projetos\chamados\logs\soma-keepalive.log' `
    -Descricao 'Mantem sessao SOMA viva a cada 15min'

Restaurar-KeepAlive -Nome 'CertPonto - KeepAlive Sessao' `
    -ScriptJs 'C:\projetos\certponto-report\keepalive_session.js' `
    -LogPath 'C:\projetos\certponto-report\keepalive.log' `
    -Descricao 'Mantem sessao CertPonto viva a cada 15min'

Restaurar-KeepAlive -Nome 'PowerBI - KeepAlive Sessao' `
    -ScriptJs 'C:\projetos\perdadereceita\scripts\pbi_keepalive.js' `
    -LogPath 'C:\projetos\perdadereceita\logs\pbi-keepalive.log' `
    -Descricao 'Mantem sessao Power BI viva a cada 15min'

Write-Output "=========================================="
Write-Output "RESUMO FINAL"
Write-Output "=========================================="
foreach ($n in @('SOMA - KeepAlive Sessao', 'CertPonto - KeepAlive Sessao', 'PowerBI - KeepAlive Sessao')) {
    $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
    if ($t) {
        $i = $t | Get-ScheduledTaskInfo
        Write-Output ("OK: " + $n + " | " + $t.State + " | Proxima=" + $i.NextRunTime)
    } else {
        Write-Output ("FALHA: " + $n)
    }
}
Write-Output ""
Write-Output "PRONTO. Os tres keepalives agora rodam a cada 15 minutos."
Write-Output "LIMITACAO: se a sessao ja expirou, o keepalive so avisa - nao reloga automaticamente."
Write-Output "Nesse caso entre por RDP e faca login manual."