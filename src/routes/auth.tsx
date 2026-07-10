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
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  return <LoginSignupForm nextPath={next} />;
}
