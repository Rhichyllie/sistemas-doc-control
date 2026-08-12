# [PENDING_CONFIRMATION] debug-sistema-sumindo

Sintoma informado: "O sistema está sumindo"
Causa confirmada: Loop infinito de re-renders (React "Maximum update depth exceeded")
apenas na pagina "Documentos / Central".

## Diagnostico
O hook `useDocumentWorkCenter.ts` apresentava 2 problemas que combinados geravam o loop:

1. **Objetos literais novos a cada render**: Parametros passados para
   `useDocumentTramiteInstances({...})`, `useAuditTrail()` (default `{}`)
   e `useProjectOptions()` (default `{}`) eram recriados em toda renderizacao.
2. **Dependencia de objetos state completos no `refresh`**: O `useCallback refresh`
   do workcenter dependia de 10 OBJETOS state COMPLETOS (ex: `auditState`), e nao
   apenas das suas funcoes `refetch`/`refresh`. Como esses objetos sao wrappers
   novos a cada render do hook interno, a referencia do `refresh` do workcenter
   mudava toda hora → propagava re-renders em cascata nos 4 pontos que consomem
   o hook (OperationalHome, DocumentWorkCenter, useOperationalCockpit, atividades).

## Correcao aplicada (useDocumentWorkCenter.ts)
1. **Memoizacao de params**:
   - `tramiteInstancesOptions` (loadAllSteps + recentLimit) memoizado com `useMemo([], [])`
   - `auditFilters` = `{}` memoizado
   - `projectOptionsArg` = `{}` memoizado
2. **Dependencias do `refresh` trocadas para PRIMITIVAS de funcoes**:
   - Extrai `refetchDocuments`, `refreshTramites`, etc (apenas as funcoes)
   - O `useCallback refresh` agora depende apenas dessas 10 funcoes, que sao
     estaveis (memoizadas nos hooks internos).
3. Validado via `npm run typecheck` (exit 0).

## Confirmacao pendente
Ana: acessar Documentos > Central apos deploy e confirmar que:
- Nao aparece mais "Maximum update depth exceeded" no Console
- Os cards nao somem mais aos poucos
- Pagina fica estavel apos carregamento completo
