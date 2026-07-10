export function logEvent(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`);
}

export function getRequestPathLabel(requestPath: string): string {
  const [path] = requestPath.split("?");
  return path;
}

export function logHabitatApiResponse(
  method: string,
  requestPath: string,
  summary: string,
): void {
  logEvent("habitat-api", `${method} ${getRequestPathLabel(requestPath)} -> ${summary}`);
}
