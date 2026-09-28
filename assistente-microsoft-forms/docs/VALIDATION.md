# Registro de validação — 15.9.0

Data: 28 de setembro de 2026.

## Verificação técnica desta alteração

Antes da substituição final da dependência vendorizada, o projeto recompilou os 17 arquivos de runtime e passou **348 verificações técnicas** e **61 verificações comportamentais**. Os testes comportamentais cobrem preservação de símbolos em alternativas, idempotência da inserção, remoção conservadora, associação histórica estrita, rejeição de planilhas/ZIPs acima dos limites e ausência de abertura dos bancos principais de Impressão/Diagnóstico no origin do Forms.

O SheetJS 0.20.3 selecionado para a entrega foi verificado separadamente contra o MD5 oficial `6b3130af1ceadf07caa0ec08af7addff`, publicado pelo fornecedor. A substituição muda deliberadamente a baseline; `verify:baseline` não é critério de aprovação da 15.9.0.

**Validação real autenticada no Microsoft Forms não foi executada nesta sessão.** Antes de considerar a issue de auditoria encerrada, testar no Forms real: inserção e remoção em alternativas comuns e matemáticas, importações conhecidas, migração/reabertura dos lotes, diagnóstico histórico, Organizador, impressão e autosave.

---

# Registro de validação — migração V15.8.1

Data: 28 de setembro de 2026. Ambiente técnico: Node.js 22.16.0, Linux.

## Evidências obtidas no projeto completo preparado

- `npm run verify:baseline`: **362 verificações técnicas aprovadas**. Inclui compilação, sintaxe JavaScript, recursos declarados no manifesto, política de permissões/origens, integridade das bibliotecas e comparação histórica.
- **17 de 17 arquivos de runtime** iguais ao original em tamanho e SHA-256; a comparação direta dos bytes também passou. O conjunto de nomes e caminhos é o mesmo.
- **154 arquivos-fonte e de recursos** alcançáveis pelo build; **18 áreas funcionais** de content script; **14 registros de recursos incorporados**. Os 154 não são 154 módulos ES independentes.
- `npm run package`: ZIP produzido com manifesto na raiz, sem fontes de desenvolvimento, documentação, dados locais ou arquivos de trabalho.
- Empacotamentos repetidos, inclusive nos fusos `UTC` e `America/Bahia`, produziram o mesmo SHA-256.

SHA-256 do ZIP instalável `assistente-microsoft-forms-15.8.1.zip`:

```text
d9254ceed4dfce75c2fcbb3d8621c5f6b467f2e610b58b2729df6a2e6b6a4907
```

O relatório gerado em `reports/check.json` contém as verificações individuais. É um resultado local descartável, não código-fonte. A quantidade de verificações **não é uma quantidade de testes comportamentais no navegador**.

## Limitações explícitas

Não foi executada uma sessão autenticada no Microsoft Forms; não foram testados Edge real, impressão física, importação de uma turma real, sincronização entre navegadores nem atualização de uma instalação já em uso. Não houve aprovação em loja nem ativação de atualização automática.

A igualdade dos arquivos comprova que esta migração mantém o programa distribuído; não comprova que a versão original não tenha erros. A checagem básica de padrões de segredo não é auditoria de segurança completa. A pendência de SheetJS descrita em `SECURITY.md` continua aberta.

Os resultados dizem respeito ao **projeto completo preparado**. A existência deste documento em uma branch não comprova que todos os fontes tenham sido transferidos: conferir também a árvore e o commit publicados. Não declarar publicação integral apenas porque o build local passou.

## Validação operacional posterior, com dados sob controle do proprietário

No navegador e no formulário real autorizado: abrir a edição, verificar carregamento único do painel e testar o fluxo habitual. Conferir gabarito, alternativas, seções, importação de planilha conhecida, cartão-resposta, visualização de impressão, diagnóstico, organizador e exportação/backup. Reabrir a página e conferir persistência, sem alterar a identidade da instalação inadvertidamente.

Registrar navegador/versão, origem, ação, resultado e erros de console com dados pessoais removidos. Só marcar a validação operacional como concluída depois de observar esses fluxos; não preencher resultados presumidos.
