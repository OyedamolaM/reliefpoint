import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { customerWhatsApp, validSocialUrl } from "@/lib/contact-links";
import { SocialLinks } from "@/components/social-links";
afterEach(cleanup);
it("links Nigerian customer phone numbers without accepting malformed destinations", () => {
  for (const phone of ["08012345678", "+234 801 234 5678", "2348012345678"])
    expect(customerWhatsApp(phone)).toBe("https://wa.me/2348012345678");
  for (const phone of ["", "123", "javascript:alert(1)", "080123456789"])
    expect(customerWhatsApp(phone)).toBeNull();
});
it("renders editable social profiles and rejects external or unsafe replacements", () => {
  render(
    <SocialLinks
      settings={{
        instagram_url: "https://instagram.com/reliefpointpharmacy/",
        facebook_url: "javascript:alert(1)",
      }}
    />,
  );
  expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
    "href",
    "https://instagram.com/reliefpointpharmacy/",
  );
  expect(screen.getByRole("link", { name: "TikTok" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(screen.queryByRole("link", { name: "Facebook" })).not.toBeInTheDocument();
  expect(validSocialUrl("https://instagram.com.evil.example/", "instagram.com")).toBe(false);
});
