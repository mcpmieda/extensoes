# Simulado no Word — validação da 15.10.2

Validação realizada em 1º de outubro de 2026, em Windows com Microsoft Word local.

## Alteração publicada

O botão **Finalizar simulado / Word formatado** foi integrado nas fontes modulares, preservando as correções já existentes no repositório para importação, identidade das questões, auditoria e histórico. **Baixar Word** e **Copiar questões** mantêm seu fluxo. O editor inclui título manual da capa/turma, ano, áreas e 65 camadas, incluindo os dois selos laterais.

A macro 6.3 remove a linha vazia antes do título quando a questão é o primeiro conteúdo da página ou coluna. Os espaços entre questões na mesma coluna e após os cabeçalhos de área permanecem. A conversão de quebras manuais trabalha fora das equações OMath e evita o Find/ReplaceAll que encerrava o Word ao formatar novamente uma prova com equações.

## Verificações do pacote final

- `npm run check`: 371 verificações técnicas aprovadas.
- `npm test`: 823 verificações comportamentais, regressões da issue #2, histórico, auditoria e importação segura aprovadas. A auditoria comparou 80.645 casos de distância exata.
- `npm run package`: ZIP instalável e SHA-256 gerados com 31 arquivos.
- As funções de captura, exportação normal de Word e cópia são iguais às usadas na versão local validada. O editor, estilos, modelo, fontes e binários nativos também coincidem com os arquivos validados.
- O service worker compilado foi exercitado com o host nativo real: origem, ações, pasta permitida, resposta única, Word disponível e 65 camadas conferidos.
- O ZIP público contém apenas o modelo vazio de DOCX, recursos e código da extensão. Não contém provas geradas, respostas, capturas do formulário, backups, arquivos de configuração local ou PDFs.

## Word e interface

O conteúdo capturado anteriormente do Forms autenticado foi usado na geração completa com o conector instalado: 46 questões, 29 imagens, 12 equações editáveis, quatro seções e 21 páginas. A revisão visual cobriu as 21 páginas. As páginas renderizadas do documento final ficaram iguais às revisadas e permaneceram idênticas depois da reabertura em uma sessão independente do Word.

A macro instalada foi repetida em uma cópia da prova. A auditoria confirmou texto preservado, as mesmas quantidades de imagens e equações, quatro seções e 21 páginas. A instalação atualizou somente o módulo de formatação e preservou os outros 16 módulos do Word. O documento final não tem quebra manual adicional após a capa nem reinício da numeração por seção.

O campo de título manual foi conferido no editor local com os arquivos reais da extensão: sincronização entre Capa, camada e Finalizar; persistência após reabrir; rejeição de título vazio; manutenção da geometria e da fonte do modelo. A geração no Word confirmou o título escolhido.

## Limites da validação

O pacote modular desta publicação não foi recarregado no Edge durante este envio. Uma tentativa de conferir novamente a aba autenticada pela automação do navegador não estabeleceu conexão. A equivalência das funções de Word com a versão validada foi verificada por comparação do código compilado, e a integração com o service worker foi testada com o host real. Isso não constitui uma nova execução integral da interface publicada no Forms autenticado. Não foi enviado nenhum trabalho à impressora.

O conector é específico para Windows/Word, depende dos runtimes locais indicados nas instruções e requer instalação da macro em Normal.dotm. O ID da extensão e as configurações de cada computador são definidos pelo instalador; configurações locais ficam fora do Git e do ZIP público. A permissão adicional nativeMessaging está documentada na política de segurança. O fluxo não oferece exportação do simulado em PDF.
