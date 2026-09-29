# Segurança e publicação pública

## Estado da 15.9.2

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

Toda importação passa pelo adaptador compartilhado antes do parser. Os limites atuais são: 25 MiB por arquivo, 1024 entradas ZIP, 32 MiB por entrada descompactada, 128 MiB no total descompactado, 128 abas, 100.000 linhas por aba, 1024 colunas por aba e 500 questões. O preflight mede também a expansão real das entradas ZIP em stream antes do parser; o SheetJS recebe um teto de linhas durante a leitura e o `!fullref` é conferido quando disponível. O Organizador também aplica limites no parser XML próprio.

Esses tetos reduzem risco de travamento e consumo excessivo; não transformam arquivos desconhecidos em conteúdo confiável. Erros de limite devem interromper a importação antes da alteração do formulário.

## Dados pedagógicos

Lotes da Impressão e do Diagnóstico são persistidos em IndexedDB no **service worker/origin da extensão**, via mensagens validadas pelo remetente. Cada registro recebe uma revisão interna e gravações/exclusões com revisão obsoleta são rejeitadas, impedindo que uma aba antiga sobrescreva silenciosamente outra aba. Os bancos antigos nos origins do Microsoft Forms são migrados por hostname. Se a exclusão do legado ficar bloqueada, a cópia verificada é marcada como `cleanupPending` com uma impressão digital do legado; a próxima abertura tenta somente a limpeza se o legado estiver inalterado. Conflitos reais preservam os dois lados.

Não versionar dados importados, notas, backups, cookies, arquivos de autenticação ou capturas com dados pessoais.

## Integridade das alternativas

A ação **Inserir letras** é não destrutiva: ela não remove separadores nem operadores existentes. A ação **Remover letras** remove apenas a letra esperada, preservando pontuação e operadores.

Na rota matemática, a 15.9.1 elimina o reparo que reconstruía a expressão inteira. A inserção faz uma única tentativa de prefixo e só é considerada bem-sucedida quando o corpo original continua reconhecível. Se a posição ou o conteúdo não puderem ser confirmados, a ação reporta falha e não executa uma segunda correção. Casos ambíguos como `A+25`, `A−25` e `E = E` são deixados intactos.

Com isso, conteúdos como `-25`, `+25`, `A+5`, `B-3`, `A√25`, `B∑x`, `C%5`, `D^2`, `E·x`, letras terminais legítimas e símbolos não previstos não devem ser descartados ou receber letra duplicada por heurísticas de separador ou reparo. **Remover letras** não remove um prefixo quando o restante começa por número, agrupador ou símbolo matemático.

## Integridade e referência histórica

`config/vendor-lock.json` registra a dependência ativa. `config/baseline-v15.8.1.json` permanece imutável como referência histórica e não deve ser atualizado para fazer a 15.9.0 parecer equivalente ao pacote antigo.
