import logoAsset from "@/assets/logo-rota.png.asset.json";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export function BrandLogo({ className, alt = "Rota das Carnes" }: BrandLogoProps) {
  return <img src={logoAsset.url} alt={alt} className={cn("object-contain", className)} />;
}

export const BRAND_LOGO_URL = logoAsset.url;
