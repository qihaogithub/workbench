import {
  MissingProductionSecretsError,
  resolveSecrets,
} from "../src/secrets.js";

describe("secret resolution", () => {
  it("uses environment values and explicit non-production fallbacks", () => {
    expect(resolveSecrets({
      nodeEnv: "test",
      env: { JWT_SECRET: "from-env" },
      fallback: {
        JWT_SECRET: "ignored",
        ADMIN_SECRET: "test-admin",
      },
    })).toEqual({
      JWT_SECRET: "from-env",
      ADMIN_SECRET: "test-admin",
    });
  });

  it("does not provide implicit fallbacks outside production", () => {
    expect(resolveSecrets({ nodeEnv: "development", env: {} })).toEqual({});
    expect(() => resolveSecrets({
      nodeEnv: "development",
      env: {},
      fallback: { JWT_SECRET: "" },
    })).toThrow(/Fallback/);
  });

  it("only requires the secrets owned by the current service", () => {
    expect(
      resolveSecrets({
        nodeEnv: "production",
        env: { INTERNAL_API_TOKEN: "internal" },
        required: ["INTERNAL_API_TOKEN"],
      }),
    ).toEqual({ INTERNAL_API_TOKEN: "internal" });
  });

  it("fails closed in production and ignores fallbacks there", () => {
    expect(() => resolveSecrets({
      nodeEnv: "production",
      env: { JWT_SECRET: "jwt" },
      fallback: { ADMIN_SECRET: "fallback" },
    })).toThrow(MissingProductionSecretsError);

    try {
      resolveSecrets({
        nodeEnv: "production",
        env: { JWT_SECRET: "jwt" },
        fallback: { ADMIN_SECRET: "fallback" },
      });
    } catch (error) {
      expect((error as MissingProductionSecretsError).missing).toContain(
        "ADMIN_SECRET",
      );
      expect((error as MissingProductionSecretsError).missing).not.toContain(
        "JWT_SECRET",
      );
    }
  });
});
