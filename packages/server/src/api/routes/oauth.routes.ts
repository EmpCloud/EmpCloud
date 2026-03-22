// =============================================================================
// EMP CLOUD — OAuth2/OIDC Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  validateClient,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken,
  introspectToken,
  getOpenIDConfiguration,
} from "../../services/oauth/oauth.service.js";
import { getJWKS } from "../../services/oauth/jwt.service.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { OAuthError } from "../../utils/errors.js";
import { oauthAuthorizeSchema, oauthTokenSchema, oauthRevokeSchema, oauthIntrospectSchema, AuditAction } from "@empcloud/shared";

const router = Router();

// GET /.well-known/openid-configuration
router.get("/.well-known/openid-configuration", (_req: Request, res: Response) => {
  res.json(getOpenIDConfiguration());
});

// GET /oauth/jwks
router.get("/jwks", (_req: Request, res: Response) => {
  res.json(getJWKS());
});

// GET /oauth/authorize — Authorization endpoint
// In production, this renders a consent page. For API, it validates and returns the code.
router.get("/authorize", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = oauthAuthorizeSchema.parse(req.query);

    // Validate client and redirect_uri
    await validateClient(params.client_id, undefined, params.redirect_uri);

    // PKCE validation for public clients
    const client = await validateClient(params.client_id);
    if (!client.is_confidential && !params.code_challenge) {
      throw new OAuthError("invalid_request", "PKCE code_challenge required for public clients");
    }

    // Create authorization code
    const code = await createAuthorizationCode({
      clientId: params.client_id,
      userId: req.user!.sub,
      organizationId: req.user!.org_id,
      redirectUri: params.redirect_uri,
      scope: params.scope,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: params.code_challenge_method,
      nonce: params.nonce,
    });

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.OAUTH_AUTHORIZE,
      details: { client_id: params.client_id, scope: params.scope },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Redirect back with code
    const redirectUrl = new URL(params.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("state", params.state);
    res.redirect(302, redirectUrl.toString());
  } catch (err) {
    next(err);
  }
});

// POST /oauth/token — Token endpoint
router.post("/token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = oauthTokenSchema.parse(req.body);

    if (params.grant_type === "authorization_code") {
      // Validate client
      await validateClient(params.client_id, params.client_secret);

      const tokens = await exchangeAuthorizationCode({
        code: params.code,
        clientId: params.client_id,
        redirectUri: params.redirect_uri,
        codeVerifier: params.code_verifier,
      });

      await logAudit({
        action: AuditAction.OAUTH_TOKEN,
        details: { client_id: params.client_id, grant_type: "authorization_code" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(tokens);
    } else if (params.grant_type === "refresh_token") {
      const tokens = await refreshAccessToken({
        refreshToken: params.refresh_token,
        clientId: params.client_id,
      });

      res.json(tokens);
    } else if (params.grant_type === "client_credentials") {
      await validateClient(params.client_id, params.client_secret);
      // Client credentials flow — for service-to-service
      // Returns a limited access token
      throw new OAuthError("unsupported_grant_type", "Client credentials flow not yet implemented");
    }
  } catch (err) {
    next(err);
  }
});

// POST /oauth/revoke — Token revocation (RFC 7009)
router.post("/revoke", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = oauthRevokeSchema.parse(req.body);
    await validateClient(params.client_id, params.client_secret);

    await revokeToken({
      token: params.token,
      tokenTypeHint: params.token_type_hint,
      clientId: params.client_id,
    });

    await logAudit({
      action: AuditAction.TOKEN_REVOKED,
      details: { client_id: params.client_id },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // RFC 7009: always return 200 regardless of whether token was found
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

// POST /oauth/introspect — Token introspection (RFC 7662)
router.post("/introspect", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = oauthIntrospectSchema.parse(req.body);
    await validateClient(params.client_id, params.client_secret);

    const result = await introspectToken({
      token: params.token,
      tokenTypeHint: params.token_type_hint,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /oauth/userinfo — OIDC UserInfo endpoint
router.get("/userinfo", authenticate, (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    sub: String(user.sub),
    email: user.email,
    name: `${user.first_name} ${user.last_name}`,
    given_name: user.first_name,
    family_name: user.last_name,
    org_id: user.org_id,
    org_name: user.org_name,
    role: user.role,
  });
});

export default router;
