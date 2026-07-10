import { BRAND_LOGO_URL } from "./BrandLogo";

/** Marca d'água fixa e discreta com o logo Rota das Carnes. Ignora eventos de mouse. */
export function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
      style={{
        backgroundImage: `url(${BRAND_LOGO_URL})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "min(60vh, 640px)",
        opacity: 0.035,
      }}
    />
  );
}
