# Assistente do Microsoft Forms

Fontes organizadas da extensão **15.8.1**, originalmente recebida em `V15.8.1(2).zip`.

Esta entrega organiza o desenvolvimento; **não é uma atualização funcional nem uma correção de segurança**. O build de migração reproduz todos os 17 arquivos do pacote original, byte a byte. A versão do manifesto continua 15.8.1.

> **Atenção:** a distribuição original inclui SheetJS CE 0.18.5, com vulnerabilidade conhecida na leitura de arquivos especialmente preparados. A biblioteca foi preservada para separar a migração estrutural de uma atualização funcional. Consulte [Segurança](docs/SECURITY.md). Não trate este pacote como uma versão endurecida para arquivos de origem desconhecida.

## Regra do repositório

A raiz de `mcpmieda/extensoes` contém **somente pastas de extensões**. Esta extensão vive integralmente em `assistente-microsoft-forms/`. Documentação, agentes, configurações, ferramentas e recursos ficam aqui dentro. Não criar README, AGENTS, `.github`, arquivos compartilhados ou outras pastas na raiz sem solicitação expressa do proprietário.

## Trabalhar no código

Requer Node.js 22 ou superior. Não é necessário baixar dependências para compilar, verificar ou empacotar esta versão.

```sh
cd assistente-microsoft-forms
npm run build
npm run check
npm run verify:baseline
npm run package
```

| Comando | Resultado |
| --- | --- |
| `build` | Gera `dist/` a partir de `src/` e `public/`. |
| `check` / `test` | Verifica o pacote real: sintaxe, caminhos, permissões, recursos, integridade das bibliotecas e estrutura. Não simula o Forms. |
| `verify:baseline` | Além das verificações, compara cada arquivo com o SHA-256 e o tamanho da V15.8.1 original. Usar para esta migração. |
| `package` | Gera ZIP instalável e SHA-256 em `release/`, com conteúdo e metadados determinísticos. |

Depois de uma alteração funcional intencional, `verify:baseline` deve detectar a diferença. **Não reescrever a referência histórica para esconder alterações.** A verificação normal é `check`; a referência original continua registrada para auditoria.

## Carregar no navegador

Execute `npm run build`. Em `edge://extensions` ou `chrome://extensions`, ative o modo de desenvolvedor e escolha **Carregar sem compactação**, selecionando a pasta **`dist/` desta extensão**, não a raiz do repositório e nem `src/`.

O ZIP em `release/` contém o manifesto na raiz; ele pode ser extraído para carregar a versão compilada. Distribuição em lojas, assinatura e atualização automática não foram configuradas.

Ao substituir uma instalação existente, use o procedimento de atualização dessa instalação e conserve um backup dos dados. Carregar outra pasta como uma nova extensão pode resultar em outra identidade e outro armazenamento; a migração do código não transfere automaticamente os dados entre instalações.

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
