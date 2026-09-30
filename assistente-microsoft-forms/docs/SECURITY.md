# Segurança e publicação pública

## Estado da 15.9.4

A 15.9.0 corrigiu os principais achados da auditoria registrada na issue #1. A 15.9.1 reforçou a integridade das alternativas matemáticas. A 15.9.2 corrige lacunas remanescentes em alternativas textuais, concorrência, migração, limpeza e validação de EvalBee, sem ampliar permissões nem adicionar telemetria, servidores ou código remoto. O pacote continua executando dependências vendorizadas localmente.

## SheetJS CE 0.20.3

`public/vendor/xlsx.full.min.js` foi atualizado de 0.18.5 para **0.20.3**. O build oficial 0.20.3 tem MD5 `6b3130af1ceadf07caa0ec08af7addff`, checksum publicado pela própria documentação do SheetJS.

Essa atualização supera as versões corrigidas para:

- CVE-2023-30533 (prototype pollution): correção a partir de 0.19.3;
- CVE-2024-22363 (ReDoS): correção a partir de 0.20.2.

Referências:

- https://cdn.sheetjs.com/advisories/CVE-2023-30533
- https://cdn.sheetjs.com/advisories/CVE-2024-22363
- https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- https://docs.sheetjs.com/docs/miscellany/contributing/

## Limites de planilha e ZIP

Toda importação passa pelo adaptador compartilhado antes do parser. Os limites atuais são: 25 MiB por arquivo, 1024 entradas ZIP, 32 MiB por entrada descompactada, 128 MiB no total descompactado, 128 abas, 100.000 linhas por aba, 1024 colunas por aba, 2 milhões de posições por aba, 4 milhões por workbook e 500 questões. Áreas mescladas ficam limitadas a 50 mil posições cada, 100 mil por aba e 200 mil por workbook, com no máximo 10 mil áreas por aba e 20 mil por workbook. O preflight mede também a expansão real das entradas ZIP em stream antes do parser; o SheetJS recebe um teto de linhas durante a leitura e o `!fullref` é conferido quando disponível. O Organizador também aplica limites no parser XML próprio.

Esses tetos reduzem risco de travamento e consumo excessivo; não transformam arquivos desconhecidos em conteúdo confiável. Erros de limite devem interromper a importação antes da alteração do formulário.

## Dados pedagógicos

Lotes da Impressão e do Diagnóstico são persistidos em IndexedDB no **service worker/origin da extensão**, via mensagens validadas pelo remetente. Cada registro recebe uma revisão interna e gravações/exclusões com revisão obsoleta são rejeitadas. O banco mantém a última revisão por identidade em uma store separada, inclusive depois de excluir ou limpar lotes, para que uma recriação não volte a aceitar uma cópia antiga. Os bancos antigos nos origins do Microsoft Forms são migrados por hostname. A migração não exclui automaticamente o banco legado: ele permanece para recuperação, e seu fingerprint é verificado em cada abertura para detectar alterações de uma aba antiga. Uma alteração conflitante interrompe a migração sem sobrescrever nenhum lado.

Não versionar dados importados, notas, backups, cookies, arquivos de autenticação ou capturas com dados pessoais.

O histórico de questões fica apenas no IndexedDB privado da extensão (`gssf-question-history-v1`). Não há envio a servidores próprios nem sincronização entre navegadores. As mensagens aceitam apenas content scripts do Forms autorizados pelo manifesto; cada captura textual tem limite de 1 milhão de caracteres serializados. Para preservar imagens, o service worker busca apenas domínios de imagem já autorizados, com limite de 5 MB por imagem e 20 MB por versão. O painel apresenta texto com `textContent`, sem executar o HTML guardado. O usuário pode excluir uma versão ou todas as versões de uma questão; o fingerprint permanece para impedir recaptura imediata após a exclusão. A exclusão dos dados da extensão pelo navegador também remove esse banco.

O banco de gabaritos é atualizado por alterações de formulário e de campo de questão enviadas ao service worker. Ele lê o valor mais recente e serializa as gravações de todas as abas; eventos de `chrome.storage.onChanged` atualizam os caches das abas abertas. O `flush` inclui essas gravações e informa falhas pendentes.

## Integridade das alternativas

A ação **Inserir letras** é não destrutiva: ela não remove separadores nem operadores existentes. A ação **Remover letras** remove apenas a letra esperada, preservando pontuação e operadores.

Na rota matemática, a 15.9.1 elimina o reparo que reconstruía a expressão inteira. A inserção faz uma única tentativa de prefixo e só é considerada bem-sucedida quando o corpo completo original continua reconhecível. Se a posição ou o conteúdo não puderem ser confirmados, a ação reporta falha e não executa uma segunda correção. Casos ambíguos como `A+25`, `A−25` e `E = E` são deixados intactos.

Com isso, conteúdos como `-25`, `+25`, `A+5`, `B-3`, `A√25`, `B∑x`, `C%5`, `D^2`, `E·x`, letras terminais legítimas e símbolos não previstos não devem ser descartados ou receber letra duplicada por heurísticas de separador ou reparo. **Remover letras** só retira prefixos ambíguos quando há registro, nesta sessão, da inserção feita pela extensão e o conteúdo ainda corresponde ao registrado. Sem essa prova, a possível variável permanece intacta.

## Integridade e referência histórica

`config/vendor-lock.json` registra a dependência ativa. `config/baseline-v15.8.1.json` permanece imutável como referência histórica e não deve ser atualizado para fazer a 15.9.0 parecer equivalente ao pacote antigo.
