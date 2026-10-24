import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const roles = [
  "reporter",
  "coordinator",
  "technician",
  "approver",
  "admin",
  "environment_officer",
  "environment_ingestor",
] as const;
export type Role = (typeof roles)[number];
export type Principal = {
  id: string;
  username: string;
  name: string;
  roles: Role[];
};

export async function verifyAccessToken(
  token: string,
  options: { issuer: string; audience: string; key: JWTVerifyGetKey },
) {
  const { payload } = await jwtVerify(token, options.key, {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat"],
  });
  if (!payload.sub || typeof payload.preferred_username !== "string")
    throw new Error("Invalid identity claims");
  return { id: payload.sub, username: payload.preferred_username };
}

export function remoteKey(url: string) {
  return createRemoteJWKSet(new URL(url), { timeoutDuration: 5000 });
}
export function canCreate(principal: Principal) {
  return principal.roles.some(
    (role) => role === "reporter" || role === "coordinator",
  );
}
export function canComplete(principal: Principal, assignee: string) {
  return principal.id === assignee && principal.roles.includes("technician");
}
