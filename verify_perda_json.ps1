$ESPERADO = 'CSMOURA1-VOUCHE'
if ($env:COMPUTERNAME -notlike ($ESPERADO + '*')) { Write-Output 'ABORTADO'; exit 9 }

$f = 'C:\projetos\perdadereceita\data\chamados-abertos-perda.json'
if (-not (Test-Path $f)) { Write-Output 'File not found'; exit 1 }

$bytes = [System.IO.File]::ReadAllBytes($f)
Write-Output ('Size: ' + $bytes.Length)
Write-Output ('First 10 bytes: ' + [string]::Join(',', $bytes[0..9]))

try {
    $text = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
    $null = $text | ConvertFrom-Json
    Write-Output 'JSON validation: OK'
    Write-Output ('First 100 chars: ' + $text.Substring(0, [Math]::Min(100, $text.Length)))
} catch {
    Write-Output ('JSON validation FAILED: ' + $_.Exception.Message)
}