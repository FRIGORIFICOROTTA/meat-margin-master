
CREATE TYPE public.papel_usuario AS ENUM ('admin_grupo','gestor_empresa','visualizador');
CREATE TYPE public.regime_tributario AS ENUM ('gerencial','lucro_real');
CREATE TYPE public.tipo_arquivo AS ENUM ('dre','estoque_inicial','estoque_final');
CREATE TYPE public.status_arquivo AS ENUM ('pendente','processando','extraido','confirmado','erro');
CREATE TYPE public.tipo_inventario AS ENUM ('inicial','final');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos TO authenticated;
GRANT ALL ON public.grupos TO service_role;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_grupos_updated BEFORE UPDATE ON public.grupos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  ie TEXT,
  cidade TEXT,
  uf TEXT,
  regime_tributario public.regime_tributario NOT NULL DEFAULT 'gerencial',
  config_tributaria JSONB NOT NULL DEFAULT '{"aliquota_pis":0.0165,"aliquota_cofins":0.076,"aliquota_icms":0.18,"aliquota_irpj":0.15,"aliquota_csll":0.09,"adicional_irpj_limite":20000,"adicional_irpj":0.10}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_empresas_grupo ON public.empresas(grupo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas TO authenticated;
GRANT ALL ON public.empresas TO service_role;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.usuarios_perfil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  papel public.papel_usuario NOT NULL DEFAULT 'admin_grupo',
  grupo_id UUID REFERENCES public.grupos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_perfil TO authenticated;
GRANT ALL ON public.usuarios_perfil TO service_role;
ALTER TABLE public.usuarios_perfil ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_usuarios_perfil_updated BEFORE UPDATE ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.usuarios_empresas (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, empresa_id)
);
CREATE INDEX idx_ue_empresa ON public.usuarios_empresas(empresa_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios_empresas TO authenticated;
GRANT ALL ON public.usuarios_empresas TO service_role;
ALTER TABLE public.usuarios_empresas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_empresa_access(_empresa_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_empresas WHERE user_id = auth.uid() AND empresa_id = _empresa_id
  ) OR EXISTS (
    SELECT 1 FROM public.empresas e
    JOIN public.grupos g ON g.id = e.grupo_id
    WHERE e.id = _empresa_id AND g.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_grupo(_grupo_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.grupos WHERE id = _grupo_id AND owner_id = auth.uid());
$$;

CREATE POLICY "Usuário vê próprio grupo" ON public.grupos FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR id IN (SELECT grupo_id FROM public.usuarios_perfil WHERE user_id = auth.uid()));
CREATE POLICY "Usuário cria grupo próprio" ON public.grupos FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner edita grupo" ON public.grupos FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner deleta grupo" ON public.grupos FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Usuário vê empresas autorizadas" ON public.empresas FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(id) OR public.user_owns_grupo(grupo_id));
CREATE POLICY "Owner do grupo cria empresa" ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_grupo(grupo_id));
CREATE POLICY "Owner do grupo edita empresa" ON public.empresas FOR UPDATE TO authenticated
  USING (public.user_owns_grupo(grupo_id)) WITH CHECK (public.user_owns_grupo(grupo_id));
CREATE POLICY "Owner do grupo deleta empresa" ON public.empresas FOR DELETE TO authenticated
  USING (public.user_owns_grupo(grupo_id));

CREATE POLICY "Usuário vê próprio perfil" ON public.usuarios_perfil FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Usuário cria próprio perfil" ON public.usuarios_perfil FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Usuário edita próprio perfil" ON public.usuarios_perfil FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuário vê próprios vínculos" ON public.usuarios_empresas FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_has_empresa_access(empresa_id));
CREATE POLICY "Owner do grupo cria vínculos" ON public.usuarios_empresas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND public.user_owns_grupo(e.grupo_id)));
CREATE POLICY "Owner do grupo remove vínculos" ON public.usuarios_empresas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = empresa_id AND public.user_owns_grupo(e.grupo_id)));

CREATE TABLE public.dre_mensal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  total_vendas NUMERIC(15,2) NOT NULL DEFAULT 0,
  cmv NUMERIC(15,2) NOT NULL DEFAULT 0,
  resultado_bruto NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_despesas NUMERIC(15,2) NOT NULL DEFAULT 0,
  resultado_liquido_gerencial NUMERIC(15,2) NOT NULL DEFAULT 0,
  resultado_liquido_fiscal NUMERIC(15,2),
  estoque_inicial_valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  estoque_final_valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  variacao_estoque NUMERIC(15,2) NOT NULL DEFAULT 0,
  devolucoes NUMERIC(15,2) NOT NULL DEFAULT 0,
  pis NUMERIC(15,2),
  cofins NUMERIC(15,2),
  icms NUMERIC(15,2),
  receita_liquida NUMERIC(15,2),
  compras_periodo NUMERIC(15,2) NOT NULL DEFAULT 0,
  depreciacao NUMERIC(15,2) NOT NULL DEFAULT 0,
  resultado_financeiro NUMERIC(15,2) NOT NULL DEFAULT 0,
  lucro_antes_ir NUMERIC(15,2),
  irpj NUMERIC(15,2),
  csll NUMERIC(15,2),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (empresa_id, mes, ano)
);
CREATE INDEX idx_dre_empresa ON public.dre_mensal(empresa_id);
CREATE INDEX idx_dre_periodo ON public.dre_mensal(empresa_id, ano, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_mensal TO authenticated;
GRANT ALL ON public.dre_mensal TO service_role;
ALTER TABLE public.dre_mensal ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_dre_updated BEFORE UPDATE ON public.dre_mensal FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "DRE select" ON public.dre_mensal FOR SELECT TO authenticated USING (public.user_has_empresa_access(empresa_id));
CREATE POLICY "DRE insert" ON public.dre_mensal FOR INSERT TO authenticated WITH CHECK (public.user_has_empresa_access(empresa_id));
CREATE POLICY "DRE update" ON public.dre_mensal FOR UPDATE TO authenticated USING (public.user_has_empresa_access(empresa_id)) WITH CHECK (public.user_has_empresa_access(empresa_id));
CREATE POLICY "DRE delete" ON public.dre_mensal FOR DELETE TO authenticated USING (public.user_has_empresa_access(empresa_id));

CREATE TABLE public.despesas_detalhe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dre_id UUID NOT NULL REFERENCES public.dre_mensal(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  subcategoria TEXT,
  valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_venda NUMERIC(7,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_despesas_dre ON public.despesas_detalhe(dre_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas_detalhe TO authenticated;
GRANT ALL ON public.despesas_detalhe TO service_role;
ALTER TABLE public.despesas_detalhe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Despesas acesso via DRE" ON public.despesas_detalhe FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dre_mensal d WHERE d.id = dre_id AND public.user_has_empresa_access(d.empresa_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dre_mensal d WHERE d.id = dre_id AND public.user_has_empresa_access(d.empresa_id)));

CREATE TABLE public.inventario_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  data_referencia DATE NOT NULL,
  tipo public.tipo_inventario NOT NULL,
  total_valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_itens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (empresa_id, data_referencia, tipo)
);
CREATE INDEX idx_inv_empresa ON public.inventario_snapshot(empresa_id, data_referencia);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_snapshot TO authenticated;
GRANT ALL ON public.inventario_snapshot TO service_role;
ALTER TABLE public.inventario_snapshot ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.inventario_snapshot FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Inventario acesso" ON public.inventario_snapshot FOR ALL TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));

CREATE TABLE public.inventario_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.inventario_snapshot(id) ON DELETE CASCADE,
  codigo TEXT,
  produto TEXT NOT NULL,
  categoria TEXT,
  unidade TEXT,
  quantidade NUMERIC(15,3) NOT NULL DEFAULT 0,
  valor_unitario NUMERIC(15,4) NOT NULL DEFAULT 0,
  valor_total NUMERIC(15,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_itens_snapshot ON public.inventario_itens(snapshot_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_itens TO authenticated;
GRANT ALL ON public.inventario_itens TO service_role;
ALTER TABLE public.inventario_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Itens acesso via snapshot" ON public.inventario_itens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventario_snapshot s WHERE s.id = snapshot_id AND public.user_has_empresa_access(s.empresa_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventario_snapshot s WHERE s.id = snapshot_id AND public.user_has_empresa_access(s.empresa_id)));

CREATE TABLE public.arquivos_importados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  dre_id UUID REFERENCES public.dre_mensal(id) ON DELETE SET NULL,
  snapshot_id UUID REFERENCES public.inventario_snapshot(id) ON DELETE SET NULL,
  tipo_arquivo public.tipo_arquivo NOT NULL,
  nome_arquivo TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  status public.status_arquivo NOT NULL DEFAULT 'pendente',
  idempotency_key TEXT,
  extracted_json JSONB,
  erro_mensagem TEXT,
  mes INTEGER,
  ano INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, hash_sha256)
);
CREATE INDEX idx_arq_empresa ON public.arquivos_importados(empresa_id);
CREATE INDEX idx_arq_periodo ON public.arquivos_importados(empresa_id, ano, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arquivos_importados TO authenticated;
GRANT ALL ON public.arquivos_importados TO service_role;
ALTER TABLE public.arquivos_importados ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_arq_updated BEFORE UPDATE ON public.arquivos_importados FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Arquivos acesso" ON public.arquivos_importados FOR ALL TO authenticated
  USING (public.user_has_empresa_access(empresa_id))
  WITH CHECK (public.user_has_empresa_access(empresa_id));
