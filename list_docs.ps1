$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }
$dir = 'C:\projetos\chamados\docs'
if (Test-Path $dir) {
    Get-ChildItem $dir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
} else {
    Write-Output "Directory not found: $dir"
}