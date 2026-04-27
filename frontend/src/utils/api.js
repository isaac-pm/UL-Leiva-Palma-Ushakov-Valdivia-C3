/**
 * Minimal Vanilla JS fetch wrapper:
 * - Does NOT inject Authorization header (JWT travels via httpOnly cookie).
 * - Sends credentials (cookies) automatically.
 * - Stringifies JSON bodies by default.
 *
 * @param {string} path - The endpoint path (e.g., "/users").
 * @param {Object} opts - Options including method, body, signal, and headers.
 * @returns {Promise<any>} The parsed JSON response or undefined.
 */
export async function fetchApi(path, opts = {}) {
  const { method = "GET", body, signal, headers } = opts;
  
  // Determine if the body is a standard JSON payload or FormData
  const isJson = body !== undefined && !(body instanceof FormData);

  // In standard browser JS, process.env doesn't exist natively.
  // If you are using Vite, you would use import.meta.env.VITE_BACKEND_URL
  // Otherwise, fallback to your hardcoded local URL.
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
  // Safely construct the URL to avoid double slashes (e.g., http://api.com//users)
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

  const res = await fetch(url, {
    method,
    signal,
    body: isJson ? JSON.stringify(body) : body,
    headers: {
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    // Sends cookies automatically
    credentials: "include", 
  });

  // Handle HTTP errors gracefully
  if (!res.ok) {
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      errMsg = data?.message || data?.error || errMsg;
    } catch (e) {
      // Fallback to standard status text if body isn't JSON
    }
    throw new Error(errMsg);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined;
  
  // Attempt to parse JSON response
  try {
    return await res.json();
  } catch (e) {
    return undefined;
  }
}