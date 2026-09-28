# Desenvolvimento e evolução

## Rotina do projeto

Todas as ações começam dentro de `assistente-microsoft-forms/`. Para uma correção, localizar a área em `module-map.json`, inspecionar as funções envolvidas e editar apenas as fontes. O arquivo `public/manifest.json` é o manifesto editável; as cópias em `dist/` são descartáveis.

`npm run check` compila e examina os arquivos reais. `npm run package` verifica e produz o ZIP. Não há instalação npm obrigatória nem download de bibliotecas no build atual; as duas bibliotecas já acompanham a extensão.

Antes de enviar: conferir que só há uma finalidade no diff, que nenhuma pasta de outra extensão mudou, que não há dados reais no commit e que o ZIP contém apenas os arquivos de runtime. Após enviar: confirmar o commit na branch remota. A conclusão do processo de build não é uma confirmação de publicação.

## Como os recursos são alterados

Editar CSS/HTML em `src/resources` ou `src/styles`. Para adicionar um recurso estático incorporado, registrar caminho, codificação e tipo de literal em `config/resources.json` e usar o marcador de recurso em um módulo. Nunca carregar JavaScript de CDN no navegador para economizar espaço no repositório.

Arquivos em `public/` entram diretamente no pacote. A política de domínios/permissões e `vendor-lock.json` tornam mudanças sensíveis explícitas. Qualquer atualização deve manter a licença correta e registrar origem, versão e hash.

## Uso de GitHub e agentes

GitHub concentra histórico, branches, diffs, issues e revisão. Os agentes devem seguir `AGENTS.md`, trabalhar no diretório desta extensão e verificar a implementação antes de declarar problemas resolvidos. A base não exige Supabase, Cloudflare, Figma, Canva ou outro serviço para compilar ou funcionar; integrações só devem ser adicionadas quando houver necessidade funcional concreta.

Não existem workflows GitHub Actions ativos nesta entrega. Eles só poderão ser adicionados com autorização expressa para criar `.github/workflows/` na raiz. Os comandos locais já estão separados e podem ser aproveitados por uma automação futura, sem mover configurações de todas as extensões para a raiz.

## Prioridades identificadas, ainda não implementadas

1. Revisar a biblioteca SheetJS antiga, selecionar uma distribuição oficial corrigida, verificar os fluxos reais de importação e documentar a atualização isoladamente.
2. Extrair interfaces explícitas entre DOM do Forms, regras, armazenamento e interface. Reduzir gradualmente o estado compartilhado, sem uma reescrita simultânea das ferramentas.
3. Após decidir a distribuição, organizar versões e releases. Publicar em GitHub não instala a extensão nos navegadores nem habilita atualizações automáticas.

Mudanças de funcionalidade, dependências ou desempenho devem ter evidências próprias. A migração inicial não deve ser reapresentada como uma otimização de velocidade ou redução do pacote executado.
