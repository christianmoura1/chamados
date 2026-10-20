$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }

Write-Output "=== Project structure ==="
Get-ChildItem 'C:\projetos\perdadereceita' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "`n=== Scripts directory ==="
Get-ChildItem 'C:\projetos\perdadereceita\scripts' -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

Write-Output "`n=== run_daily.js content ==="
$f = 'C:\projetos\perdadereceita\scripts\run_daily.js'
if (Test-Path $f) {
    Get-Content $f -Encoding UTF8
} else {
    Write-Output "File not found"
}

Write-Output "`n=== Data files in perdadereceita ==="
Get-ChildItem 'C:\projetos\perdadereceita' -Recurse -Filter '*.json' -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git' } |
    Select-Object FullName, Length, LastWriteTime |
    Format-Table -AutoSize

Write-Output "`n=== Last 30 lines of run_daily.log ==="
$log = 'C:\projetos\perdadereceita\run_daily.log'
if (Test-Path $log) {
    Get-Content $log -Tail 30 -Encoding UTF8
} else {
    Write-Output "Log not found"
}