# Medição no Edge — 15.9.6 e ajuste 15.9.7

30/09/2026. Versão 15.9.6 confirmada no painel: 46 questões, 184 alternativas, 29 imagens e 11 seções. Histórico da primeira questão abriu por ID permanente, com imagem local carregada (800 px); índice geral mostrou 46 registros atuais e 46 legados separados. Console capturado sem avisos/erros. Isso não equivale à validação de todos os fluxos de escrita/exclusão ou sincronização.

Processo renderer 19916, três janelas consecutivas de aproximadamente 10 s por condição, sem interações planejadas dentro de cada janela:

| Condição | Segundos de CPU nas três janelas |
|---|---|
| Painel aberto | 1,516 / 1,984 / 1,656 |
| Painel oculto | 0,500 / 0,516 / 0,781 |
| Painel reaberto | 2,391 / 1,719 / 2,250 |

Média aberto/reaberto: 1,919 s de CPU por 10 s; oculto: 0,599 s. São medições do processo previamente identificado, não atribuição exclusiva à extensão, nem INP ou percentual global de CPU. A comparação não desativa integralmente a extensão. Carga do Forms, coleta de lixo e outras atividades não foram isoladas.

O log da própria extensão registrou análises de 3523, 3600 e 2848 ms. Um clique de atualização excedeu o prazo da automação, embora a análise tenha concluído. Portanto a 15.9.6 ainda não foi aprovada como livre de travamentos.

A 15.9.7 passa a cooperar com o event loop entre questões e remove animações contínuas das pendências. Testes verificam equivalência do executor, cancelamento por mutação/edição e fechamento do gerador. A nova versão precisa de recarga e medição no Edge antes de concluir melhora de responsividade. Nenhum push nesta sessão.

---

# Registro de validação — 15.9.6

Data: 30 de setembro de 2026.

Correções: identidade permanente para novas capturas; legado por posição mantido separado; remoção de texto residual após exclusão; limpeza global do histórico; backup/mesclagem de versões e imagens; paginação e limite explícito de versões; redução de varreduras na rolagem, checagem periódica e descoberta de seções. Rotina especializada de edição matemática não foi alterada.

Testes de regressão exercitam renumeração, ausência de ID, exclusão de questão seguida de captura incremental, migração de metadados apagados, captura concorrente com limpeza, paginação, ida e volta do backup, importação repetida, rejeição de mídia inválida e limite de 100 versões. Testes dos caminhos frequentes impedem coleta integral na checagem periódica/rolagem; coleta de 500 questões faz no máximo 1000 leituras de número. Isso comprova o comportamento do código exercitado, não um tempo de resposta do Edge.

O diagnóstico anterior encontrou análises de 4676–5374 ms e menor consumo do renderer com o painel oculto. Esses valores são anteriores à correção. A versão corrigida precisa ser recarregada na instalação existente e no formulário para medir novamente; não declarar fluidez, IndexedDB nativo entre abas ou todos os fluxos aprovados apenas pelos testes automatizados. Nenhuma publicação remota está incluída nesta entrega local.

---

# Registro de validação — 15.9.2

Data: 29 de setembro de 2026.

## Auditoria complementar

A 15.9.2 adiciona regressões para:

- alternativas textuais compactas com operador/símbolo após A/B/C/D/E;
- remoção conservadora em expressões e alternativas numéricas;
- rota matemática com símbolos fora da lista original;
- migração com limpeza legada bloqueada e retry posterior;
- comparação canônica de registros migrados;
- proteção contra gravação obsoleta em outra aba;
- rejeição de EvalBee com questões incompletas/puladas na Impressão;
- rollback de correspondência manual que não pôde ser persistida;
- limpeza verificável e encerramento da Impressão sem referências ao IndexedDB antigo.

A validação real autenticada no Microsoft Forms continua sendo o teste final para comportamento de DOM/autosave.

---

# Registro de validação — 15.9.1

Data: 29 de setembro de 2026.

## Regressão de integridade das alternativas

A 15.9.1 foi criada após uma segunda revisão da ação **Inserir letras**, especialmente da rota matemática.

Validações focadas executadas nesta sessão em Node.js 22:

- **3.005 verificações** sobre alternativas comuns, cobrindo operadores e símbolos em diferentes posições, preservação do texto original e idempotência da segunda execução;
- **521 verificações adicionais** sobre a política conservadora de símbolos e casos matemáticos;
- nenhuma das verificações focadas removeu conteúdo original.

A suíte `scripts/behavior-tests.mjs` foi ampliada de 61 para **586 asserções comportamentais** quando executada integralmente. Esta sessão não executou `npm test` completo sobre um clone local do repositório porque o ambiente de terminal não possui acesso de rede ao GitHub; as verificações focadas acima foram executadas diretamente contra a lógica revisada antes da publicação.

A rota matemática agora segue estes invariantes:

1. nunca usa `select-all` para reconstruir a alternativa durante **Inserir letras**;
2. nunca executa uma segunda edição destrutiva para “reparar” a primeira;
3. não remove A/B/C/D/E no fim de uma expressão;
4. considera casos ambíguos já iniciados pela letra esperada como intocáveis;
5. só confirma sucesso se a letra e o corpo original forem preservados.

**A validação real autenticada no Microsoft Forms continua pendente.** Testar em formulário descartável/controlado antes de usar em avaliação importante, especialmente alternativas normais e matemáticas, autosave e segunda execução da ação.

---

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
