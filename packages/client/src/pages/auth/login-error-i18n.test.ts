import { describe, expect, it } from "vitest";
import { getLocalizedLoginError } from "./login-error-i18n";

const spanish: Record<string, string> = {
  "auth.networkError": "No se puede conectar con el servidor.",
  "auth.tooManyAttempts": "Demasiados intentos de inicio de sesión.",
  "auth.tooManyAttemptsRetry": "Demasiados intentos. Inténtalo de nuevo en {{minutes}} min.",
  "auth.organizationLoginBlocked": "El inicio de sesión está deshabilitado para esta organización.",
  "auth.loginFailed": "Correo o contraseña inválidos",
  "auth.genericLoginError": "No se pudo iniciar sesión. Inténtalo de nuevo.",
};

const t = (key: string, options?: Record<string, unknown>) => {
  let value = spanish[key] || key;
  for (const [name, replacement] of Object.entries(options || {})) {
    value = value.replace(`{{${name}}}`, String(replacement));
  }
  return value;
};

describe("localized login errors", () => {
  it("maps invalid credentials without exposing the backend message", () => {
    expect(getLocalizedLoginError({
      response: {
        status: 401,
        data: { error: { code: "UNAUTHORIZED" } },
      },
    }, t)).toBe("Correo o contraseña inválidos");
  });

  it("localizes rate limits and retry time", () => {
    expect(getLocalizedLoginError({
      response: {
        status: 429,
        headers: { "retry-after": "125" },
        data: { error: { code: "TOO_MANY_REQUESTS" } },
      },
    }, t)).toBe("Demasiados intentos. Inténtalo de nuevo en 3 min.");
  });

  it("distinguishes blocked organizations, network errors, and generic failures", () => {
    expect(getLocalizedLoginError({
      response: { status: 403, data: { error: { code: "LOGIN_BLOCKED" } } },
    }, t)).toBe("El inicio de sesión está deshabilitado para esta organización.");
    expect(getLocalizedLoginError({}, t)).toBe("No se puede conectar con el servidor.");
    expect(getLocalizedLoginError({ response: { status: 500 } }, t)).toBe(
      "No se pudo iniciar sesión. Inténtalo de nuevo.",
    );
  });
});
