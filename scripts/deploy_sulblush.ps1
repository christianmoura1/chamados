$env:GIT_SSH_COMMAND = "ssh -i C:/Users/csmoura1/.ssh/deploy_chamados_pessoal -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
Set-Location C:\projetos\chamados
git add index.html campo.html risco.html preventivas.html tecnicos.html
git commit -m "Link Perda de Receita aponta para perdadereceita.vercel.app"
git push