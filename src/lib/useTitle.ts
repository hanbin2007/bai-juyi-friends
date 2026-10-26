import { useEffect } from "react";

const SITE = "Bai Juyi's Friends";

/** Sets the document title: "Page · Bai Juyi's Friends", or the site title on the home page. */
export function useTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} · ${SITE}` : `${SITE} · 白居易的朋友`;
  }, [page]);
}
