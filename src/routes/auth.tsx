import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import LoginSignupForm from "@/components/auth/LoginSignupForm";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Entrar — DRE Inteligente Rota das Carnes" },
      {
        name: "description",
        content:
          "Acesse o DRE Inteligente da Rota das Carnes para gerenciar resultados, despesas, estoque e fiscal das suas empresas.",
      },
      { property: "og:title", content: "Entrar — DRE Inteligente Rota das Carnes" },
      {
        property: "og:description",
        content: "Login do sistema DRE Inteligente da Rota das Carnes.",
      },
      { property: "og:url", content: "https://dre.rotadascarnes.com/auth" },
    ],
    links: [{ rel: "canonical", href: "https://dre.rotadascarnes.com/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  return <LoginSignupForm nextPath={next} />;
}
