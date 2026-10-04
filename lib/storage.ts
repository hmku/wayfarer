import "server-only";
import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { emptyJournal, Journal, validateJournal } from "./model";
const pathname = "wayfarer/journal.json";
const local = () =>
  process.env.LOCAL_FILE_STORAGE === "1" && !process.env.VERCEL;
const file = () =>
  process.env.LOCAL_JOURNAL_PATH ||
  path.join(process.cwd(), "data", "journal.json");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export class Conflict extends Error {}
let queue: Promise<unknown> = Promise.resolve();
export async function readJournal(): Promise<{
  journal: Journal;
  revision: string;
}> {
  if (local()) {
    try {
      const raw = await readFile(/*turbopackIgnore: true*/ file(), "utf8");
      return { journal: validateJournal(JSON.parse(raw)), revision: hash(raw) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { journal: emptyJournal(), revision: "new" };
      throw e;
    }
  }
  // The SDK supports connected-store OIDC credentials and legacy tokens.
  const result = await get(pathname, {
    access: "private",
    useCache: false,
    // Compressed responses can expose a weak ETag that conditional writes reject.
    headers: { "Accept-Encoding": "identity" },
  });
  if (!result) return { journal: emptyJournal(), revision: "new" };
  if (result.statusCode !== 200 || !result.stream)
    throw new Error("Unable to read private journal.");
  return {
    journal: validateJournal(await new Response(result.stream).json()),
    revision: result.blob.etag,
  };
}
export async function writeJournal(journal: Journal, revision: string) {
  const raw = JSON.stringify(journal);
  if (local()) {
    const operation = queue.then(async () => {
      const current = await readJournal();
      if (current.revision !== revision) throw new Conflict();
      await mkdir(path.dirname(file()), { recursive: true });
      await writeFile(`${file()}.tmp`, raw, { mode: 0o600 });
      await rename(`${file()}.tmp`, file());
      return hash(raw);
    });
    queue = operation.catch(() => {});
    return operation;
  }
  try {
    const result = await put(pathname, raw, {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 0,
      ...(revision === "new"
        ? { allowOverwrite: false }
        : { ifMatch: revision }),
    });
    return result.etag;
  } catch (e) {
    if (
      e instanceof BlobPreconditionFailedError ||
      (e instanceof Error && e.message.toLowerCase().includes("already exists"))
    )
      throw new Conflict();
    throw e;
  }
}
