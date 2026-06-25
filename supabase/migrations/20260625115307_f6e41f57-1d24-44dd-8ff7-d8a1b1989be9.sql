CREATE TYPE public.tipo_empresa AS ENUM ('matriz','filial');

ALTER TABLE public.empresas
  ADD COLUMN tipo public.tipo_empresa NOT NULL DEFAULT 'filial';

WITH primeiras AS (
  SELECT DISTINCT ON (grupo_id) id
  FROM public.empresas
  WHERE deleted_at IS NULL
  ORDER BY grupo_id, created_at ASC
)
UPDATE public.empresas
SET tipo = 'matriz'
WHERE id IN (SELECT id FROM primeiras);

CREATE UNIQUE INDEX empresas_uma_matriz_por_grupo
  ON public.empresas (grupo_id)
  WHERE tipo = 'matriz' AND deleted_at IS NULL;