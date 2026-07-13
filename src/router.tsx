import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { toast } from "sonner";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        onError: (error) => {
          console.error("Mutation error:", error);
          toast.error((error as Error)?.message ?? "Erro ao salvar dados");
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error, reset }) => {
      console.error("Router default error:", error);
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Esta página não carregou</h1>
            <p className="mt-2 text-sm text-muted-foreground">{(error as Error)?.message ?? String(error)}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Tentar novamente
              </button>
              <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground">
                Ir para casa
              </a>
            </div>
          </div>
        </div>
      );
    },
  });

  return router;
};
