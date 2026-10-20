$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }
Write-Output "=== Scripts referencing chamados-abertos-perda ==="
Get-ChildItem 'C:\projetos\perdadereceita\scripts' -Include '*.js','*.cjs','*.py','*.ps1' -Recurse -ErrorAction SilentlyContinue |
  Select-String -Pattern 'chamados-abertos-perda' -SimpleMatch |
  Select-Object Path, LineNumber, Line |
  Format-Table -AutoSize -Wrap
Write-Output "`n=== Root scripts referencing chamados-abertos-perda ==="
Get-ChildItem 'C:\projetos\perdadereceita' -Include '*.js','*.cjs','*.py','*.ps1' -Depth 0 -ErrorAction SilentlyContinue |
  Select-String -Pattern 'chamados-abertos-perda' -SimpleMatch |
  Select-Object Path, LineNumber, Line |
  Format-Table -AutoSize -Wrap