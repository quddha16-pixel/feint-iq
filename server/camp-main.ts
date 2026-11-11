import { createCampGateway } from "./camp-gateway";
const app = await createCampGateway({
  root: new URL("../dist", import.meta.url).pathname,
  audience: process.env.CAMP_IAP_AUDIENCE ?? "",
  authorizedEmails: (process.env.CAMP_AUTHORIZED_EMAILS ?? "")
    .split(",")
    .filter(Boolean),
});
const port = Number(process.env.PORT ?? 8790);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid port.");
await app.listen({
  host: process.env.K_SERVICE ? "0.0.0.0" : "127.0.0.1",
  port,
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void app.close();
  });
