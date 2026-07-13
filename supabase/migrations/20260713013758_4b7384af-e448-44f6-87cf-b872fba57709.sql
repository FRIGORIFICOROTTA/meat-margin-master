CREATE OR REPLACE FUNCTION public.link_invited_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_added_by uuid;
  v_grupo_id uuid;
  v_empresas uuid[];
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
    INTO v_email, v_name
  FROM auth.users WHERE id = v_user_id;

  IF v_email IS NULL THEN RETURN NULL; END IF;

  SELECT added_by INTO v_added_by
  FROM public.allowed_emails
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_added_by IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_grupo_id FROM public.grupos WHERE owner_id = v_added_by LIMIT 1;
  IF v_grupo_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.usuarios_perfil (user_id, nome, papel, grupo_id)
  VALUES (v_user_id, v_name, 'gestor_empresa', v_grupo_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.usuarios_empresas (user_id, empresa_id)
  SELECT v_user_id, e.id
  FROM public.empresas e
  WHERE e.grupo_id = v_grupo_id AND e.deleted_at IS NULL
  ON CONFLICT DO NOTHING;

  SELECT array_agg(empresa_id) INTO v_empresas
  FROM public.usuarios_empresas WHERE user_id = v_user_id;

  RETURN jsonb_build_object('grupo_id', v_grupo_id, 'empresas', v_empresas);
END;
$$;