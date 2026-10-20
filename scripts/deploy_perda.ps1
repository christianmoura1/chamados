$env:GIT_SSH_COMMAND = "ssh -i C:/Users/csmoura1/.ssh/deploy_chamados_pessoal -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
Set-Location C:\projetos\chamados
git add perda.html data/chamados-abertos-perda.json index.html campo.html risco.html preventivas.html tecnicos.html
git commit -m "Adiciona aba Perda de Receita com chamados abertos e filtros"
git push