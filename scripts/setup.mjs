import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
if (existsSync(".env.local")) {
  console.log(".env.local already exists; kept your existing configuration.");
  process.exit(0);
}
mkdirSync("data", { recursive: true });
writeFileSync(
  ".env.local",
  `JOURNAL_KEY=${randomBytes(32).toString("base64url")}\nLOCAL_FILE_STORAGE=1\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created .env.local with a random shared key. Open that file to copy the key for you and your partner. Run npm run dev to start.",
);
