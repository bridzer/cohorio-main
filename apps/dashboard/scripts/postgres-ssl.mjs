export function postgresSslConfig(env = process.env) {
  if (env.DATABASE_SSL !== "true") return undefined;
  return {
    rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
  };
}
