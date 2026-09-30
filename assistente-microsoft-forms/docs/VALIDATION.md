# Teste real de 5eef3bb — redução confirmada no tempo da análise

30/09/2026, após recarga da extensão confirmada pelo proprietário e recarga do Forms. Duas análises manuais estabilizadas: **676 ms** e **587 ms**. Maior etapa de leitura: **84 ms** e **80 ms**, ambas na descoberta de questões. Apresentação do painel: **102 ms** e **70 ms**. Finalização: **33 ms** e **27 ms**. Referência anterior às duas otimizações: 3979–4108 ms; revisão intermediária: 2303 ms. Os tempos são instrumentação da extensão nesta sessão, sem controle de carga da máquina ou medição de INP. A carga automática não gerou novo log de duração porque ficou abaixo do limiar de registro; o log antigo persistido não foi usado como medida nova.

Verificação no DOM: 46 grupos e 184 alternativas, iguais ao painel. Painel mantém 29 imagens e 11 seções, os seis alertas conhecidos (Q22/Q21 e Q42–46/Q41) e exatamente as mesmas 46 letras de gabarito conferidas antes. Navegação pelo mapa para Q46 concluiu e o marcador ativo passou a 46, sem timeout nesta tentativa. Não houve edição de conteúdo.

Histórico manual após recarga: **0 novas versões, 46 sem alterações, 0 não gravadas, 0 falhas**. Horário da análise permaneceu em 10:57:53 durante a gravação. Console capturado sem avisos/erros. Evidência de melhora substancial nesta sessão, sem aprovação geral de todas as funções: persistem etapas acima de 50 ms e não foi medido o atraso real de digitação/rolagem. Nenhuma nova alteração de runtime, necessidade de recarga ou publicação remota nesta rodada.

---

# Teste real de 8abd03d e redução da varredura de modo

30/09/2026. Após recarga da extensão confirmada pelo proprietário e recarga do Forms: análise inicial 2247 ms, maior etapa 450 ms (finalização), apresentação 1207 ms. Análise manual estabilizada: 2303 ms, maior etapa 522 ms (finalização), apresentação 1103 ms. Na manual: descoberta 120 ms, seções 7 ms, localização de alternativas 13 ms, leitura das alternativas 172 ms, enunciados/modelos vazios 90 ms e repetições 67 ms. A análise anterior custava 3979–4108 ms; houve redução nesta sessão, sem ensaio controlado de CPU nem medida de INP. Etapas longas persistem, portanto fluidez não aprovada.

DOM confirma 46 grupos e 184 alternativas; painel mantém 29 imagens, 11 seções, seis repetições e a mesma sequência de 46 letras de gabarito conferida na rodada anterior. Console capturado sem avisos/erros. Nenhuma edição de questão ou captura de histórico nesta rodada.

Inspeção identificou `pageMode` usando `exactLabel('voltar')`, que consulta todos os elementos da página. Nova revisão local restringe a busca a controles de navegação visíveis fora do assistente; o painel reutiliza o modo da auditoria. A atribuição de tempo à função ainda é inferência pelo código, pois a medição agrupa a finalização e a apresentação. Também corrigida compatibilidade de `isEmptyModel` como callback de `filter`: o índice não pode ser interpretado como textos de alternativas conhecidos. Testes adicionados para esse contrato e detecção de edição/preview, controle Voltar oculto e controle interno do assistente.

`npm test` e `npm run package` aprovados. Pasta atual e ZIP 15.9.8 atualizados; nova revisão ainda requer recarregar a extensão para medição no Forms. Não publicada remotamente nesta etapa.

---

# Otimização local da auditoria — aguardando teste no Forms

30/09/2026. A comparação limitada de textos calcula apenas a faixa diagonal compatível com o limite, reutiliza duas linhas e mantém as decisões dos limiares 0,992/0,997. Enunciados são normalizados uma vez por auditoria. A detecção de modelo vazio reutiliza os textos de alternativas já lidos na mesma passagem; chamadas independentes conservam a leitura normal.

A leitura cooperativa possui pontos de interrupção entre alternativas e agrupa etapas baratas até 8 ms antes de ceder uma macrotarefa. Isso não garante limite de 8 ms: uma etapa individual pode ultrapassá-lo. Descoberta, seções, alternativas, enunciados e repetições têm duração discriminada no log, que agora também mede a apresentação do painel. A rotina especializada de edição matemática não foi alterada.

`npm test` aprovado: 356 verificações técnicas, 823 comportamentais, suítes da issue #2/histórico e 80.645 comparações do algoritmo limitado contra uma matriz completa independente, incluindo distância zero, inclusões, exclusões e substituições. Limiares reais e reutilização das alternativas também passaram. `npm run package` aprovado, 17 arquivos.

Ensaio isolado em Node/vm: 100 comparações de textos sintéticos de 500 caracteres, distância 1 e limite 4, passaram de 16226 ms para 214 ms, mantendo a soma das distâncias em 100. Esses tempos incluem o custo de execução em vm e não estimam o ganho do navegador. A referência real anterior permanece 3979–4108 ms por análise. O teste no Forms da nova revisão depende de recarga da extensão; não há aprovação de fluidez nem publicação remota nesta etapa. Mesma versão 15.9.8 e pasta de instalação para a revisão local.

---

# Teste real da revisão local 15212d4

30/09/2026, após recarga confirmada pelo proprietário. Primeira captura manual na instalação reinstalada: 46 versões, nenhuma falha. Segunda captura sem edição: 0 novas, 46 inalteradas. Recarregamento completo do Forms, seguido de nova captura: novamente 0 novas, 46 inalteradas e nenhuma falha. Histórico da Q19 mostrou uma única versão e fonte MathML sem o wrapper visual, preservando alternativas e C como correta. Índice da instalação atual contém 46 questões; isso não comprova restauração dos registros da instalação anterior.

O horário da análise permaneceu estável durante as consultas/gravações sem alterações: 10:16:51 antes da recarga; 10:18:21 após a recarga, até o final das consultas. Console capturado sem avisos/erros. Não foi feito ensaio isolado de mudança de foco do sistema operacional.

Análises completas ainda custaram 4108 ms (maior etapa 625 ms) e 3979 ms (maior etapa 547 ms). Deduplicação após recarga aprovada neste cenário; fluidez da análise completa continua pendente. Nenhuma nova alteração de runtime nem publicação remota nesta rodada.

---

# Revisão local após reinstalação — 15.9.8

Correções locais posteriores à publicação c27d0ba: histórico usa fonte MathML/LaTeX em vez do wrapper visual MathJax, ordenando atributos do MathML e preservando valores, sinais e conteúdo. Versões já salvas não são reescritas nem apagadas. A primeira gravação manual após a mudança pode criar uma versão de transição nas questões matemáticas, pois a representação antiga incluía HTML visual; comparações posteriores usam a nova representação. Não há captura automática.

Retorno de foco/visibilidade consulta mudanças estruturais e só solicita auditoria completa quando não existe relatório ou há conteúdo alterado. O observer passa a marcar alterações mesmo com a aba oculta, evitando perder edições feitas nesse intervalo. A análise manual completa continua disponível; esta correção reduz disparos desnecessários, sem prometer duração máxima de cada análise.

Suíte completa aprovada, mais regressões de ordenação de atributos, independência do wrapper visual, preservação de desigualdades/variantes matemáticas e retorno de foco após mudança em aba oculta. Validação no Forms da revisão depende de recarregar extensão e página. Mesmo número 15.9.8 e mesma pasta de instalação, por ser revisão local para teste; não publicada no GitHub nesta etapa.

---

# Teste final solicitado — 15.9.8

30/09/2026, formulário descartável autorizado. Contagem independente no DOM do Forms: 46 radiogroups, 184 radios, 29 imagens nos wrappers das questões, 11 cabeçalhos de seção. Todos coincidem com o painel. As 46 letras do gabarito coincidem com os ícones de resposta correta do Forms (conferência da configuração, não validação pedagógica das respostas). Comparação dos enunciados completos confirma os seis alertas: Q22/Q21 e Q42–46/Q41.

Fluidez não aprovada: logs de leitura de 3309, 4138, 3149 e 3808 ms, com maior etapa respectivamente 527, 625, 440 e 532 ms. Uma tentativa de navegar pelo mapa para Q46 expirou e a questão ativa continuou em Q1. Nova tentativa funcionou. Tempos das chamadas de automação não são INP; não houve atribuição exclusiva desses atrasos à extensão.

Consulta ao histórico apresentou `Extension context invalidated`; recarregar apenas a página restabeleceu o acesso aos 92 registros (atuais + legados). Causa da invalidação não determinada. Console capturado após recarga sem avisos/erros. Selos ausentes.

Gravação manual: 1 versão nova, 45 sem alterações, 0 não gravadas, 0 falhas. A nova versão era Q19. Comparação das versões 1 e 2 mostrou alternativas iguais e diferença na ordem dos atributos `style` e `data-mathml` do span MathJax; os detalhes tinham 22026 caracteres em ambas. Nenhuma edição autoral foi feita nesta rodada. Achado: serialização de apresentação pode gerar versão sem mudança autoral. Deduplicação semântica ainda não aprovada. Nenhuma versão foi apagada para esconder o resultado.

Resultado: números e gabarito corretos neste formulário; desempenho e deduplicação do histórico ainda têm pendências. Não concluir estabilidade geral nem publicar como totalmente validado. Nenhuma alteração de runtime nesta rodada de teste.

---

# Histórico manual — 15.9.8

Removidos selos por questão, botão flutuante e captura automática do histórico. Gravação e consulta disponíveis no painel em Salvamento de dados. Testes cobrem ativação sem captura, captura manual, bloqueio durante análise, falhas reportadas e interrupção após alteração do formulário. Regressões verificam ausência de timers/listeners de rolagem e de chamadas de captura no observador e na análise. Banco e versões existentes preservados. A rotina matemática não foi alterada.

Verificação técnica e comportamental executada antes de empacotar. Validação da nova interface no Edge depende de recarregar a extensão e a página; não concluir eliminação de todos os travamentos a partir desta alteração.

---

# Validação ao vivo — 15.9.7

30/09/2026, sessão posterior à recarga. Versão confirmada no painel. Log da extensão: 1410 ms / maior etapa 327 ms; 2780 ms / 432 ms; 3858 ms / 571 ms. Tempo total não é tempo contínuo de bloqueio; maior etapa cobre a leitura, não todas as tarefas do Forms ou a apresentação do painel. Ainda existem etapas suficientemente longas para engasgos perceptíveis.

Navegação pelo mapa até a questão 46 funcionou. Histórico persistido abriu com ID estável e versão anterior. Edição temporária da alternativa D gerou versão 2, mantendo somente C como correta. O texto original foi restaurado depois do teste e a versão 3 foi conferida no histórico, com D original e C correta. O índice preservou 92 registros (46 atuais e 46 legados). Console capturado sem avisos/erros.

Houve timeouts da automação na abertura/ativação do editor; alguns cliques surtiram efeito apesar do timeout. Um `fill` inicial falhou porque o campo ainda não tinha `contenteditable=true`; após ativação, a escrita funcionou. Portanto nem todo erro de automação é evidência de bloqueio da extensão, mas a responsividade completa ainda não está aprovada. Esta rodada não isolou CPU do Forms versus extensão e não mediu INP. Não afirmar que todos os travamentos desapareceram.

---

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
