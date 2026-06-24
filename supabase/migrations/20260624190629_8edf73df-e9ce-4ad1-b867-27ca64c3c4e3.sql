
REVOKE EXECUTE ON FUNCTION public.user_has_empresa_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_grupo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_empresa_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_grupo(uuid) TO authenticated;
