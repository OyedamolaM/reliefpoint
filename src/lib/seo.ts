export const SITE_ORIGIN = "https://www.reliefpointpharmacy.com";
export function canonicalUrl(pathname: string) {
  const url = new URL(pathname, SITE_ORIGIN);
  return `${SITE_ORIGIN}${url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "")}`;
}

export function pageMeta(title: string, description: string, pathname: string, imagePath?: string) {
  const origin = SITE_ORIGIN;
  const image = new URL(imagePath ?? "/reliefpoint-social-v2.png", origin).href;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "ReliefPoint Pharmacy" },
    { property: "og:locale", content: "en_NG" },
    { property: "og:url", content: canonicalUrl(pathname) },
    { property: "og:image", content: image },
    ...(!imagePath
      ? [
          { property: "og:image:type", content: "image/png" },
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
        ]
      : []),
    {
      property: "og:image:alt",
      content: imagePath
        ? title
        : "ReliefPoint Pharmacy — everyday health, extraordinary care. Royal blue and electric lime pharmacy cross logo.",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    {
      name: "twitter:image:alt",
      content: imagePath ? title : "ReliefPoint Pharmacy — everyday health, extraordinary care.",
    },
  ];
}
