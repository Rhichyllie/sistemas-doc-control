# Fronteiras dos Módulos

As fronteiras abaixo impedem que telas diferentes respondam à mesma pergunta ou acumulem mutações indevidas.

## Home Operacional

- Fornece visão executiva de saúde, risco e próximo movimento.
- Resume capacidades e sinais relevantes.
- Direciona para módulos especializados.
- Não executa ações operacionais nem substitui a Central ou os Indicadores.

## Central Documental

- Responde: “O que preciso fazer agora?”.
- Funciona como caixa operacional e ponto de navegação para o detalhe documental.
- Consolida pendências, prazos e próximos passos.
- Não conclui etapas inline e não inicia trâmites automaticamente.

## Diagnóstico Operacional

- Verifica instalação, schema, RLS, contratos, health check e prontidão de go-live.
- Diferencia ausência de ciclo, falta de configuração e erro real.
- Não é dashboard de performance e não produz indicadores históricos.

## Indicadores Operacionais

- Analisa período, SLA, gargalos, risco e performance.
- É somente leitura e usa filtros gerenciais.
- Não altera documentos, etapas, responsáveis, prazos ou notificações.
- A exportação visual gerencial não substitui relatório formal de auditoria.

## Auditoria

- Consolida trilha, pacote formal, manifesto, cobertura, limitações, hash técnico e histórico append-only de exportações.
- A P-27 está concluída com relatórios formais de auditoria.
- A P-27.1 trata exceções e reconciliação em tabelas próprias.
- Não altera a operação auditada.

## Exceções e Reconciliação

- Detecta lacunas, divergências, fontes ausentes e inconsistências auditáveis.
- Registra runs e exceções em contrato próprio.
- Permite reconhecer, ignorar ou resolver uma exceção com nota.
- Não corrige documentos, versões, aprovações, trâmites, evidências,
  notificações, prazos ou responsáveis.
- Não substitui Relatórios de Auditoria; prepara investigação antes do piloto.

## OCR e Leitura Documental

- Registra solicitações de leitura técnica, páginas extraídas, método, origem,
  confiança, warnings, erros e limitações.
- Armazena somente texto observado, extraído ou informado manualmente com
  método explícito.
- Não resume, interpreta, corrige, classifica, infere campos ou preenche
  metadados operacionais.
- OCR falho, indisponível ou sem texto não invalida o documento e não altera
  status, prazos, responsáveis, versões, aprovações, trâmites ou evidências.
- Prepara base para busca e inteligência futuras sem executar IA na P-29.

## Documentos

- Governa entidade documental, arquivos, versões, revisões, código e contexto.
- Criação e alterações sensíveis preservam contratos transacionais e fallbacks.
- Código, projeto e revisão são contexto do documento, não módulos isolados.

## Trâmites

- Abrange modelagem, publicação, execução, etapas, evidências e eventos.
- Modelagem não executa fluxo.
- Execução não altera `approval_flows`.
- Delegação auditável não reatribui silenciosamente o titular.

## Notificações

- Mantém inbox, preferências, eventos, escalonamento e outbox passiva.
- Escalonamento notifica; não reatribui.
- Não há envio externo obrigatório nesta etapa.
- Geração operacional é explícita e não altera status ou prazo.

## Configurações

- Reúne equipe, grupos, calendário, SLA, regras documentais e codificação.
- Escritas administrativas preservam checagem de perfil e RLS.
- Configuração define comportamento futuro; não deve reprocessar silenciosamente dados persistidos.

## Regra de integração

Um módulo pode consumir o estado de outro sem assumir sua responsabilidade. A Home resume, a Central orienta a ação, os Indicadores analisam, o Diagnóstico valida instalação e a Auditoria formaliza evidências.
