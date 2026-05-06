export async function customfetch(path, opts = {}) {
  const { method = "GET", body, signal, headers } = opts;
  
  const isJson = body !== undefined && !(body instanceof FormData);

  const baseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  
  const res = await fetch(url, {
    method,
    signal,
    body: isJson ? JSON.stringify(body) : body,
    headers: {
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    credentials: "include", 
  });

  const json = await res.json();
  
  if (json.status !== 'success') {
    throw new Error(json.msg || 'API returned error');
  }
  
  if (res.status === 204) return undefined;
  
  return json;
}