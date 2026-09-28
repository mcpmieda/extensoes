# Assistente do Microsoft Forms

## Estado desta importação

Esta branch contém a **base documental da importação**, ainda não a extensão executável completa. Não há fontes, bibliotecas e imagens suficientes aqui para compilar ou instalar. Não considerar esta etapa uma publicação integral.

O projeto completo foi preparado a partir de `V15.8.1(2).zip`, com fontes, funções e recursos separados, compilação local e pacote de instalação. A transferência integral por esta sessão não foi concluída. O arquivo `extensoes-importacao.bundle`, entregue na conversa, contém o histórico Git e o commit completo para importação; o ZIP de fontes é uma alternativa sem histórico.

## Regra do repositório

A raiz de `mcpmieda/extensoes` deve conter **somente pastas de extensões**. Tudo desta extensão fica em `assistente-microsoft-forms/`: código, recursos, documentação, agentes, configurações e ferramentas. Não criar arquivos na raiz nem `.github/` sem solicitação expressa do proprietário.

## Organização do projeto completo preparado

- `src/`: 18 áreas funcionais do content script, background, armazenamento, estilos e recursos incorporados.
- `public/`: manifesto, imagens, ícones, bibliotecas e licenças originais.
- `config/` e `scripts/`: composição de fontes, política de permissões, referência histórica, compilação, verificação e empacotamento.
- `docs/` e `AGENTS.md`: arquitetura, validação, segurança e instruções de desenvolvimento.

A migração estrutural reproduziu os **17 arquivos originais byte a byte**. Não foi uma atualização funcional, otimização de desempenho ou auditoria completa de segurança. Não foi executado um teste no Microsoft Forms autenticado.

Há uma pendência de segurança conhecida na biblioteca SheetJS 0.18.5 preservada da distribuição original; consultar [Segurança](docs/SECURITY.md). Instruções de desenvolvimento para agentes: [AGENTS.md](AGENTS.md).

## Concluir a publicação com o pacote Git

Com Git instalado, na pasta em que `extensoes-importacao.bundle` foi salvo, e usando um nome de diretório de destino que ainda não exista:

```sh
git clone extensoes-importacao.bundle extensoes-importacao
git -C extensoes-importacao remote set-url origin https://github.com/mcpmieda/extensoes.git
git -C extensoes-importacao push origin main
```

A autenticação é feita pelo Git no computador do proprietário; não inserir tokens na conversa ou nos arquivos. O push é normal, sem force-push. Se a branch remota tiver avançado, revisar e integrar as mudanças antes de tentar novamente. A importação completa substitui este aviso pelo README definitivo.
