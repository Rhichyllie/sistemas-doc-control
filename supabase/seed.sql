-- TRAMITA Demo Seed
-- Creates two demo organizations, users across all roles, and sample documents
-- in various stages of the workflow. Run after migrations for local demos.

-- ── DEMO AUTH USERS ────────────────────────────────────────
-- Local Supabase reset runs seed.sql automatically, so demo auth.users rows are
-- inserted here to satisfy public.profiles foreign keys.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carlos.mendes@alpha.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Carlos Mendes"}'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ana.ferreira@alpha.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ana Ferreira"}'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roberto.lima@alpha.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Roberto Lima"}'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'juliana.costa@alpha.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Juliana Costa"}'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcos.silva@alpha.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Marcos Silva"}'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fernanda.alves@beta.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Fernanda Alves"}'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'paulo.rodrigues@beta.example', crypt('tramita-demo', gen_salt('bf')), NOW(), NOW(), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name":"Paulo Rodrigues"}')
ON CONFLICT (id) DO NOTHING;

-- ── ORGANIZATIONS ──────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug, sector, code_prefix, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Empresa Alpha — Setor Óleo & Gás', 'alpha-oil', 'oil_gas', 'AL', 'professional'),
  ('00000000-0000-0000-0000-000000000002', 'Empresa Beta — Mineração', 'beta-mining', 'mining', 'BT', 'enterprise')
ON CONFLICT (id) DO NOTHING;

-- ── PROFILES ───────────────────────────────────────────────
INSERT INTO public.profiles (id, org_id, full_name, email, role, department) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Carlos Mendes', 'carlos.mendes@alpha.example', 'admin', 'TI'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Ana Ferreira', 'ana.ferreira@alpha.example', 'manager', 'SGI'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Roberto Lima', 'roberto.lima@alpha.example', 'approver', 'Engenharia'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Juliana Costa', 'juliana.costa@alpha.example', 'reviewer', 'Operações'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Marcos Silva', 'marcos.silva@alpha.example', 'author', 'Manutenção'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', 'Fernanda Alves', 'fernanda.alves@beta.example', 'admin', 'TI'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', 'Paulo Rodrigues', 'paulo.rodrigues@beta.example', 'manager', 'SGI')
ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  department = EXCLUDED.department;

-- ── DOCUMENTS (Alpha org — various workflow stages) ─────────
INSERT INTO public.documents
  (id, org_id, code, title, doc_type, area, status, revision,
   description, author_id, next_review_at) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'AL-SGI-PRO-0001', 'Procedimento de Gestão de Documentos e Registros', 'PRO', 'SGI', 'published', 2, 'Define as regras para criação, revisão, aprovação e controle de documentos do SGI.', '10000000-0000-0000-0000-000000000002', CURRENT_DATE + INTERVAL '180 days'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'AL-ENG-IT-0001', 'Instrução de Trabalho — Inspeção de Equipamentos Rotativos', 'IT', 'ENG', 'published', 1, 'Descreve o método de inspeção periódica de compressores e bombas.', '10000000-0000-0000-0000-000000000003', CURRENT_DATE + INTERVAL '90 days'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'AL-SST-PLN-0001', 'Plano de Resposta a Emergências — Vazamento de Gás', 'PLN', 'SST', 'published', 3, 'Plano de ação para cenário de vazamento de gás nas instalações.', '10000000-0000-0000-0000-000000000002', CURRENT_DATE + INTERVAL '12 days'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'AL-ENG-ET-0001', 'Especificação Técnica — Materiais para Tubulação de Alta Pressão', 'ET', 'ENG', 'published', 1, 'Define os requisitos de materiais para linhas de processo acima de 150 psi.', '10000000-0000-0000-0000-000000000003', CURRENT_DATE + INTERVAL '7 days'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'AL-MNT-PRO-0001', 'Procedimento de Manutenção Preventiva — Compressores de Ar', 'PRO', 'MNT', 'in_review', 1, 'Define a rotina de manutenção preventiva para compressores de ar instrumentado.', '10000000-0000-0000-0000-000000000005', NULL),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'AL-SGI-RNC-0001', 'RNC — Não Conformidade em Medição de Pressão — TAG PI-101', 'RNC', 'SGI', 'pending_approval', 0, 'Registro de não conformidade identificada durante auditoria interna.', '10000000-0000-0000-0000-000000000004', NULL),
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'AL-OPS-IT-0001', 'IT — Operação de Parada Planejada — Unidade de Processo', 'IT', 'OPS', 'draft', 0, 'Instrução para execução segura de parada planejada da unidade de processo.', '10000000-0000-0000-0000-000000000005', NULL),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'AL-ENG-PRO-0001', 'Procedimento de Inspeção Visual — Versão Antiga', 'PRO', 'ENG', 'obsolete', 1, 'Versão obsoleta substituída por revisão 2.', '10000000-0000-0000-0000-000000000003', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── DOCUMENT VERSIONS ──────────────────────────────────────
INSERT INTO public.document_versions
  (document_id, org_id, revision, file_path, file_name, file_size, file_hash, change_summary, uploaded_by) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'alpha/documents/AL-SGI-PRO-0001-r02.pdf', 'AL-SGI-PRO-0001-r02.pdf', 245760, 'demo-hash-doc-0001-r02', 'Revisão geral do procedimento para apresentação.', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 1, 'alpha/documents/AL-MNT-PRO-0001-r01.pdf', 'AL-MNT-PRO-0001-r01.pdf', 198144, 'demo-hash-doc-0005-r01', 'Primeira versão submetida para revisão técnica.', '10000000-0000-0000-0000-000000000005'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 0, 'alpha/documents/AL-SGI-RNC-0001-r00.pdf', 'AL-SGI-RNC-0001-r00.pdf', 131072, 'demo-hash-doc-0006-r00', 'Registro inicial da não conformidade.', '10000000-0000-0000-0000-000000000004')
ON CONFLICT (document_id, revision) DO NOTHING;

-- ── APPROVAL FLOWS ─────────────────────────────────────────
INSERT INTO public.approval_flows
  (document_id, org_id, step, step_label, required_role, assignee_id, status, decided_at, decided_by) VALUES
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 1, 'Revisão Técnica', 'reviewer', '10000000-0000-0000-0000-000000000004', 'pending', NULL, NULL),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 1, 'Revisão Técnica', 'reviewer', '10000000-0000-0000-0000-000000000004', 'approved', NOW() - INTERVAL '1 day', '10000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 2, 'Aprovação', 'approver', '10000000-0000-0000-0000-000000000003', 'pending', NULL, NULL)
ON CONFLICT DO NOTHING;

-- ── NOTIFICATIONS ──────────────────────────────────────────
INSERT INTO public.notifications
  (org_id, user_id, document_id, type, title, body) VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000005', 'approval_required', 'Revisão técnica pendente', 'O documento AL-MNT-PRO-0001 aguarda sua revisão.'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006', 'approval_required', 'Aprovação pendente', 'O documento AL-SGI-RNC-0001 aguarda sua aprovação.'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'review_expiring', 'Revisão próxima do vencimento', 'O documento AL-ENG-ET-0001 vence em 7 dias.');

-- ── AUDIT TRAIL ENTRIES ────────────────────────────────────
INSERT INTO public.audit_trail
  (document_id, org_id, user_id, action, old_status, new_status) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'created', NULL, 'draft'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'status_changed', 'draft', 'published'),
  ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'status_changed', 'in_review', 'pending_approval')
ON CONFLICT DO NOTHING;
