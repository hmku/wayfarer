import "server-only";
import {
  get,
  put,
  BlobError,
  BlobPreconditionFailedError,
} from "@vercel/blob";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { emptyJournal, Journal, validateJournal } from "./model";
const BLOB_PATHNAME = "wayfarer/journal.json";
const useLocalFile = () =>
  process.env.LOCAL_FILE_STORAGE === "1" && !process.env.VERCEL;
const localJournalPath = () =>
  process.env.LOCAL_JOURNAL_PATH ||
  path.join(process.cwd(), "data", "journal.json");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export class Conflict extends Error {}
// Serializes local read-check-write cycles so revision checks stay atomic.
let localWrites: Promise<unknown> = Promise.resolve();
export async function readJournal(): Promise<{
  journal: Journal;
  revision: string;
}> {
  if (useLocalFile()) {
    try {
      const raw = await readFile(
        /*turbopackIgnore: true*/ localJournalPath(),
        "utf8",
      );
      return {
        journal: validateJournal(JSON.parse(raw)),
        revision: sha256(raw),
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { journal: emptyJournal(), revision: "new" };
      throw e;
    }
  }
  // The SDK supports connected-store OIDC credentials and legacy tokens.
  const result = await get(BLOB_PATHNAME, {
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
  if (useLocalFile()) {
    const operation = localWrites.then(async () => {
      const current = await readJournal();
      if (current.revision !== revision) throw new Conflict();
      await mkdir(path.dirname(localJournalPath()), { recursive: true });
      await writeFile(`${localJournalPath()}.tmp`, raw, { mode: 0o600 });
      await rename(`${localJournalPath()}.tmp`, localJournalPath());
      return sha256(raw);
    });
    localWrites = operation.catch(() => {});
    return operation;
  }
  try {
    const result = await put(BLOB_PATHNAME, raw, {
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
    // A stale ETag raises the typed precondition error. Creating a blob that
    // already exists (allowOverwrite: false) has no typed error in the SDK; it
    // arrives as a generic BlobError, so match its message as a fallback.
    if (
      e instanceof BlobPreconditionFailedError ||
      (e instanceof BlobError &&
        e.message.toLowerCase().includes("already exists"))
    )
      throw new Conflict();
    throw e;
  }
}
