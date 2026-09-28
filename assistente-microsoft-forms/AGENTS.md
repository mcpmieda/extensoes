# Instruções para agentes — Assistente do Microsoft Forms

## Limites obrigatórios

- A raiz do repositório contém somente pastas de extensões. Trabalhar nesta pasta. Não criar arquivos na raiz nem `.github/` sem solicitação expressa do proprietário.
- Não alterar outra extensão nem o repositório `ecossistema-escola` como parte desta tarefa.
- Ler README, arquitetura, segurança e a função original antes de modificar o código. Trabalhar em `src/` e `public/`, nunca corrigir somente `dist/`.
- Não publicar tokens, chaves, cookies, respostas reais, backups, listas de alunos, notas, arquivos importados ou capturas com dados pessoais. Não introduzir telemetria ou serviços externos como consequência de uma refatoração.
- Não ampliar permissões, domínios, acesso ao Forms ou contratos de armazenamento silenciosamente. A política revisada está em `config/security-policy.json`.
- Não escolher uma licença para o código autoral sem decisão do proprietário. Preservar os avisos e as licenças de terceiros.

## Arquitetura desta versão

`src/content/index.js` compõe 18 áreas funcionais. `scripts/build.mjs` resolve `/* @include caminho */` e `__GSSF_RESOURCE__("CHAVE")` no computador de desenvolvimento. O navegador recebe scripts locais comuns, com os escopos originais.

Os arquivos-fonte são unidades de composição, não módulos ES isolados. Não substituir includes por imports no manifesto, não reordenar módulos, não mover declarações entre closures e não converter a IIFE principal para execução assíncrona sem revisar inicialização, eventos e compatibilidade. Não inserir recursos inline gigantes em novos arquivos de lógica; usar `config/resources.json`.

Preservar chaves de armazenamento, nomes de bancos IndexedDB, protocolos de mensagens, identificadores de runtime e APIs globais existentes. Mudanças de identidade exigem estratégia explícita de migração. Não misturar atualização de dependências com uma refatoração apresentada como equivalente byte a byte.

## Fluxo de trabalho

Planejar a alteração; implementar no escopo final; executar as verificações técnicas sobre o pacote final; validar o comportamento no Microsoft Forms real e autenticado. Priorizar a experiência real do proprietário. Não criar ambientes sintéticos extensos sem necessidade ou substituir validação real por mocks.

```sh
npm run check
npm run verify:baseline  # Apenas quando a entrega promete equivalência com a original.
npm run package
```

A referência `config/baseline-v15.8.1.json` é histórica e imutável. Uma evolução funcional deve diferir dessa referência; não ajustar os hashes para fingir equivalência. Atualizações intencionais das bibliotecas devem atualizar `vendor-lock.json`, licenças e documentação de origem, sem apagar a referência antiga.

Relatar separadamente o que foi editado, compilado, tecnicamente verificado, testado no Forms e efetivamente publicado no GitHub. Nunca afirmar que um ZIP local, um commit local ou um blob ainda não associado a uma branch foi publicado. Confirmar a branch e o commit remoto após gravações.

## Entregas e revisão

Usar commits pequenos por finalidade, sem force-push. Não encerrar issues apenas por semelhança textual: conferir o código atual e a evidência. Antes de publicar, revisar `git diff --stat`, o conjunto de arquivos e eventuais dados privados. Registrar limitações e pendências reais em vez de declarar aprovação total.

GitHub Actions permanece sem configuração: o serviço exige `.github/workflows/` na raiz, o que depende de autorização para abrir uma exceção à regra do repositório. Não criar um workflow em pasta interna alegando que será executado automaticamente.
