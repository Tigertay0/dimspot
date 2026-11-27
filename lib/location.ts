/**
 * Whether the app may ask the browser for a position without surprising anyone.
 *
 * Opening the map on the visitor's own street is the point, but a permission
 * prompt on first load, before they have asked for anything, is the pattern
 * people learn to dismiss. So the precise position is used on load only when
 * it will not prompt for the first time: the browser reports the permission as
 * granted, or this visitor has pressed "show my location" here before.
 */
const USED_KEY = "dimspot-located";

export async function locationAllowed(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;

  let usedBefore = false;
  try {
    usedBefore = localStorage.getItem(USED_KEY) === "1";
  } catch {
    // Storage blocked: fall back to what the browser says.
  }

  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    if (status) {
      // Safari reports "prompt" again in every new session unless the site is
      // set to Allow; someone who located themselves here before expects it.
      return status.state === "granted" || (status.state === "prompt" && usedBefore);
    }
  } catch {
    // No Permissions API for geolocation in this browser.
  }
  return usedBefore;
}

/** Record that a position was given, or that it was refused. */
export function rememberLocationUse(used: boolean): void {
  try {
    if (used) localStorage.setItem(USED_KEY, "1");
    else localStorage.removeItem(USED_KEY);
  } catch {
    // Storage blocked: nothing to remember with.
  }
}
