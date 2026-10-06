# Histórico
## 16.0.4 — 2026-10-06

- Exporta figuras do enunciado entre o número da questão e o texto.
- Mantém imagens das alternativas e fórmulas na posição original.
- Identifica a função das imagens nos metadados da cópia para alinhamento com as macros do Word.
- Mantém as correções da 16.0.3 para letras e negritos.

## 16.0.3 — 2026-10-06

- Baixar Word normaliza somente os números das questões, sem acrescentar letras ou parênteses às alternativas.
- Preserva o HTML original das alternativas, incluindo letras existentes, operadores, números e fórmulas.
- Regressões da exportação conferem texto e HTML sem rótulos, sem remover conteúdo legítimo.
- Preserva a tag B na sanitização, impedindo a perda de negritos em títulos e trechos do enunciado.

## 16.0.2 — 2026-10-06

- Publica a versão local atual do proprietário.
- Relê campos normais após a remontagem do editor e confirma a persistência do texto.
- Edita somente o trecho necessário em alternativas textuais, preservando a formatação.
- Repete a conferência quando a primeira tentativa falha em todas as alternativas.
- Mantém a rota matemática, armazenamento, permissões e recursos existentes.
- Validação desta publicação: build, verificações técnicas e regressões locais; sem nova validação autenticada no Forms.


## 2026-10-01 — 15.10.5 — Recuperação após atualização da extensão

- Detectada e encerrada a instância desconectada da aba, com aviso para recarregar o Forms após salvar.
- Interrompidas tentativas repetidas de acesso ao armazenamento quando o contexto da extensão é invalidado.
- Perda de conexão durante busca de imagens cancela a operação, limpa o conteúdo temporário e não gera arquivo parcial.
- Cópia e download exigem as imagens embutidas; busca pelo background tem prazo de resposta.
- Sem novas permissões, alterações no armazenamento ou retorno do simulado formatado.

## 2026-10-01 — 15.10.4 — Remoção do simulado formatado

- Removidos o botão Finalizar simulado / Word formatado, o editor de camadas e a geração pela macro.
- Removidos conector, comunicação nativa, instalador, modelo e prévias exclusivos desse recurso.
- Retirada a permissão nativeMessaging.
- Preservados Copiar questões, Baixar Word, dados salvos e as demais ferramentas.

## 2026-10-01 — 15.10.2 — Simulado no Word local

- Download adicional de DOCX formatado pela macro 6.3, preservando o download normal.
- Camadas editáveis da capa, verso, cabeçalhos, rodapés e selos; ano aplicado às ondas e selos originais.
- Título da capa/turma manual, obrigatório e persistido.
- Questões no início de página ou coluna ficam sem linha vazia acima.
- Conversão de quebras manuais preserva OMath e evita Find/ReplaceAll que encerrava o Word em nova formatação.
- Layout de objetos concluído antes de salvar; numeração contínua e sem quebra manual adicional após a capa.
- Nova permissão nativeMessaging documentada, com ações e remetentes restritos.
- Build/check executam corretamente quando a letra da unidade Windows tem capitalização diferente.

## 2026-09-29 — 15.9.2 — Auditoria complementar e consistência de dados

- Corrigida a detecção textual de alternativas que já começam por A/B/C/D/E seguida de operador ou símbolo: casos como `A+5`, `B-3`, `A√25`, `B∑x`, `C%5`, `D^2`, `E·x` deixam de receber letra duplicada.
- **Remover letras** tornou-se conservador diante de corpo matemático: números, agrupadores e operadores preservam o prefixo ambíguo em vez de apagar uma possível variável.
- A rota matemática reconhece qualquer caractere não-letra após a letra esperada como caso ambíguo e não executa nova inserção.
- Persistência pedagógica ganhou revisão otimista por registro: alterações obsoletas de outra aba são rejeitadas com conflito em vez de sobrescrever dados silenciosamente.
- Migração com exclusão legada bloqueada grava estado `cleanupPending` e impressão digital do legado; a próxima abertura tenta apenas concluir a limpeza se o legado não mudou.
- Comparação de registros migrados passou a ser canônica, ignorando ordem de propriedades e a revisão interna.
- Impressão rejeita EvalBee sem `Options/Key` completos ou com sequência de questões quebrada, como já fazia o Diagnóstico.
- Corrigidos fluxos de edição/exclusão de lotes, rollback de correspondências manuais, referência residual a `lotDbPromise` e substituição por nome/data já existente.
- Redefinição/limpeza de dados só conclui quando o banco legado e o banco atual são efetivamente removidos; falhas não são mais silenciadas.
- Testes comportamentais ampliados para os cenários acima.

## 2026-09-29 — Endurecimento complementar da issue #1

- Migração pedagógica não sobrescreve silenciosamente um registro da extensão quando o banco legado contém o mesmo ID com conteúdo diferente; o conflito preserva o legado.
- Leituras, gravações e exclusões de lotes aguardam a migração, evitando corrida entre dados antigos e novos.
- Vínculo histórico automático exige sempre turma + número + nome completo normalizado e único; modos alternativos passam a ordenar apenas sugestões pendentes para revisão humana.
- Preflight de XLSX mede a expansão real das entradas ZIP em stream, limita o SheetJS durante a leitura e considera `!fullref` para detectar planilhas truncadas pelo teto.
- Importações rejeitam mais de 500 questões antes de loops dependentes do maior número de questão; o parser XML do Organizador também limita abas, linhas e colunas.
- Testes comportamentais ampliados para conflito de migração, identidade histórica estrita, expansão ZIP, `sheetRows`, `!fullref` e teto de questões.

## 2026-09-29 — 15.9.1 — Integridade matemática reforçada

- Removida a reconstrução automática de alternativas matemáticas durante **Inserir letras**.
- A inserção matemática faz no máximo uma tentativa e nunca usa select-all para reescrever a fórmula inteira.
- Letras A/B/C/D/E no final de expressões deixam de ser removidas por heurística de reparo legado.
- Casos ambíguos como `A+25`, `A−25` e `E = E` são preservados sem nova edição.
- A confirmação matemática agora exige preservação do corpo da expressão; presença visual da letra, sozinha, não basta.
- Testes de regressão ampliados para 51 operadores/símbolos e casos matemáticos terminais.

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
# 16.0.0

- Separar ativação manual do cache de detecção automática de teste, preservando os critérios automáticos existentes.
- Disponibilizar Ferramentas de Respostas sem depender da quantidade de questões carregadas, nos dois caminhos de atualização do painel.
- Mostrar orientação específica no gabarito sem alternativas, mantendo as demais ferramentas disponíveis.
- Preservar o banco diante de leituras vazias e de visualização; não interpretar seleção do respondente como resposta correta.
- Reconhecer cards do editor e evitar erros de alternativas/gabarito em questões sem alternativas.
- Reconhecer EditFormPage como edição, preservando o bloqueio de gravações do gabarito em visualização. Marcação/importação/limpeza não substituem o original salvo por uma leitura não autoritativa; ausência transitória de sinais preserva o original da mesma questão.
- Em Forms comuns, mostrar bolhas apenas para questões e alternativas existentes; preservar o modelo legado de 40 posições dos testes.
- Cobrir abertura automática/manual, navegação SPA, botão, banco e capacidades com regressões locais. Sem nova validação autenticada nem alterações de permissões, armazenamento ou rotinas de edição matemática/importação verificada.
# 16.0.1

- Deduplicar wrappers/cards aninhados antes de numerar questões, preservando candidatos não aninhados e o bloco externo da mesma pergunta.
- Verificar o modo no início dos handlers de redefinir/limpar importadas/limpar manuais, sem alterar a interface ou informar sucesso quando a página já saiu da edição.
- Testes de descoberta com/sem numeração e navegação após renderização dos controles de limpeza. Entrega corrigida da linha 16, preservando a tag 16.0.0 publicada.
