import { useSyncExternalStore } from "react";
import { CART_STORAGE_KEY, WISHLIST_STORAGE_KEY } from "./commerce";
export const COOKIE_PREFERENCES_KEY = "reliefpoint.cookie-preferences.v1";
export const DELIVERY_STORAGE_KEY = "reliefpoint.delivery.v1";
const changed = "reliefpoint:cookie-preferences";
export const cookieSettingsEvent = "reliefpoint:cookie-settings";
let memoryChoice: boolean | null = null;
function read(): boolean | null {
  try {
    const value = JSON.parse(localStorage.getItem(COOKIE_PREFERENCES_KEY) || "null");
    return value?.version === 2 &&
      typeof value.rememberBasket === "boolean" &&
      Number.isFinite(value.expires) &&
      value.expires > Date.now()
      ? value.rememberBasket
      : null;
  } catch {
    return memoryChoice;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(changed, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(changed, callback);
    window.removeEventListener("storage", callback);
  };
}
export function useCookiePreferences() {
  return useSyncExternalStore(subscribe, read, () => undefined);
}
export function clearSavedBasket() {
  try {
    [CART_STORAGE_KEY, WISHLIST_STORAGE_KEY, "reliefpoint.basket.owner.v1"].forEach((key) =>
      localStorage.removeItem(key),
    );
  } catch {
    /* Storage may be disabled. */
  }
}
export function clearSavedDelivery() {
  try {
    localStorage.removeItem(DELIVERY_STORAGE_KEY);
  } catch {
    /* Storage may be disabled. */
  }
}
export function clearOtherDelivery(owner: string) {
  try {
    const value = JSON.parse(localStorage.getItem(DELIVERY_STORAGE_KEY) || "null");
    if (value && value.owner !== owner) clearSavedDelivery();
  } catch {
    clearSavedDelivery();
  }
}
export function saveCookiePreferences(rememberBasket: boolean) {
  memoryChoice = rememberBasket;
  let persisted = true;
  try {
    localStorage.setItem(
      COOKIE_PREFERENCES_KEY,
      JSON.stringify({ version: 2, rememberBasket, expires: Date.now() + 180 * 86400000 }),
    );
  } catch {
    persisted = false;
  }
  if (!rememberBasket) {
    clearSavedBasket();
    clearSavedDelivery();
  }
  window.dispatchEvent(new Event(changed));
  return persisted;
}
export function openCookieSettings() {
  window.dispatchEvent(new Event(cookieSettingsEvent));
}
