import { describe, expect, it } from "vitest";
import { postgresSslConfig } from "./database";

describe("postgres TLS", () => {
  it("leaves SSL off unless DATABASE_SSL=true", () => {
    expect(postgresSslConfig({} as unknown as NodeJS.ProcessEnv)).toBeUndefined();
    expect(
      postgresSslConfig({ DATABASE_SSL: "false" } as unknown as NodeJS.ProcessEnv),
    ).toBeUndefined();
  });

  it("verifies certificates when TLS is enabled", () => {
    expect(
      postgresSslConfig({ DATABASE_SSL: "true" } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ rejectUnauthorized: true });
  });

  it("allows an explicit provider workaround", () => {
    expect(
      postgresSslConfig({
        DATABASE_SSL: "true",
        DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ rejectUnauthorized: false });
  });
});
