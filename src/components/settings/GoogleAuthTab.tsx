import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Info } from "lucide-react";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import {
  getGoogleOAuthConfig,
  updateGoogleOAuthConfig,
} from "@/lib/auth-allowlist.functions";

const SUPABASE_PROJECT_REF = "wzzpybquxllpjrehkunv";
const SUPABASE_CALLBACK = `https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1/callback`;

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success("Copiado");
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function GoogleAuthTab() {
  const qc = useQueryClient();
  const getFn = useServerFn(getGoogleOAuthConfig);
  const updFn = useServerFn(updateGoogleOAuthConfig);

  const cfgQ = useQuery({
    queryKey: ["google-oauth-config"],
    queryFn: () => getFn(),
  });

  const [clientId, setClientId] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (cfgQ.data) {
      setClientId(cfgQ.data.client_id ?? "");
      setEnabled(!!cfgQ.data.enabled);
    }
  }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: () => updFn({ data: { client_id: clientId.trim(), enabled } }),
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["google-oauth-config"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GoogleIcon className="h-5 w-5" />
            Login com Google
          </CardTitle>
          <CardDescription>
            Configure as credenciais OAuth do Google. O Client Secret é gravado
            direto no painel do Supabase (nunca é armazenado neste banco).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="google-client-id">Google Client ID</Label>
            <Input
              id="google-client-id"
              placeholder="1234567890-abcxyz.apps.googleusercontent.com"
              value={clientId}
              onChange={(ev) => setClientId(ev.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Colado do Google Cloud → APIs & Services → Credentials.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium">Ativar botão "Continuar com Google"</p>
              <p className="text-xs text-muted-foreground">
                Só habilite após configurar o provider no Supabase Dashboard.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvando..." : "Salvar configuração"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Passo a passo de configuração
          </CardTitle>
          <CardDescription>
            Use os valores abaixo para configurar no Google Cloud e no Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <Alert>
            <AlertTitle>Importante</AlertTitle>
            <AlertDescription>
              Além de salvar aqui, o Client ID e Client Secret precisam ser
              colados no painel do Supabase → Authentication → Providers →
              Google. O Supabase Auth lê os providers do dashboard dele.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <p className="font-medium">1. Google Cloud Console</p>
            <p className="text-muted-foreground text-xs">
              APIs & Services → Credentials → Create Credentials → OAuth Client
              ID → Web application
            </p>
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Authorized JavaScript origins
              </Label>
              <CopyField value={origin} />
              <CopyField value="https://dre.rotadascarnes.com" />
              <CopyField value="https://meat-metrics.lovable.app" />
            </div>
            <div className="space-y-2 pt-2">
              <Label className="text-xs uppercase text-muted-foreground">
                Authorized redirect URI (obrigatório)
              </Label>
              <CopyField value={SUPABASE_CALLBACK} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium">2. Supabase Dashboard</p>
            <p className="text-muted-foreground text-xs">
              Authentication → Providers → Google: ative e cole o Client ID +
              Client Secret gerados no passo 1.
            </p>
            <p className="text-muted-foreground text-xs">
              Authentication → URL Configuration → Site URL:{" "}
              <code className="rounded bg-muted px-1">
                https://dre.rotadascarnes.com
              </code>
              . Adicione também <code className="rounded bg-muted px-1">/definir-senha</code>{" "}
              nas Redirect URLs.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium">3. Volte aqui e ative o botão</p>
            <p className="text-muted-foreground text-xs">
              Com o provider salvo no Supabase, ative o switch acima e salve.
              O botão "Continuar com Google" aparecerá na tela de login.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
