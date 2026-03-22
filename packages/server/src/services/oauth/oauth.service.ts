// =============================================================================
// EMP CLOUD — OAuth2 Service
// Implements authorization code flow, token exchange, introspection, revocation.
// =============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import {
  randomBase64Url,
  hashToken,
  verifyPKCE,
  sha256,
} from "../../utils/crypto.js";
import { OAuthError } from "../../utils/errors.js";
import {
  signAccessToken,
  signIDToken,
  parseExpiry,
} from "./jwt.service.js";
import { config } from "../../config/index.js";
import type {
  OAuthClient,
  UserRole,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Client Management
// ---------------------------------------------------------------------------

export async function findClientById(clientId: string): Promise<OAuthClient | null> {
  const db = getDB();
  return db("oauth_clients").where({ client_id: clientId, is_active: true }).first() || null;
}

export async function validateClient(
  clientId: string,
  clientSecret?: string,
  redirectUri?: string
): Promise<OAuthClient> {
  const client = await findClientById(clientId);
  if (!client) {
    throw new OAuthError("invalid_client", "Unknown client_id");
  }

  // Verify secret for confidential clients
  if (client.is_confidential) {
    if (!clientSecret) {
      throw new OAuthError("invalid_client", "client_secret required for confidential clients");
    }
    const expectedHash = hashToken(clientSecret);
    if (expectedHash !== client.client_secret_hash) {
      throw new OAuthError("invalid_client", "Invalid client_secret");
    }
  }

  // Verify redirect_uri
  if (redirectUri) {
    const allowedUris: string[] = JSON.parse(client.redirect_uris);
    if (!allowedUris.includes(redirectUri)) {
      throw new OAuthError("invalid_request", "Invalid redirect_uri");
    }
  }

  return client;
}

// ---------------------------------------------------------------------------
// Authorization Code
// ---------------------------------------------------------------------------

export async function createAuthorizationCode(params: {
  clientId: string;
  userId: number;
  organizationId: number;
  redirectUri: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
}): Promise<string> {
  const db = getDB();
  const code = randomBase64Url(32);
  const codeHash = hashToken(code);

  const expiresAt = new Date(Date.now() + parseExpiry(config.oauth.authCodeExpiry) * 1000);

  await db("oauth_authorization_codes").insert({
    code_hash: codeHash,
    client_id: params.clientId,
    user_id: params.userId,
    organization_id: params.organizationId,
    redirect_uri: params.redirectUri,
    scope: params.scope,
    code_challenge: params.codeChallenge || null,
    code_challenge_method: params.codeChallengeMethod || null,
    nonce: params.nonce || null,
    expires_at: expiresAt,
    created_at: new Date(),
  });

  return code;
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<{ access_token: string; refresh_token: string; id_token?: string; expires_in: number; token_type: string; scope: string }> {
  const db = getDB();
  const codeHash = hashToken(params.code);

  const authCode = await db("oauth_authorization_codes")
    .where({ code_hash: codeHash, client_id: params.clientId })
    .first();

  if (!authCode) {
    throw new OAuthError("invalid_grant", "Invalid authorization code");
  }

  if (authCode.used_at) {
    // Code reuse detected — revoke entire family (security measure)
    logger.warn(`Authorization code reuse detected for client ${params.clientId}`);
    throw new OAuthError("invalid_grant", "Authorization code already used");
  }

  if (new Date(authCode.expires_at) < new Date()) {
    throw new OAuthError("invalid_grant", "Authorization code expired");
  }

  if (authCode.redirect_uri !== params.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri mismatch");
  }

  // Verify PKCE
  if (authCode.code_challenge) {
    if (!params.codeVerifier) {
      throw new OAuthError("invalid_grant", "code_verifier required");
    }
    const method = (authCode.code_challenge_method || "S256") as "S256" | "plain";
    if (!verifyPKCE(params.codeVerifier, authCode.code_challenge, method)) {
      throw new OAuthError("invalid_grant", "PKCE verification failed");
    }
  }

  // Mark code as used
  await db("oauth_authorization_codes")
    .where({ id: authCode.id })
    .update({ used_at: new Date() });

  // Look up user and org
  const user = await db("users").where({ id: authCode.user_id }).first();
  const org = await db("organizations").where({ id: authCode.organization_id }).first();

  if (!user || !org) {
    throw new OAuthError("invalid_grant", "User or organization not found");
  }

  // Issue tokens
  return issueTokens({
    userId: user.id,
    orgId: org.id,
    email: user.email,
    role: user.role as UserRole,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
    scope: authCode.scope,
    clientId: params.clientId,
    nonce: authCode.nonce,
  });
}

// ---------------------------------------------------------------------------
// Token Issuance
// ---------------------------------------------------------------------------

export async function issueTokens(params: {
  userId: number;
  orgId: number;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  orgName: string;
  scope: string;
  clientId: string;
  nonce?: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}> {
  const db = getDB();
  const jti = uuidv4();
  const familyId = uuidv4();
  const expiresIn = parseExpiry(config.oauth.accessTokenExpiry);
  const refreshExpiresIn = parseExpiry(config.oauth.refreshTokenExpiry);

  // Sign access token
  const accessToken = signAccessToken({
    sub: params.userId,
    org_id: params.orgId,
    email: params.email,
    role: params.role,
    first_name: params.firstName,
    last_name: params.lastName,
    org_name: params.orgName,
    scope: params.scope,
    client_id: params.clientId,
    jti,
  });

  // Store access token record (for revocation)
  const [accessTokenId] = await db("oauth_access_tokens").insert({
    jti,
    client_id: params.clientId,
    user_id: params.userId,
    organization_id: params.orgId,
    scope: params.scope,
    expires_at: new Date(Date.now() + expiresIn * 1000),
    created_at: new Date(),
  });

  // Generate refresh token
  const refreshTokenRaw = randomBase64Url(48);
  await db("oauth_refresh_tokens").insert({
    token_hash: hashToken(refreshTokenRaw),
    access_token_id: accessTokenId,
    client_id: params.clientId,
    user_id: params.userId,
    organization_id: params.orgId,
    scope: params.scope,
    family_id: familyId,
    expires_at: new Date(Date.now() + refreshExpiresIn * 1000),
    created_at: new Date(),
  });

  const result: any = {
    access_token: accessToken,
    refresh_token: refreshTokenRaw,
    expires_in: expiresIn,
    token_type: "Bearer",
    scope: params.scope,
  };

  // Issue ID token if openid scope requested
  if (params.scope.includes("openid")) {
    result.id_token = signIDToken({
      sub: params.userId,
      email: params.email,
      name: `${params.firstName} ${params.lastName}`,
      given_name: params.firstName,
      family_name: params.lastName,
      org_id: params.orgId,
      org_name: params.orgName,
      role: params.role,
      aud: params.clientId,
      nonce: params.nonce,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Refresh Token
// ---------------------------------------------------------------------------

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}> {
  const db = getDB();
  const tokenHash = hashToken(params.refreshToken);

  const storedToken = await db("oauth_refresh_tokens")
    .where({ token_hash: tokenHash, client_id: params.clientId })
    .first();

  if (!storedToken) {
    throw new OAuthError("invalid_grant", "Invalid refresh token");
  }

  if (storedToken.revoked_at) {
    // Token reuse detected — revoke the entire family
    logger.warn(`Refresh token reuse detected for family ${storedToken.family_id}`);
    await db("oauth_refresh_tokens")
      .where({ family_id: storedToken.family_id })
      .update({ revoked_at: new Date() });
    throw new OAuthError("invalid_grant", "Refresh token reuse detected — all tokens revoked");
  }

  if (new Date(storedToken.expires_at) < new Date()) {
    throw new OAuthError("invalid_grant", "Refresh token expired");
  }

  // Revoke the old refresh token (rotation)
  await db("oauth_refresh_tokens")
    .where({ id: storedToken.id })
    .update({ revoked_at: new Date() });

  // Look up user and org
  const user = await db("users").where({ id: storedToken.user_id }).first();
  const org = await db("organizations").where({ id: storedToken.organization_id }).first();

  if (!user || !org) {
    throw new OAuthError("invalid_grant", "User or organization not found");
  }

  // Issue new token pair (same family)
  const jti = uuidv4();
  const expiresIn = parseExpiry(config.oauth.accessTokenExpiry);
  const refreshExpiresIn = parseExpiry(config.oauth.refreshTokenExpiry);

  const accessToken = signAccessToken({
    sub: user.id,
    org_id: org.id,
    email: user.email,
    role: user.role as UserRole,
    first_name: user.first_name,
    last_name: user.last_name,
    org_name: org.name,
    scope: storedToken.scope,
    client_id: params.clientId,
    jti,
  });

  const [newAccessTokenId] = await db("oauth_access_tokens").insert({
    jti,
    client_id: params.clientId,
    user_id: user.id,
    organization_id: org.id,
    scope: storedToken.scope,
    expires_at: new Date(Date.now() + expiresIn * 1000),
    created_at: new Date(),
  });

  const newRefreshToken = randomBase64Url(48);
  await db("oauth_refresh_tokens").insert({
    token_hash: hashToken(newRefreshToken),
    access_token_id: newAccessTokenId,
    client_id: params.clientId,
    user_id: user.id,
    organization_id: org.id,
    scope: storedToken.scope,
    family_id: storedToken.family_id, // same family for rotation detection
    expires_at: new Date(Date.now() + refreshExpiresIn * 1000),
    created_at: new Date(),
  });

  return {
    access_token: accessToken,
    refresh_token: newRefreshToken,
    expires_in: expiresIn,
    token_type: "Bearer",
    scope: storedToken.scope,
  };
}

// ---------------------------------------------------------------------------
// Token Revocation
// ---------------------------------------------------------------------------

export async function revokeToken(params: {
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
  clientId: string;
}): Promise<void> {
  const db = getDB();

  if (params.tokenTypeHint === "refresh_token" || !params.tokenTypeHint) {
    const tokenHash = hashToken(params.token);
    const updated = await db("oauth_refresh_tokens")
      .where({ token_hash: tokenHash, client_id: params.clientId })
      .whereNull("revoked_at")
      .update({ revoked_at: new Date() });

    if (updated > 0) return;
  }

  if (params.tokenTypeHint === "access_token" || !params.tokenTypeHint) {
    // For access tokens, we need to find by JTI (decoded from JWT)
    // Or we can search by the token itself
    try {
      const { verifyAccessToken } = await import("./jwt.service.js");
      const decoded = verifyAccessToken(params.token);
      await db("oauth_access_tokens")
        .where({ jti: decoded.jti, client_id: params.clientId })
        .whereNull("revoked_at")
        .update({ revoked_at: new Date() });
    } catch {
      // Token might be expired or invalid — that's fine for revocation
    }
  }
}

// ---------------------------------------------------------------------------
// Token Introspection
// ---------------------------------------------------------------------------

export async function introspectToken(params: {
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
}): Promise<object> {
  const db = getDB();

  // Try as access token
  try {
    const { verifyAccessToken } = await import("./jwt.service.js");
    const decoded = verifyAccessToken(params.token);

    // Check if revoked
    const storedToken = await db("oauth_access_tokens")
      .where({ jti: decoded.jti })
      .first();

    if (!storedToken || storedToken.revoked_at) {
      return { active: false };
    }

    return {
      active: true,
      scope: decoded.scope,
      client_id: decoded.client_id,
      sub: String(decoded.sub),
      org_id: decoded.org_id,
      email: decoded.email,
      role: decoded.role,
      token_type: "Bearer",
      exp: decoded.exp,
      iat: decoded.iat,
      iss: decoded.iss,
    };
  } catch {
    // Not a valid access token
  }

  // Try as refresh token
  const tokenHash = hashToken(params.token);
  const refreshToken = await db("oauth_refresh_tokens")
    .where({ token_hash: tokenHash })
    .first();

  if (refreshToken && !refreshToken.revoked_at && new Date(refreshToken.expires_at) > new Date()) {
    return {
      active: true,
      scope: refreshToken.scope,
      client_id: refreshToken.client_id,
      sub: String(refreshToken.user_id),
      token_type: "refresh_token",
      exp: Math.floor(new Date(refreshToken.expires_at).getTime() / 1000),
    };
  }

  return { active: false };
}

// ---------------------------------------------------------------------------
// OIDC Discovery
// ---------------------------------------------------------------------------

export function getOpenIDConfiguration(): object {
  const issuer = config.oauth.issuer;
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    jwks_uri: `${issuer}/oauth/jwks`,
    scopes_supported: ["openid", "profile", "email"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256", "plain"],
  };
}
