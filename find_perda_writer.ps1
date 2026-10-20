$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }

Write-Output "=== Searching for chamados-abertos-perda in all project files ==="
Get-ChildItem 'C:\projetos\perdadereceita' -Recurse -Include '*.js','*.cjs','*.py','*.ps1','*.cmd','*.bat' -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git|_backups' } |
  Select-String -Pattern 'chamados-abertos-perda' -SimpleMatch |
  Select-Object Path, LineNumber, Line |
  Format-Table -AutoSize -Wrap

Write-Output "`n=== Searching for lista_abertos invocation ==="
Get-ChildItem 'C:\projetos\perdadereceita' -Recurse -Include '*.js','*.cjs','*.py','*.ps1','*.cmd','*.bat' -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git|_backups' } |
  Select-String -Pattern 'lista_abertos' -SimpleMatch |
  Select-Object Path, LineNumber, Line |
  Format-Table -AutoSize -Wrap

Write-Output "`n=== deploy_abertos.ps1 content ==="
$f = 'C:\projetos\perdadereceita\scripts\deploy_abertos.ps1'
if (Test-Path $f) { Get-Content $f -Encoding UTF8 } else { Write-Output "Not found" }

Write-Output "`n=== Searching for Out-File or > redirect with perda/abertos ==="
Get-ChildItem 'C:\projetos\perdadereceita' -Recurse -Include '*.ps1','*.cmd','*.bat' -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -notmatch 'node_modules|\.git|_backups' } |
  Select-String -Pattern 'abertos|perda' -SimpleMatch |
  Select-Object Path, LineNumber, Line |
  Format-Table -AutoSize -Wrap