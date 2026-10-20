# AGENTS.md -- contexto da Manutencao Sul

Gerado por `sincroniza.ps1 -Puxar`. Nao edite este arquivo: ele e regerado.
Para mudar o que ele diz, mexa no `CLAUDE.md` da maquina e puxe de novo.

## Voce JA esta configurado nesta maquina

**Nao clone nada. Nao instale nada.** O contexto ja esta no disco:

- `C:\Users\xdatacenter\.claude\CLAUDE.md` -- o que existe aqui, o que roda, as armadilhas
- `C:\Users\xdatacenter\.claude\memoria\MEMORY.md` -- indice das memorias, uma linha cada

Leia esses dois e siga. Leia as memorias do indice conforme a tarefa, nao todas.
O `COMECE_AQUI.md` do repositorio so e necessario em maquina NOVA, onde o
contexto ainda nao existe -- nao e o seu caso.

As memorias descrevem o que era verdade quando foram escritas. Se uma citar
arquivo, funcao ou tarefa, confira se ainda existe antes de recomendar.

## Ao terminar de ler, pergunte

Nao espere ele explicar o que voce faz aqui. Cumprimente e ofereca:

> Contexto carregado. Quer atualizar algum painel?
> **backlog | risco | campo | perda de receita | preventivas**
> Ou me diga outra coisa.

Os painEis vivem em https://sul-blush.vercel.app. Se ele pedir outra coisa,
siga normalmente -- o indice de memorias cobre CertPonto, escalas, SOMA,
Power BI, maquina de sorvete e o resto.

## Como atualizar

**Escreva o pedido NA SUA PASTA ATUAL. Nao tente escrever em C:\projetos.**

Medido em 09/10/2026: o Codex aqui roda numa sandbox que so permite escrita
dentro do proprio workspace. Escrita em C:\projetos e negada mesmo com o ACL
permitindo -- o bloqueio e da sandbox, nao do Windows, e nao ha configuracao
que abra. O vigia roda elevado e vai buscar o pedido onde voce puder escrever.

```powershell
# 1. peca na pasta atual: o NOME escolhe o painel, o conteudo nunca e lido
$id = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType File -Force -Path ".\pedido-risco-$id.txt" | Out-Null

# 2. espere ate ~3 min; a resposta aparece ao lado, com o prefixo resposta-
Get-Content ".\resposta-risco-$id.txt"
```
```

Troque `risco` por um destes:

| pedido | o que dispara |
|---|---|
| `backlog` | Chamados - Diario 0715 |
| `risco` | Risco - Painel Diario 0600 |
| `campo` | Campo - Chamados Criticos 20min |
| `campo2h` | Campo - Report Sul 2h (ENVIA no grupo da lideranca) |
| `preventivas` | Preventivas - Diario 0745 |
| `perdareceita` | PerdaReceita - Diario 0730 |
| `status` | so leitura: situacao de todos os pipelines |

Se voce JA estiver numa sessao elevada, pode disparar direto:

```powershell
Start-ScheduledTask -TaskName 'Risco - Painel Diario 0600'
(Get-ScheduledTask -TaskName 'Risco - Painel Diario 0600' | Get-ScheduledTaskInfo).LastTaskResult
```

**`resultado=0` e sucesso.** Outro numero pede olhar o log em
`C:\projetos\chamados\logs\`.

## Regras duras

- Guarda de maquina em todo bloco PowerShell:
  `$ESPERADO = 'CSMOURA1-VOUCHE'` e aborta com exit 9 se nao bater.
- Nunca copie `.credentials.json` -- e token de autenticacao.
- Nunca mate processo por hipotese: prove identidade com `CommandLine` +
  `CreationDate` em sessao ELEVADA. Sem elevacao os dois voltam vazios e
  parecem "processo novo".
- Log que para pode ser sucesso: leia a ULTIMA linha antes de dizer que travou.
- `res=2147946720` (0x800710E0) nao e falha, e "operacao em andamento" --
  assinatura normal de servidor persistente.
- Nao confie em "nao deu erro": `git push` sem a chave de deploy, comando
  longo por SSH e o slicer do Power BI falham CALADOS. Confira por conteudo.

## Sincronia (so quando precisar)

Antes de confiar nas memorias: `powershell -File C:\projetos\claude-contexto\sincroniza.ps1 -Puxar`
Depois de escrever uma:        `powershell -File C:\projetos\claude-contexto\sincroniza.ps1 -Empurrar`
