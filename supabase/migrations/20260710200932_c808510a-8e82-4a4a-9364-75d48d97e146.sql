
-- Helper: verifica se o usuário atual é dono de algum grupo (admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.grupos WHERE owner_id = auth.uid());
$$;

-- Tabela de emails autorizados a acessar o sistema
CREATE TABLE public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allowed_emails_lowercase CHECK (email = lower(email))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails TO authenticated;
GRANT SELECT ON public.allowed_emails TO anon;
GRANT ALL ON public.allowed_emails TO service_role;

ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Anon e authenticated podem verificar se um email específico existe (para gate de login)
CREATE POLICY "Anyone can check email exists"
  ON public.allowed_emails FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert allowed emails"
  ON public.allowed_emails FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update allowed emails"
  ON public.allowed_emails FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete allowed emails"
  ON public.allowed_emails FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Configuração do Google OAuth (singleton — apenas 1 linha)
CREATE TABLE public.google_oauth_config (
  id integer PRIMARY KEY DEFAULT 1,
  client_id text,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT SELECT ON public.google_oauth_config TO anon;
GRANT SELECT, INSERT, UPDATE ON public.google_oauth_config TO authenticated;
GRANT ALL ON public.google_oauth_config TO service_role;

ALTER TABLE public.google_oauth_config ENABLE ROW LEVEL SECURITY;

-- Todos podem ler (para que o botão Google apareça condicionalmente na tela de login)
CREATE POLICY "Anyone can read google config"
  ON public.google_oauth_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert google config"
  ON public.google_oauth_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update google config"
  ON public.google_oauth_config FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Semente: linha default desabilitada
INSERT INTO public.google_oauth_config (id, enabled) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Autoriza o email do owner atual (se houver) para não travar o próprio criador
INSERT INTO public.allowed_emails (email, note)
SELECT lower(u.email), 'Owner inicial'
FROM auth.users u
JOIN public.grupos g ON g.owner_id = u.id
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;
