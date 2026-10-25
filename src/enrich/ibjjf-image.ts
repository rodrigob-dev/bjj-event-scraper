// Enriquecimento de imagem para eventos IBJJF/CBJJ.
// A API do calendário não traz imagem por evento — só `logoBaseColor`. Mas a
// página de detalhe (pageUrl) tem a imagem do campeonato num CSS inline
// `background:url('/rails/active_storage/blobs/redirect/...bg-logo_<slug>.jpg')`.
// `ibjjf-detail.ts` busca essa página; aqui só se extrai a URL da imagem.

// Captura a 1ª URL de bg-logo do active_storage. Para na extensão para não
// engolir o `&#39;`/aspas/parêntese do CSS inline. Função pura → testável.
export function extractBgLogo(html: string, origin: string): string | null {
  const m = html.match(
    /\/rails\/active_storage\/blobs\/redirect\/[^"'&\s)]*bg-logo[^"'&\s)]*\.(?:jpg|jpeg|png|webp)/i,
  );
  return m ? origin + m[0] : null;
}
