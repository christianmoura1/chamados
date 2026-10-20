$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }

Write-Output "=== Pipeline scripts referencing perda ==="
Get-ChildItem 'C:\projetos\chamados\scripts' -Recurse -Include '*.ps1','*.js','*.py' -ErrorAction SilentlyContinue |
    Select-String -Pattern 'perda' -SimpleMatch |
    Select-Object Path, LineNumber, Line |
    Format-Table -AutoSize -Wrap

Write-Output "`n=== Scheduled task definition for PerdaReceita ==="
$task = Get-ScheduledTask -TaskName 'PerdaReceita - Diario 0730' -ErrorAction SilentlyContinue
if ($task) {
    $task.Actions | Format-List Execute, Arguments, WorkingDirectory
} else {
    Write-Output "Task not found"
}

Write-Output "`n=== First 200 chars of chamados-abertos-perda.json ==="
$f = 'C:\projetos\chamados\data\chamados-abertos-perda.json'
if (Test-Path $f) {
    $bytes = [System.IO.File]::ReadAllBytes($f)
    Write-Output ('Size: ' + $bytes.Length)
    Write-Output ('First 20 bytes: ' + [string]::Join(',', $bytes[0..19]))
    $text = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
    $len = [Math]::Min(200, $text.Length)
    Write-Output $text.Substring(0, $len)
} else {
    Write-Output "File not found"
}