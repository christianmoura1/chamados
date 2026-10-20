$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }

Write-Output "=== Project root structure ==="
Get-ChildItem 'C:\projetos\chamados' -Directory | Select-Object Name | Format-Table -AutoSize

Write-Output "`n=== Searching for perda_receita*.json ==="
Get-ChildItem 'C:\projetos\chamados' -Recurse -Filter 'perda_receita*.json' -ErrorAction SilentlyContinue |
    Select-Object FullName, Length, LastWriteTime |
    Format-Table -AutoSize

Write-Output "`n=== Searching for any .json in project ==="
Get-ChildItem 'C:\projetos\chamados' -Recurse -Filter '*.json' -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git' } |
    Select-Object FullName, Length, LastWriteTime |
    Format-Table -AutoSize