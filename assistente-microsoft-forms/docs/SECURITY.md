# Segurança e publicação pública

## Situação desta migração

Não foram adicionadas permissões, origens de rede, telemetria, contas de serviço ou dependências. O manifesto e o service worker foram reconstruídos exatamente como no ZIP original. Isso prova preservação, **não ausência de vulnerabilidades**.

A checagem procura padrões básicos de tokens e chaves privadas nas fontes textuais usadas pelo build. Essa busca não é uma auditoria completa de segredos. O modelo XLSX incorporado identifica suas linhas como exemplos; não foram adicionadas listas reais de alunos ou resultados.

Não versionar dados importados, notas, backups, cookies ou arquivos de autenticação. Problemas de segurança com dados reais devem ser descritos sem publicar o dado, o token ou um arquivo explorável desnecessariamente.

## Pendência conhecida: SheetJS CE 0.18.5

A versão do arquivo `public/vendor/xlsx.full.min.js` é 0.18.5. O aviso oficial **CVE-2023-30533** informa que versões até 0.19.2 são afetadas por prototype pollution ao ler arquivos especialmente preparados e recomenda 0.19.3 ou posterior. A extensão efetivamente importa arquivos de planilha, portanto a condição não pode ser descartada como se o uso fosse somente exportação.

Aviso do fornecedor: https://cdn.sheetjs.com/advisories/CVE-2023-30533

Documentação de distribuição: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/

A biblioteca não foi atualizada nesta migração para manter a equivalência histórica verificável. A correção deve ser tratada como uma alteração separada e prioritária, usando uma distribuição oficial atual, revisão das demais notificações e validação de importação no ambiente real. O mínimo citado no aviso não é uma afirmação de que aquela versão antiga seja a escolha atual mais segura.

Até essa revisão, não usar a preservação do pacote como autorização para importar planilhas desconhecidas. Não suprimir avisos de segurança simplesmente para deixar uma checagem verde.

## Integridade e licenças

`config/vendor-lock.json` registra a versão e os hashes dos arquivos locais. `config/baseline-v15.8.1.json` registra todos os arquivos originais. A referência histórica não deve ser alterada quando uma biblioteca for atualizada.

Os arquivos de licença distribuídos pelo autor do ZIP foram preservados em `public/vendor/`. Não foi escolhida uma nova licença para o código autoral da extensão.
