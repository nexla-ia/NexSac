-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Leads demo para conta simulacao (instancia = '3ww')
-- Rodar no Supabase SQL Editor (usa service_role, sem restrição de RLS)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adiciona políticas de INSERT/UPDATE/DELETE na tabela clientes
--    (hoje só existe allow_read — o bot não conseguia gravar)
DROP POLICY IF EXISTS allow_insert ON public.clientes;
DROP POLICY IF EXISTS allow_update ON public.clientes;
DROP POLICY IF EXISTS allow_delete ON public.clientes;

CREATE POLICY allow_insert ON public.clientes FOR INSERT WITH CHECK (true);
CREATE POLICY allow_update ON public.clientes FOR UPDATE USING (true);
CREATE POLICY allow_delete ON public.clientes FOR DELETE USING (true);

-- 2. Limpa leads antigos da simulação (idempotente)
DELETE FROM public.clientes WHERE instancia = '3ww';

-- 3. Insere 29 leads realistas espalhados por maio/2026
INSERT INTO public.clientes
  (instancia, nome, numero, session_id, origem, primeiro_contato, ultima_mensagem,
   classificacao_lead, created_at,
   ad_platform, ad_source, ad_title, ad_body, ad_captured_at)
VALUES

-- ── Semana 1 (Mai 01-07) ─────────────────────────────────────────────────────
('3ww','Maria Oliveira Santos','5511987654321','5511987654321',
 'Instagram','sim','Terça às 8h30 fica ótimo!','agendado',
 '2026-05-01 09:30:00+00','instagram','feed_post',
 'Consultas com hora marcada','Dra. Ana Paula atende segunda a sexta. Agende agora!',
 '2026-05-01 09:30:00+00'),

('3ww','João Carlos Pereira','5511912345678','5511912345678',
 'Indicação','sim','Quer que eu já agende o retorno?','encerrado',
 '2026-05-02 10:00:00+00', null, null, null, null, null),

('3ww','Fernanda Lima Costa','5521998765432','5521998765432',
 'Instagram','sim','Perfeito! Sua consulta foi remarcada.','agendado',
 '2026-05-02 14:00:00+00','instagram','stories',
 'Clínica Simulação — Agende pelo WhatsApp', null, '2026-05-02 14:00:00+00'),

('3ww','Carlos Eduardo Ribeiro','5531987123456','5531987123456',
 'Google','sim','Às 15h30 está ótimo.','agendado',
 '2026-05-03 08:00:00+00', null, null, null, null, null),

('3ww','Ana Claudia Mendes','5511976543210','5511976543210',
 'Indicação','sim','Tudo ótimo! A Dra. Ana Paula foi excelente.','encerrado',
 '2026-05-04 09:00:00+00', null, null, null, null, null),

('3ww','Patrícia Souza Lima','5511981234567','5511981234567',
 'Instagram','sim','Obrigada pelo atendimento!','encerrado',
 '2026-05-04 11:00:00+00','instagram','reels',
 'Consulta preventiva — cuide da sua saúde', null, '2026-05-04 11:00:00+00'),

('3ww','Antônio Carlos Martins','5511982345678','5511982345678',
 'Google','sim','Agendado com o Dr. Ricardo!','encerrado',
 '2026-05-05 09:00:00+00', null, null, null, null, null),

('3ww','Marcos Vinicius Rocha','5511984567890','5511984567890',
 'Google','sim','Combinado, até lá!','encerrado',
 '2026-05-06 10:00:00+00', null, null, null, null, null),

-- ── Semana 2 (Mai 08-14) ─────────────────────────────────────────────────────
('3ww','Viviane Monteiro Alves','5521988901234','5521988901234',
 'Instagram','sim','Perfeito, até sexta!','encerrado',
 '2026-05-08 08:00:00+00','instagram','feed_post',
 'Cardiologista especialista — Dr. Ricardo Oliveira', null, '2026-05-08 08:00:00+00'),

('3ww','Isabela Cristina Nunes','5521989012345','5521989012345',
 'Instagram','sim','Agendado para terça!','agendado',
 '2026-05-08 10:00:00+00','instagram','stories',
 'Pediatria especializada — Dra. Camila Santos', null, '2026-05-08 10:00:00+00'),

('3ww','Thiago Barbosa Lima','5531990123456','5531990123456',
 'Site','sim','Ótimo, até quarta!','encerrado',
 '2026-05-09 09:00:00+00', null, null, null, null, null),

('3ww','Beatriz Aparecida Ferreira','5511965432109','5511965432109',
 'Indicação','sim','Muito obrigada!','encerrado',
 '2026-05-09 11:00:00+00', null, null, null, null, null),

('3ww','Eduardo Pereira Costa','5511992345678','5511992345678',
 'Indicação','sim','Agendado! Quinta às 15:30.','encerrado',
 '2026-05-10 09:00:00+00', null, null, null, null, null),

('3ww','Claudia Regina Pinto','5511983456789','5511983456789',
 'Facebook','sim','Que dia prefere?','em_atendimento',
 '2026-05-12 10:00:00+00', null, null, null, null, null),

('3ww','Gustavo Henrique Faria','5521994567890','5521994567890',
 'Google','sim','Agendado para quarta!','encerrado',
 '2026-05-13 09:00:00+00', null, null, null, null, null),

('3ww','Lúcia Helena Carvalho','5521995678901','5521995678901',
 'Google','sim','Confirmado o ECG hoje às 16h!','encerrado',
 '2026-05-14 08:00:00+00', null, null, null, null, null),

-- ── Semana 3 (Mai 15-21) ─────────────────────────────────────────────────────
('3ww','Carla Mendes Oliveira','5531991234567','5531991234567',
 'Instagram','sim','Clínico geral, por favor.','perdido',
 '2026-05-15 09:00:00+00','instagram','feed_post',
 'Consulta sem fila de espera', null, '2026-05-15 09:00:00+00'),

('3ww','Roberto Luis Alves','5531923456789','5531923456789',
 'Indicação','sim','Até lá, obrigado!','encerrado',
 '2026-05-17 09:00:00+00', null, null, null, null, null),

('3ww','Aline Rodrigues Melo','5511993456789','5511993456789',
 'Instagram','sim','Sim, por favor, é urgente!','encerrado',
 '2026-05-18 10:00:00+00','instagram','stories',
 'Pediatra disponível — atendimento imediato', null, '2026-05-18 10:00:00+00'),

('3ww','Paulo Roberto Teixeira','5511997890123','5511997890123',
 'Anúncio','sim','Sim, perfeito!','encerrado',
 '2026-05-19 08:00:00+00','facebook','feed_ad',
 'Promoção: consulta de retorno com desconto',
 'Retorno com Dra. Ana Paula — agende já!', '2026-05-19 08:00:00+00'),

('3ww','Mariana Souza Ferreira','5511998901234','5511998901234',
 'Instagram','sim','Confirmado para terça!','agendado',
 '2026-05-20 09:00:00+00','instagram','reels',
 'Cardiologia preventiva — Dr. Ricardo', null, '2026-05-20 09:00:00+00'),

('3ww','Tatiane Gomes Lima','5521999012345','5521999012345',
 'Instagram','sim','Quarta às 09h perfeito!','encerrado',
 '2026-05-21 08:00:00+00', null, null, null, null, null),

('3ww','Rodrigo Nascimento','5531996789012','5531996789012',
 'Facebook','sim','Preciso de declaração médica para trabalho.','perdido',
 '2026-05-21 10:00:00+00', null, null, null, null, null),

-- ── Semana 4 (Mai 22-25) ─────────────────────────────────────────────────────
('3ww','Cristiane Oliveira Prado','5531900123456','5531900123456',
 'Instagram','sim','Perfeito, confirmado!','encerrado',
 '2026-05-22 09:00:00+00','instagram','stories',
 'Dra. Camila — especialista em crianças', null, '2026-05-22 09:00:00+00'),

('3ww','Juliana Maria Costa','5511954321098','5511954321098',
 'Google','sim','Ótimo, até segunda!','agendado',
 '2026-05-22 11:00:00+00', null, null, null, null, null),

('3ww','Lucas Gabriel Rodrigues','5521943210987','5521943210987',
 'Instagram','sim','Pode confirmar!','agendado',
 '2026-05-23 09:00:00+00','instagram','feed_post',
 'Consulta sem burocracia — agende agora', null, '2026-05-23 09:00:00+00'),

('3ww','Pedro Henrique Souza','5521934567890','5521934567890',
 'Instagram','sim','Qual seria melhor para vocês?','agendado',
 '2026-05-24 14:00:00+00','instagram','reels',
 'Pediatra disponível ainda essa semana!', null, '2026-05-24 14:00:00+00'),

-- ── Leads novos de hoje (Mai 25) — ainda sem resposta ────────────────────────
('3ww','Fernanda Silva Gomes','5511900111111','5511900111111',
 'Instagram','sim','Olá! Como posso ajudar?','novo',
 '2026-05-25 08:00:00+00','instagram','stories',
 'Consulte sem sair de casa — WhatsApp', null, '2026-05-25 08:00:00+00'),

('3ww','Ricardo Andrade Lima','5511900222222','5511900222222',
 'Google','sim','Olá! Como posso ajudar?','novo',
 '2026-05-25 09:30:00+00', null, null, null, null, null),

('3ww','Camila Torres Nunes','5511900333333','5511900333333',
 'Instagram',null,null,'novo',
 '2026-05-25 11:00:00+00','instagram','feed_post',
 'Agende sua consulta online', null, '2026-05-25 11:00:00+00');

-- Resultado esperado
SELECT
  COUNT(*)                                                   AS total_leads,
  COUNT(*) FILTER (WHERE primeiro_contato = 'sim')          AS contactados,
  COUNT(*) FILTER (WHERE classificacao_lead = 'encerrado')  AS encerrados,
  COUNT(*) FILTER (WHERE classificacao_lead = 'agendado')   AS agendados,
  COUNT(*) FILTER (WHERE classificacao_lead = 'perdido')    AS perdidos,
  COUNT(*) FILTER (WHERE classificacao_lead = 'novo')       AS novos
FROM public.clientes
WHERE instancia = '3ww';
