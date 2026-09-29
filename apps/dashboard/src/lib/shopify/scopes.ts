export function parseShopifyScopes(
  value: string | string[] | null | undefined,
) {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ];
}

export function expandShopifyScopes(scopes: string[]) {
  const granted = new Set(scopes);
  for (const scope of scopes) {
    if (scope.startsWith("write_")) {
      granted.add(`read_${scope.slice("write_".length)}`);
    }
  }
  return [...granted];
}

export function missingShopifyScopes(required: string[], granted: string[]) {
  const expanded = new Set(expandShopifyScopes(granted));
  return required.filter((scope) => !expanded.has(scope));
}
