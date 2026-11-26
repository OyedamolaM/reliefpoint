import { Instagram, Facebook, Music2 } from "lucide-react";
import { socialProfiles, validSocialUrl } from "@/lib/contact-links";
import type { PublicSettings } from "@/lib/contracts";

export function SocialLinks({ settings }: { settings: PublicSettings }) {
  const icons = [Instagram, Facebook, Music2];
  return (
    <nav aria-label="Social media" className="mt-4 flex flex-wrap items-center gap-4 text-sm">
      {socialProfiles.map((profile, index) => {
        const url = settings[profile.key] ?? profile.url;
        const Icon = icons[index]!;
        return validSocialUrl(url, profile.host) ? (
          <a
            key={profile.key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <Icon size={16} aria-hidden="true" />
            {profile.label}
          </a>
        ) : null;
      })}
    </nav>
  );
}
