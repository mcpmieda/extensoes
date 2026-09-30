# Assistente do Microsoft Forms

Versão de desenvolvimento **15.9.5**, derivada da referência histórica `V15.8.1(2).zip`.

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

## Histórico local de questões

Na edição de um questionário, o assistente salva uma primeira versão das questões carregadas e registra novas versões após mudanças de conteúdo. O botão discreto à esquerda de cada questão abre suas versões; **Histórico de questões**, no canto inferior esquerdo, também permite consultar questões que já foram removidas do Forms. Cada versão pode ser apagada separadamente, ou todas as versões de uma questão podem ser excluídas. A exclusão não recria imediatamente o conteúdo apagado; uma nova edição volta a gerar uma versão.

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
