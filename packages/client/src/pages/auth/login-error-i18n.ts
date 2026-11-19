type Translate = (key: string, options?: Record<string, unknown>) => string;

type LoginRequestError = {
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
    data?: {
      error?: {
        code?: string;
      };
    };
  };
};

export function getLocalizedLoginError(error: LoginRequestError, t: Translate): string {
  const response = error?.response;

  if (!response) {
    return t("auth.networkError");
  }

  const errorCode = response.data?.error?.code;
  if (response.status === 429 || errorCode === "TOO_MANY_REQUESTS" || errorCode === "RATE_LIMIT") {
    const retryAfterSeconds = Number(response.headers?.["retry-after"]);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return t("auth.tooManyAttemptsRetry", {
        minutes: Math.ceil(retryAfterSeconds / 60),
      });
    }
    return t("auth.tooManyAttempts");
  }

  if (errorCode === "LOGIN_BLOCKED") {
    return t("auth.organizationLoginBlocked");
  }

  if (response.status === 401 || errorCode === "UNAUTHORIZED") {
    return t("auth.loginFailed");
  }

  return t("auth.genericLoginError");
}
