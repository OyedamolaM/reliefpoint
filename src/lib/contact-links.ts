export function customerWhatsApp(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[\s()+-]/g, "");
  const international = /^0[789]\d{9}$/.test(digits) ? `234${digits.slice(1)}` : digits;
  return /^234[789]\d{9}$/.test(international) ? `https://wa.me/${international}` : null;
}

export const socialProfiles = [
  {
    key: "instagram_url",
    label: "Instagram",
    url: "https://www.instagram.com/reliefpoint/",
    host: "instagram.com",
  },
  {
    key: "facebook_url",
    label: "Facebook",
    url: "https://www.facebook.com/reliefpoint/",
    host: "facebook.com",
  },
  {
    key: "tiktok_url",
    label: "TikTok",
    url: "https://www.tiktok.com/@reliefpoint",
    host: "tiktok.com",
  },
] as const;

export function validSocialUrl(value: string, host: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === host || url.hostname === `www.${host}`)
    );
  } catch {
    return false;
  }
}
