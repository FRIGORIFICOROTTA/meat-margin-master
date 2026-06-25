
CREATE TABLE public.lancamentos_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano smallint NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  tipo text NOT NULL CHECK (tipo IN ('das','pis','cofins','icms','iss','irpj','csll','outros')),
  label text,
  valor_real numeric(14,2) NOT NULL DEFAULT 0,
  valor_estimado numeric(14,2),
  sinal smallint NOT NULL DEFAULT 1 CHECK (sinal IN (-1, 1)),
  data_pagamento date,
  observacao text,
  arquivo_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX lancamentos_fiscais_unique_tipo
  ON public.lancamentos_fiscais (empresa_id, mes, ano, tipo, COALESCE(label, ''))
  WHERE deleted_at IS NULL;

CREATE INDEX lancamentos_fiscais_empresa_periodo
  ON public.lancamentos_fiscais (empresa_id, ano, mes) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos_fiscais TO authenticated;
GRANT ALL ON public.lancamentos_fiscais TO service_role;

ALTER TABLE public.lancamentos_fiscais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lancamentos_fiscais_select" ON public.lancamentos_fiscais
  FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

CREATE POLICY "lancamentos_fiscais_insert" ON public.lancamentos_fiscais
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_empresa_access(empresa_id));

CREATE POLICY "lancamentos_fiscais_update" ON public.lancamentos_fiscais
  FOR UPDATE TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));

CREATE POLICY "lancamentos_fiscais_delete" ON public.lancamentos_fiscais
  FOR DELETE TO authenticated
  USING (public.user_has_empresa_access(empresa_id));

CREATE TRIGGER trg_lancamentos_fiscais_updated_at
  BEFORE UPDATE ON public.lancamentos_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
