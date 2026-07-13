export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
          note: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
          note?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      arquivos_importados: {
        Row: {
          ano: number | null
          created_at: string
          dre_id: string | null
          empresa_id: string
          erro_mensagem: string | null
          extracted_json: Json | null
          hash_sha256: string
          id: string
          idempotency_key: string | null
          mes: number | null
          nome_arquivo: string
          snapshot_id: string | null
          status: Database["public"]["Enums"]["status_arquivo"]
          storage_path: string
          tipo_arquivo: Database["public"]["Enums"]["tipo_arquivo"]
          updated_at: string
        }
        Insert: {
          ano?: number | null
          created_at?: string
          dre_id?: string | null
          empresa_id: string
          erro_mensagem?: string | null
          extracted_json?: Json | null
          hash_sha256: string
          id?: string
          idempotency_key?: string | null
          mes?: number | null
          nome_arquivo: string
          snapshot_id?: string | null
          status?: Database["public"]["Enums"]["status_arquivo"]
          storage_path: string
          tipo_arquivo: Database["public"]["Enums"]["tipo_arquivo"]
          updated_at?: string
        }
        Update: {
          ano?: number | null
          created_at?: string
          dre_id?: string | null
          empresa_id?: string
          erro_mensagem?: string | null
          extracted_json?: Json | null
          hash_sha256?: string
          id?: string
          idempotency_key?: string | null
          mes?: number | null
          nome_arquivo?: string
          snapshot_id?: string | null
          status?: Database["public"]["Enums"]["status_arquivo"]
          storage_path?: string
          tipo_arquivo?: Database["public"]["Enums"]["tipo_arquivo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_importados_dre_id_fkey"
            columns: ["dre_id"]
            isOneToOne: false
            referencedRelation: "dre_mensal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_importados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arquivos_importados_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventario_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_detalhe: {
        Row: {
          categoria: string
          created_at: string
          dre_id: string
          id: string
          percentual_venda: number | null
          subcategoria: string | null
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string
          dre_id: string
          id?: string
          percentual_venda?: number | null
          subcategoria?: string | null
          valor?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          dre_id?: string
          id?: string
          percentual_venda?: number | null
          subcategoria?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_detalhe_dre_id_fkey"
            columns: ["dre_id"]
            isOneToOne: false
            referencedRelation: "dre_mensal"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_mensal: {
        Row: {
          ano: number
          cmv: number
          cofins: number | null
          compras_periodo: number
          created_at: string
          csll: number | null
          deleted_at: string | null
          depreciacao: number
          devolucoes: number
          empresa_id: string
          estoque_final_valor: number
          estoque_inicial_valor: number
          icms: number | null
          id: string
          irpj: number | null
          lucro_antes_ir: number | null
          mes: number
          observacoes: string | null
          pis: number | null
          receita_liquida: number | null
          resultado_bruto: number
          resultado_financeiro: number
          resultado_liquido_fiscal: number | null
          resultado_liquido_gerencial: number
          total_despesas: number
          total_vendas: number
          updated_at: string
          variacao_estoque: number
        }
        Insert: {
          ano: number
          cmv?: number
          cofins?: number | null
          compras_periodo?: number
          created_at?: string
          csll?: number | null
          deleted_at?: string | null
          depreciacao?: number
          devolucoes?: number
          empresa_id: string
          estoque_final_valor?: number
          estoque_inicial_valor?: number
          icms?: number | null
          id?: string
          irpj?: number | null
          lucro_antes_ir?: number | null
          mes: number
          observacoes?: string | null
          pis?: number | null
          receita_liquida?: number | null
          resultado_bruto?: number
          resultado_financeiro?: number
          resultado_liquido_fiscal?: number | null
          resultado_liquido_gerencial?: number
          total_despesas?: number
          total_vendas?: number
          updated_at?: string
          variacao_estoque?: number
        }
        Update: {
          ano?: number
          cmv?: number
          cofins?: number | null
          compras_periodo?: number
          created_at?: string
          csll?: number | null
          deleted_at?: string | null
          depreciacao?: number
          devolucoes?: number
          empresa_id?: string
          estoque_final_valor?: number
          estoque_inicial_valor?: number
          icms?: number | null
          id?: string
          irpj?: number | null
          lucro_antes_ir?: number | null
          mes?: number
          observacoes?: string | null
          pis?: number | null
          receita_liquida?: number | null
          resultado_bruto?: number
          resultado_financeiro?: number
          resultado_liquido_fiscal?: number | null
          resultado_liquido_gerencial?: number
          total_despesas?: number
          total_vendas?: number
          updated_at?: string
          variacao_estoque?: number
        }
        Relationships: [
          {
            foreignKeyName: "dre_mensal_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          cidade: string | null
          cnpj: string | null
          config_tributaria: Json
          created_at: string
          deleted_at: string | null
          grupo_id: string
          id: string
          ie: string | null
          nome: string
          regime_tributario: Database["public"]["Enums"]["regime_tributario"]
          tipo: Database["public"]["Enums"]["tipo_empresa"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          config_tributaria?: Json
          created_at?: string
          deleted_at?: string | null
          grupo_id: string
          id?: string
          ie?: string | null
          nome: string
          regime_tributario?: Database["public"]["Enums"]["regime_tributario"]
          tipo?: Database["public"]["Enums"]["tipo_empresa"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          config_tributaria?: Json
          created_at?: string
          deleted_at?: string | null
          grupo_id?: string
          id?: string
          ie?: string | null
          nome?: string
          regime_tributario?: Database["public"]["Enums"]["regime_tributario"]
          tipo?: Database["public"]["Enums"]["tipo_empresa"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_config: {
        Row: {
          client_id: string | null
          enabled: boolean
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          enabled?: boolean
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          enabled?: boolean
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      grupos: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventario_itens: {
        Row: {
          categoria: string | null
          codigo: string | null
          id: string
          produto: string
          quantidade: number
          snapshot_id: string
          unidade: string | null
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          id?: string
          produto: string
          quantidade?: number
          snapshot_id: string
          unidade?: string | null
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          id?: string
          produto?: string
          quantidade?: number
          snapshot_id?: string
          unidade?: string | null
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_itens_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventario_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_snapshot: {
        Row: {
          created_at: string
          data_referencia: string
          deleted_at: string | null
          empresa_id: string
          id: string
          tipo: Database["public"]["Enums"]["tipo_inventario"]
          total_itens: number
          total_valor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_referencia: string
          deleted_at?: string | null
          empresa_id: string
          id?: string
          tipo: Database["public"]["Enums"]["tipo_inventario"]
          total_itens?: number
          total_valor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_referencia?: string
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_inventario"]
          total_itens?: number
          total_valor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_snapshot_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos_fiscais: {
        Row: {
          ano: number
          arquivo_path: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          deleted_at: string | null
          empresa_id: string
          id: string
          label: string | null
          mes: number
          observacao: string | null
          sinal: number
          tipo: string
          updated_at: string
          valor_estimado: number | null
          valor_real: number
        }
        Insert: {
          ano: number
          arquivo_path?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          deleted_at?: string | null
          empresa_id: string
          id?: string
          label?: string | null
          mes: number
          observacao?: string | null
          sinal?: number
          tipo: string
          updated_at?: string
          valor_estimado?: number | null
          valor_real?: number
        }
        Update: {
          ano?: number
          arquivo_path?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          deleted_at?: string | null
          empresa_id?: string
          id?: string
          label?: string | null
          mes?: number
          observacao?: string | null
          sinal?: number
          tipo?: string
          updated_at?: string
          valor_estimado?: number | null
          valor_real?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_fiscais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_empresas: {
        Row: {
          created_at: string
          empresa_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfil: {
        Row: {
          created_at: string
          grupo_id: string | null
          id: string
          nome: string | null
          papel: Database["public"]["Enums"]["papel_usuario"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grupo_id?: string | null
          id?: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["papel_usuario"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string | null
          id?: string
          nome?: string | null
          papel?: Database["public"]["Enums"]["papel_usuario"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_perfil_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      link_invited_user: { Args: never; Returns: Json }
      list_grupo_usuarios: {
        Args: never
        Returns: {
          created_at: string
          email: string
          grupo_id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          user_id: string
        }[]
      }
      update_usuario_papel: {
        Args: {
          _papel: Database["public"]["Enums"]["papel_usuario"]
          _user_id: string
        }
        Returns: undefined
      }
      user_has_empresa_access: {
        Args: { _empresa_id: string }
        Returns: boolean
      }
      user_owns_grupo: { Args: { _grupo_id: string }; Returns: boolean }
    }
    Enums: {
      papel_usuario: "admin_grupo" | "gestor_empresa" | "visualizador"
      regime_tributario: "gerencial" | "lucro_real"
      status_arquivo:
        | "pendente"
        | "processando"
        | "extraido"
        | "confirmado"
        | "erro"
      tipo_arquivo: "dre" | "estoque_inicial" | "estoque_final"
      tipo_empresa: "matriz" | "filial"
      tipo_inventario: "inicial" | "final"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      papel_usuario: ["admin_grupo", "gestor_empresa", "visualizador"],
      regime_tributario: ["gerencial", "lucro_real"],
      status_arquivo: [
        "pendente",
        "processando",
        "extraido",
        "confirmado",
        "erro",
      ],
      tipo_arquivo: ["dre", "estoque_inicial", "estoque_final"],
      tipo_empresa: ["matriz", "filial"],
      tipo_inventario: ["inicial", "final"],
    },
  },
} as const
