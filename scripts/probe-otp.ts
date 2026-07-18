import { auth } from "../src/lib/auth.js";

async function main() {
  const h = await auth.handler(
    new Request("http://localhost:4000/api/auth/phone-number/send-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
      },
      body: JSON.stringify({ phoneNumber: "+15551234567" }),
    }),
  );
  console.log("status", h.status);
  console.log(await h.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
