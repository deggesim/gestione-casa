// CSRF defense contract shared by api (enforces) and web (sends).
// The DEFENSE is the header NAME: it is not CORS-safelisted, so a cross-site
// page cannot set it without a preflight, which our strict CORS_ORIGIN denies.
// The value is arbitrary and is NOT compared server-side.
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'gc-web';
