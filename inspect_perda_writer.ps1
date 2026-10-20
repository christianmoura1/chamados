$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }
Write-Output "=== lista_abertos_v3.cjs ==="
$f = 'C:\projetos\perdadereceita\scripts\lista_abertos_v3.cjs'
if (Test-Path $f) { Get-Content $f -Encoding UTF8 } else { Write-Output "Not found" }
Write-Output "`n=== api/data.js ==="
$f2 = 'C:\projetos\perdadereceita\api\data.js'
if (Test-Path $f2) { Get-Content $f2 -Encoding UTF8 } else { Write-Output "Not found" }
Write-Output "`n=== Searching for writeFileSync in scripts ==="
Get-ChildItem 'C:\projetos\perdadereceita\scripts' -Include '*.js','*.cjs' -Recurse -ErrorAction SilentlyContinue |
 Select-String -Pattern 'writeFileSync|writeFile|fs\.write' |
 Where-Object { $_.Line -match 'abertos|perda' } |
 Select-Object Path, LineNumber, Line |
 Format-Table -AutoSize -Wrap