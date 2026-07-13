import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

export function RouteErrorCard({
  error,
  reset,
  page,
}: {
  error: Error;
  reset: () => void;
  page: string;
}) {
  const router = useRouter();
  const msg = error?.message ?? String(error);
  const isAuthErr = /refresh.*token|jwt|not authenticated|invalid.*token/i.test(msg);

  useEffect(() => {
    console.error(`[${page}] route error:`, error);
    reportLovableError(error, { boundary: "route_error_component", page });
    if (isAuthErr) {
      // Sessão expirada — força logout e redireciona.
      supabase.auth.signOut().finally(() => {
        router.navigate({ to: "/auth", replace: true });
      });
    }
  }, [error, page, isAuthErr, router]);

  if (isAuthErr) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Sessão expirada
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Redirecionando para o login…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Não foi possível carregar esta página
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tente novamente. Se o erro persistir, troque a empresa/período ou avise o suporte.
        </p>
        <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground">
          {msg}
        </pre>
        <Button
          size="sm"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}
