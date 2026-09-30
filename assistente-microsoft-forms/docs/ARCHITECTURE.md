# Arquitetura — referência 15.8.1 e evolução 15.9.7

Na 15.9.7, `auditPageSteps` é um gerador compartilhado: `auditPage` o consome sincronamente para preservar os contratos existentes; o painel usa `auditPageCooperatively`, cedendo uma macrotarefa entre questões. Revisão de conteúdo, prazo de edição, documento ativo, visibilidade e ciclo de vida invalidam a leitura em andamento. O log informa tempo total e maior etapa de leitura; a etapa de apresentação do painel ainda não está incluída nessa maior etapa. Não há promessa de limite rígido de duração por questão.

## Histórico e desempenho na 15.9.6

O banco e as stores do histórico mantêm seus nomes. Na primeira operação do service worker, fingerprints legados contendo texto são convertidos em SHA-256; metadados de questões sem versões são reduzidos à identidade, sequência, contagem e assinatura. Versões legadas `number:N` permanecem recuperáveis no índice do formulário, sem associação automática aos novos IDs `QuestionId_`. A fila do service worker serializa captura, exclusão, exportação e importação entre abas. A importação valida todos os registros antes de sua transação de gravação e preserva as versões locais.

O protocolo existente ganhou `clearAll`, `listPage`, `exportPage`, `validateImport` e `import`. O backup v5 inclui `questionHistory` e continua lendo backups anteriores. Exportação percorre um registro por mensagem; consulta usa cursor reverso, até cinco versões e orçamento de tamanho. Limite de 100 versões por questão interrompe novas capturas com erro visível, sem remover versões antigas.

A checagem periódica consulta apenas IDs e contagens estruturais, sem leituras de layout. O mapa durante rolagem usa blocos conhecidos pela última coleta. A coleta indexa números uma vez em vez de procurá-los repetidamente. A descoberta de seções consulta seletores do Forms e cabeçalhos, sem varrer todos os elementos da página. O observador ignora a interface do histórico e só agenda análise para mutações de questões/seções. A análise integral ainda é síncrona; a duração real após estas mudanças precisa ser medida no Forms com a extensão recarregada.

## Objetivo e escopo

Transformar uma distribuição pronta em uma base editável e rastreável sem alterar o programa executado. O ZIP tinha 17 arquivos, incluindo um `content.js` de 2.107.006 bytes com 16.231 linhas. Esse script já continha 18 marcações de módulos, recuperadas nesta estrutura.

A arquitetura em execução permanece a original: o manifesto carrega o armazenamento, SheetJS, JSZip e o content script; o service worker cuida das mensagens, imagens e mídia persistida. O conteúdo do Forms não ganhou servidor adicional. Na 15.9.2, lotes pedagógicos são persistidos pelo service worker em IndexedDB da própria extensão.

O histórico de questões adiciona o protocolo `GSSF_QUESTION_HISTORY` ao service worker, restrito aos remetentes já autorizados do Forms. O banco `gssf-question-history-v1` armazena metadados e versões separadamente, em transações atômicas. Novas capturas exigem identidade estável exposta pelo Forms; os registros legados por número ficam separados. O painel oferece uma lista geral para consultar versões de questões removidas.

## Camadas de edição

| Área | Responsabilidade |
| --- | --- |
| `src/content/core` e `bootstrap` | Estado, elegibilidade, interface principal e ciclo de vida. |
| `forms-dom`, `alternatives`, `math-audit` | Adaptação ao Forms, ações nas alternativas e editor matemático. |
| `clipboard-word` | Cópia, sanitização, imagens, parágrafos, MathML e Word. |
| `audit-bank`, `omr-import`, `analysis-dashboard` | Auditoria, banco, gabaritos, correspondências e indicadores. |
| `response-tools`, `spreadsheet-adapter`, `shared-bridge`, `pedagogical-storage` | Navegação, validação central de planilhas, contrato entre ferramentas e ponte de persistência pedagógica. |
| `answer-card`, `printing`, `diagnostic`, `organizer` | Ferramentas pedagógicas e suas funções internas. |
| `backup-observer` e `src/storage` | Backup, mesclagem, migração, persistência e observação. |
| `src/background` | Limites e autorização de mensagens, busca de imagens e mídia IndexedDB. |
| `src/styles`, `src/resources` e `public` | Estilos, HTML, modelo de planilha, imagens, ícones e bibliotecas. |

As subdivisões preservam grupos de declarações e funções inteiras. Nos runtimes maiores, os includes permanecem dentro da closure correspondente. Um `index.js` com poucos includes expressa a ordem de composição daquela área.

## Recursos e build

`config/build.json` aponta as quatro entradas geradas. `public/` é copiada para a distribuição e `src/` é expandida em `content.js`, `content.css`, `background.js` e `storage.js`.

A diretiva `/* @include ./arquivo.js */` incorpora texto durante a compilação. O marcador `__GSSF_RESOURCE__("CHAVE")` incorpora um literal corretamente escapado a partir de `config/resources.json`. O navegador nunca recebe essas diretivas nem precisa executar um compilador.

CSS e HTML estáticos têm arquivos próprios. O modelo de turma é um XLSX editável. Os padrões de logo e OMR usam os mesmos arquivos binários de `public/assets/` já presentes no original, eliminando a cópia base64 do código-fonte. O build recria a representação original para preservar impressão, fallback e comportamento. Algumas adaptações dinâmicas de CSS e templates interpolados continuam em funções, pois dependem do estado em execução.

O conjunto de permissões não foi ampliado para viabilizar a extração dos recursos: eles são incorporados no build, não buscados por uma nova API em tempo de execução.

## Dependências e contratos preservados

Persistem `GSSF_STORAGE`, `GSSFResponseTools`, `GSSFSharedBridge` e as APIs públicas das ferramentas. A linha 15.9.x usa `GSSF_PEDAGOGICAL_DATA`: Impressão e Diagnóstico deixam de manter seus lotes no origin do Forms e passam a usar stores no IndexedDB do service worker. Uma migração verificada importa os bancos legados antes de excluí-los. A identidade dos registros e dos alunos não é reescrita pela migração.

As áreas ainda compartilham funções no escopo principal. Esta entrega cria limites de arquivos; **não conclui a eliminação do acoplamento interno**. A próxima etapa técnica é extrair contratos por área, um de cada vez, sem perder o comportamento comprovado desta referência.

## Referências técnicas

- Content scripts e ordem de carregamento: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Service workers de extensões: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
- Localização obrigatória de workflows: https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows

Essas referências descrevem a plataforma. A equivalência desta migração é sustentada pela comparação dos próprios arquivos, registrada em `VALIDATION.md`.
