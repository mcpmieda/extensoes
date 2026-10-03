# Exportação Word 15.10.6

O arquivo exportado usava números isolados tanto para os títulos quanto para respostas numéricas. Uma macro que esperava o próximo título podia interpretar uma alternativa como uma questão fora da sequência.

A exportação agora identifica títulos como `Questão 01` e acrescenta `A)`, `B)` etc. apenas às alternativas sem letra. A transformação trabalha em um `template` desconectado do documento; não escreve no Forms, não muda respostas corretas e não altera imagens nem as expressões matemáticas. Letras existentes são preservadas. A ausência de um marcador identificável interrompe a exportação com mensagem de erro.

Validação realizada:

- `scripts/check.mjs`: 360 verificações técnicas.
- `scripts/behavior-tests.mjs`: 823 verificações comportamentais.
- Testes de contexto, issue 2, histórico, desempenho e importação segura aprovados.
- `scripts/word-export-tests.html`, aberto no Edge: títulos, respostas numéricas, operadores, HTML rico, MathML, letras existentes, idempotência, rejeição de marcador ausente e preservação da origem.
- Reprodução local sobre um arquivo real já exportado: 40 questões, 160 alternativas e 28 imagens. A transformação preservou o conteúdo; o arquivo foi importado e formatado no Word nativo.

O arquivo real e suas imagens permanecem locais, fora do Git. A versão nova não foi recarregada na instalação do navegador durante esta validação; o teste autenticado do botão com a versão nova ainda depende dessa recarga. O fluxo de captura, permissões, armazenamento e recursos do formulário não foi modificado.

Para repetir os testes de DOM sem instalar dependências, abra `scripts/word-export-tests.html` no Edge ou Chrome. O resultado deve mostrar `ok: true`.
