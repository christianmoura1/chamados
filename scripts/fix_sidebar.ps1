$files = @(
    "C:\projetos\chamados\index.html",
    "C:\projetos\chamados\campo.html",
    "C:\projetos\chamados\risco.html",
    "C:\projetos\chamados\preventivas.html",
    "C:\projetos\chamados\tecnicos.html"
)
$old = '<a class="navitem" href="https://perdadereceita.vercel.app" target="_blank" rel="noopener"><span class="dot"></span>Perda de Receita</a>'
$new = '<a class="navitem" href="perda.html"><span class="dot"></span>Perda de Receita</a>'
foreach ($f in $files) {
    if (Test-Path $f) {
        $c = Get-Content $f -Raw
        if ($c.Contains($old)) {
            $c = $c.Replace($old, $new)
            Set-Content -LiteralPath $f -Value $c -NoNewline
            Write-Output "Atualizado: $f"
        } else {
            Write-Output "Link externo nao encontrado: $f"
        }
    } else {
        Write-Output "Arquivo nao existe: $f"
    }
}