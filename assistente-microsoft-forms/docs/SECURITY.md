# Segurança e publicação pública

## Estado da 15.9.0

A 15.9.0 corrige os principais achados da auditoria registrada na issue #1 sem ampliar permissões ou adicionar telemetria, servidores ou código remoto. O pacote continua executando dependências vendorizadas localmente.

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

Toda importação passa pelo adaptador compartilhado antes do parser. Os limites atuais são: 25 MiB por arquivo, 1024 entradas ZIP, 32 MiB por entrada descompactada, 128 MiB declarados no ZIP, 128 abas, 100.000 linhas por aba e 1024 colunas por aba. O Organizador também limita cada XML materializado após a descompactação.

Esses tetos reduzem risco de travamento e consumo excessivo; não transformam arquivos desconhecidos em conteúdo confiável. Erros de limite devem interromper a importação antes da alteração do formulário.

## Dados pedagógicos

Lotes da Impressão e do Diagnóstico passaram a ser persistidos em IndexedDB no **service worker/origin da extensão**, via mensagens validadas pelo remetente. Os bancos antigos nos origins do Microsoft Forms são migrados uma vez por hostname. O banco legado só é apagado depois que os IDs copiados são confirmados no armazenamento da extensão. Se a migração falhar, o legado é preservado.

Não versionar dados importados, notas, backups, cookies, arquivos de autenticação ou capturas com dados pessoais.

## Integridade das alternativas

A ação **Inserir letras** é não destrutiva: ela não remove separadores nem operadores existentes. A ação **Remover letras** remove apenas a letra esperada e o espaço inserido, preservando pontuação e operadores. Assim, conteúdos como `-25`, `+25`, `±`, `×`, `÷`, `=` ou símbolos não previstos não podem ser descartados por uma heurística de separador.

## Integridade e referência histórica

`config/vendor-lock.json` registra a dependência ativa. `config/baseline-v15.8.1.json` permanece imutável como referência histórica e não deve ser atualizado para fazer a 15.9.0 parecer equivalente ao pacote antigo.
