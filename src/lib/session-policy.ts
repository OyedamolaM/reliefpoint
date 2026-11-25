export const hourMs = 60 * 60 * 1000;
export const mfaRememberMs = 24 * hourMs;
export const absoluteSessionMs = 7 * 24 * hourMs;
export const inactivityMs = (staff: boolean) => (staff ? 24 : 72) * hourMs;
export const hasMfaAccess = (user: { mfaVerified?: boolean } | null | undefined) =>
  user?.mfaVerified === true;
