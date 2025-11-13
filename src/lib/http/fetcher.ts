export async function fetcher(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(input, {
    ...init,
    headers,
    cache: init?.cache ?? "no-store",
  });

  if (!response.ok) {
    let message: string | undefined;
    try {
      const data = await response.json();
      message = typeof data?.message === "string" ? data.message : undefined;
    } catch {
      message = undefined;
    }
    if (!message) {
      try {
        message = await response.text();
      } catch {
        message = undefined;
      }
    }
    throw new Error(message || `Solicitud falló con código ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}
