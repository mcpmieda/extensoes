# Histórico

## 2026-09-28 — 15.9.0 — Integridade e segurança

- Inserção de letras nas alternativas tornou-se não destrutiva: operadores e símbolos existentes são preservados, inclusive em segunda execução.
- Remoção de letras passou a preservar pontuação e operadores em vez de tentar adivinhar separadores.
- Associação histórica automática `class_roll_name` exige nome completo normalizado exato; nomes apenas semelhantes ficam para revisão.
- Lotes da Impressão e do Diagnóstico migram do IndexedDB do Forms para IndexedDB do origin da extensão, com verificação antes de apagar o legado.
- Todas as importações de planilha passam por limites comuns de tamanho/ZIP/dimensões.
- SheetJS CE atualizado para 0.20.3, com checksum do build oficial.
- Adicionados testes comportamentais para os invariantes críticos.

## 2026-09-28 — Organização das fontes da 15.8.1

Migração estrutural a partir de `V15.8.1(2).zip`. Versão de runtime mantida em 15.8.1.

Recuperadas 18 áreas funcionais, subdivididas por grupos de funções; separados armazenamento, background, estilos e recursos estáticos; mantidos imagens, ícones, bibliotecas e licenças. Adicionados build local sem downloads, verificação de integridade e baseline, pacote determinístico, política de permissões e instruções de desenvolvimento/agentes.

O pacote recompilado contém os mesmos 17 arquivos do original, com os mesmos bytes. Não houve atualização de dependências, alteração de layout, ganho de desempenho comprovado, validação em sessão autenticada do Forms ou configuração de publicação em loja. A pendência de segurança da biblioteca SheetJS foi documentada.
