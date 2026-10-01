# Assistente do Microsoft Forms

Versão de desenvolvimento **15.10.5**, derivada da referência histórica `V15.8.1(2).zip`.

A 15.10.5 encerra a instância da aba quando o navegador invalida a conexão após uma atualização da extensão. O aviso oferece recarregar a aba do Forms após salvar. Cópia e download são cancelados quando a conexão é perdida ou as imagens não podem ser embutidas; não há conclusão falsa de um arquivo incompleto. Permissões e dados salvos permanecem iguais.

A 15.9.7 divide a leitura do painel em etapas com oportunidade de entrada e pintura entre questões. Leituras interrompidas por edição, mutação ou troca de formulário são descartadas. Indicadores de pendência deixaram de animar continuamente. As ações que exigem auditoria síncrona mantêm o contrato anterior; a rotina de edição matemática não foi alterada.

A 15.9.0 deixou de ser uma migração byte a byte e corrigiu os principais riscos da auditoria. A 15.9.1 reforçou a ação de inserir letras em alternativas matemáticas. A 15.9.2 amplia essa proteção para alternativas textuais, endurece migração/concorrência dos lotes, valida melhor arquivos EvalBee e torna operações de limpeza verificáveis. A 15.9.3 acrescenta o histórico local de questões. A 15.9.4 atualiza o número de versão para publicação. A **15.9.5** reduz as leituras repetidas do histórico e evita versões criadas por estados transitórios do editor. A referência original 15.8.1 continua preservada em `config/baseline-v15.8.1.json`.

> **Segurança:** SheetJS CE foi atualizado para 0.20.3 e planilhas passam por limites compartilhados de tamanho, estrutura ZIP e dimensões antes do processamento. Consulte [Segurança](docs/SECURITY.md).

## Regra do repositório

A raiz de `mcpmieda/extensoes` contém **somente pastas de extensões**. Esta extensão vive integralmente em `assistente-microsoft-forms/`. Documentação, agentes, configurações, ferramentas e recursos ficam aqui dentro. Não criar README, AGENTS, `.github`, arquivos compartilhados ou outras pastas na raiz sem solicitação expressa do proprietário.

## Trabalhar no código

Requer Node.js 22 ou superior. Não é necessário baixar dependências para compilar, verificar ou empacotar esta versão.

```sh
cd assistente-microsoft-forms
npm run build
npm run check
npm test
npm run package
```

| Comando | Resultado |
| --- | --- |
| `build` | Gera `dist/` a partir de `src/` e `public/`. |
| `check` | Verifica build, sintaxe, caminhos, permissões, recursos e integridade das bibliotecas. |
| `test` | Executa `check` e os testes comportamentais de regressão. |
| `test:behavior` | Testa invariantes críticos sem depender de uma sessão real do Forms. |
| `verify:baseline` | Compara com a V15.8.1 histórica. **Deve falhar na versão atual**, porque há alterações intencionais. |
| `package` | Gera ZIP instalável e SHA-256 em `release/`, com conteúdo e metadados determinísticos. |

Depois de uma alteração funcional intencional, `verify:baseline` deve detectar a diferença. **Não reescrever a referência histórica para esconder alterações.** A verificação normal é `check`; a referência original continua registrada para auditoria.

## Carregar no navegador

Execute `npm run build`. Em `edge://extensions` ou `chrome://extensions`, ative o modo de desenvolvedor e escolha **Carregar sem compactação**, selecionando a pasta **`dist/` desta extensão**, não a raiz do repositório e nem `src/`.

O ZIP em `release/` contém o manifesto na raiz; ele pode ser extraído para carregar a versão compilada. Distribuição em lojas, assinatura e atualização automática não foram configuradas.

Ao substituir uma instalação existente, use o procedimento de atualização dessa instalação e conserve um backup dos dados. Carregar outra pasta como uma nova extensão pode resultar em outra identidade e outro armazenamento; a migração do código não transfere automaticamente os dados entre instalações.

## Ferramentas para Word

Na 15.10.4, **Copiar questões** e **Baixar Word** mantêm o fluxo normal, executado pela própria extensão. O editor **Finalizar simulado / Word formatado**, seus recursos e a comunicação nativa com o Word foram removidos por solicitação do proprietário. Não é necessário instalar conector ou macro para baixar o Word.

## Histórico local de questões

A 15.9.6 usa o identificador permanente exposto pelo Forms. Registros anteriores que usavam apenas a posição permanecem separados como **Histórico antigo por posição**; não são associados automaticamente a uma questão renumerada. Sem identificador permanente, a captura aguarda o Forms disponibilizá-lo.

As versões e imagens agora participam do backup consolidado. Exportar em um navegador e importar no outro permite transferir e mesclar os históricos; não há sincronização automática entre navegadores. Backups antigos continuam aceitos. A importação repetida não duplica a mesma versão (data e conteúdo iguais). O histórico no backup tem limite de 32 milhões de caracteres serializados; acima disso, a exportação informa falha sem apagar registros. Arquivos de importação têm limite de 64 MB.

A consulta carrega até cinco versões por página, com orçamento de 28 milhões de caracteres por resposta (uma versão individual pode ocupar a página). Cada questão admite até 100 versões: ao atingir esse limite, a captura mostra uma falha e aguarda o usuário exportar/apagar versões. Não há descarte automático. A limpeza de todo o app também apaga o histórico. Após exclusões, só permanece uma assinatura SHA-256 sem o texto para evitar recriação imediata da versão apagada.

Na 15.9.8, o histórico é exclusivamente manual. Em **Salvamento de dados**, clique em **Gravar histórico agora** para registrar as questões carregadas. **Consultar histórico** abre as versões anteriores, inclusive de questões removidas. Não existem selos sobre as questões, captura ao abrir/editar ou listeners de rolagem do histórico. Novas edições só entram no histórico após outro clique; versões idênticas não são duplicadas. Os registros antigos, backup e exclusão continuam disponíveis. Se houver edição durante a gravação, as questões restantes são informadas como não gravadas; não há tentativa automática posterior.

O histórico usa IndexedDB no armazenamento privado da instalação da extensão e permanece após fechar o navegador ou desligar o computador. Ele não é sincronizado entre Chrome e Edge, entre perfis ou entre instalações com identidades diferentes. Apagar dados da extensão no navegador também apaga o histórico. A extensão tenta guardar uma cópia local das imagens permitidas, até 5 MB por imagem e 20 MB por versão; quando não consegue, preserva o endereço e o texto alternativo. Fórmulas são preservadas como representação textual/MathML quando presentes na página. Questões que o Forms não carregou no DOM ainda não podem ser capturadas até aparecerem na edição.

## Organização

```text
assistente-microsoft-forms/
├── src/
│   ├── content/           # 18 áreas funcionais, com funções agrupadas por responsabilidade
│   ├── background/        # Segurança das mensagens, imagens e mídia pedagógica
│   ├── storage/           # Persistência, backend, migração e API
│   ├── styles/            # Estilos do painel separados por área
│   └── resources/         # HTML, CSS interno e modelo de planilha
├── public/
│   ├── manifest.json      # Manifesto preservado
│   ├── assets/            # Imagens e CSS de impressão
│   ├── icons/             # Ícones originais
│   └── vendor/            # Bibliotecas locais e suas licenças
├── config/                # Build, recursos, política, dependências e referência histórica
├── scripts/               # Compilar, verificar e empacotar
├── docs/                  # Arquitetura, validação, segurança e evolução
├── AGENTS.md              # Instruções para agentes de desenvolvimento
└── package.json
```

`dist/`, `release/`, `reports/`, dados locais e `node_modules/` não devem ser versionados. Os arquivos gerados não são a fonte de verdade.

## O que esta modularização significa

As funções foram separadas em arquivos editáveis e os recursos estáticos foram retirados de grandes literais do código-fonte. A composição ocorre **durante o build**, mantendo a ordem e os escopos léxicos originais. Não foram criados carregadores remotos, `eval`, novas permissões ou chamadas de rede.

Os módulos-fonte **ainda não são módulos ES independentes**: há dependências entre funções do escopo legado. Essa escolha permite verificar que a primeira migração não alterou o programa entregue ao navegador. A separação futura por interfaces explícitas deve ser feita por área, com validação real. O tamanho e o desempenho do pacote executado não foram otimizados nesta etapa.

Leia [Arquitetura](docs/ARCHITECTURE.md), [Validação](docs/VALIDATION.md), [Desenvolvimento](docs/DEVELOPMENT.md) e [Segurança](docs/SECURITY.md). O inventário das áreas está em [`docs/module-map.json`](docs/module-map.json).
