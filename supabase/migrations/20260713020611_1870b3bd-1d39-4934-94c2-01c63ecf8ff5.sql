CREATE OR REPLACE FUNCTION public.list_grupo_usuarios()
RETURNS TABLE(user_id uuid, nome text, email text, papel papel_usuario, grupo_id uuid, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo uuid;
BEGIN
  SELECT id INTO v_grupo FROM public.grupos WHERE owner_id = auth.uid() LIMIT 1;
  IF v_grupo IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.user_id, p.nome, u.email::text, p.papel, p.grupo_id, p.created_at
    FROM public.usuarios_perfil p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.grupo_id = v_grupo
    ORDER BY p.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_usuario_papel(_user_id uuid, _papel papel_usuario)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo uuid;
  v_target_grupo uuid;
  v_owner uuid;
BEGIN
  SELECT id INTO v_grupo FROM public.grupos WHERE owner_id = auth.uid() LIMIT 1;
  IF v_grupo IS NULL THEN RAISE EXCEPTION 'Somente admins do grupo'; END IF;

  SELECT grupo_id INTO v_target_grupo FROM public.usuarios_perfil WHERE user_id = _user_id;
  IF v_target_grupo IS NULL OR v_target_grupo <> v_grupo THEN
    RAISE EXCEPTION 'Usuário não pertence ao seu grupo';
  END IF;

  SELECT owner_id INTO v_owner FROM public.grupos WHERE id = v_grupo;
  IF _user_id = v_owner THEN
    RAISE EXCEPTION 'Não é possível alterar o papel do dono do grupo';
  END IF;

  UPDATE public.usuarios_perfil SET papel = _papel, updated_at = now() WHERE user_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_grupo_usuarios() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_usuario_papel(uuid, papel_usuario) TO authenticated;