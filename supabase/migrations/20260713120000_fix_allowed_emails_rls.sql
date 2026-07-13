-- CORREÇÃO DE SEGURANÇA (auditoria 13/07/2026):
-- A policy "Anyone can check email exists" com USING (true) permitia que
-- qualquer pessoa com a anon key (pública) listasse TODOS os e-mails
-- autorizados (enumeração de usuários). Substituída por RPC que retorna
-- apenas boolean, sem expor a lista.

DROP POLICY IF EXISTS "Anyone can check email exists" ON public.allowed_emails;

-- Leitura da lista completa: apenas admins autenticados.
CREATE POLICY "Admins can select allowed emails"
  ON public.allowed_emails FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Checagem pontual no fluxo de login/cadastro (anon): retorna só true/false.
CREATE OR REPLACE FUNCTION public.email_is_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_emails
    WHERE lower(email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.email_is_allowed(text) FROM public;
GRANT EXECUTE ON FUNCTION public.email_is_allowed(text) TO anon, authenticated;
