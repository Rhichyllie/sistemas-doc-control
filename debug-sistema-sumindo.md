# [FIXED] debug-sistema-sumindo

Sintoma informado: "O sistema está sumindo"
Causa raiz confirmada: Padrão SISTEMÁTICO de loops infinitos de re-renders
(React "Maximum update depth exceeded" = React error #130 minified).

## Diagnostico
O app tinha um anti-padrão RECORRENTE: **hooks recebendo objetos inline**
(`useX({ param: val })` ou `useX({})` default). Como esses objetos são
criados a cada render do componente pai, a referência do objeto muda TODA
HORA, propagando re-renders em cascata em qualquer hook filho que tivesse
`useCallback` / `useEffect` dependendo de props não-primitivas.

Além disso, as funções `refresh` agregadoras dependiam de OBJETOS state
COMPLETOS (ex: `auditState`, `workCenter`) em vez de só as suas funções
`refetch`, fazendo com que o `refresh` também mudasse de referência todo
render (efeito multiplicador de loop).

## Pontos de loop identificados e corrigidos

### 1. Hooks agregadores
- [x] `useDocumentWorkCenter.ts` — params memoizados + refresh depende de funções
- [x] `useOperationalHome.ts` — codingOptions/templates memoizados + refresh funções
- [x] `useOperationalCockpit.ts` — auditFilters memoizado
- [x] `useDocumentCodePatterns.ts` — projectOptionsArg memoizado
- [x] `useDocumentCreationIntelligence.ts` — codeOptionsConfig memoizado

### 2. Telas / Componentes
- [x] `routes/organizacao.tsx` — `usePublications({ limit:4 })` memoizado
- [x] `routes/documents.tsx` — `useDocumentCodeOptions({ requireManagement:false })` memoizado
- [x] `routes/disciplines.tsx` — `useDocumentCodeOptions({ requireManagement:false })` memoizado
- [x] `components/documents/DocumentCodeAdmin.tsx` — `{ includeInactive: true }` memoizado
- [x] `components/documents/DocumentRulesAdmin.tsx` — `{ includeInactive: true }` memoizado

## Validacoes
- [x] `tsc --noEmit` (typecheck) = exit 0 SEM ERROS
- [x] Publicado commit `9dcce8d` (correção useDocumentWorkCenter apenas)
- [x] Publicado commit `4193393` (varredura SISTEMATICA em TODO o app, 9 arquivos)

## Confirmacao
[PENDENTE_USUARIO] Ana testar após deploy automático (~2min):
1. **Ctrl+Shift+R** (hard refresh limpando cache)
2. Abrir `Dashboard`, `Central de Documentos`, `Atividades`
3. Verificar que no Console (F12) NÃO APARECE mais o erro vermelho
   "Maximum update depth exceeded" nem "React error #130"
4. Verificar que os cards **não somem mais** e a página permanece estável
após o carregamento completo.

Se ainda aparecer algum erro, relatar stack trace exato do Console.
