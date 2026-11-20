import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

const siteOrigin = createIsomorphicFn()
  .server(() => getRequestUrl().origin)
  .client(() => window.location.origin);

export function pageMeta(title: string, description: string, pathname: string) {
  const origin = siteOrigin();
  const image = new URL("/reliefpoint-social-v2.png", origin).href;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "ReliefPoint Pharmacy" },
    { property: "og:locale", content: "en_NG" },
    { property: "og:url", content: new URL(pathname, origin).href },
    { property: "og:image", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      property: "og:image:alt",
      content:
        "ReliefPoint Pharmacy — everyday health, extraordinary care. Royal blue and electric lime pharmacy cross logo.",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    {
      name: "twitter:image:alt",
      content: "ReliefPoint Pharmacy — everyday health, extraordinary care.",
    },
  ];
}
