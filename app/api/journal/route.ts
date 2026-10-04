import { NextResponse } from "next/server";
import { authorized, sameOrigin } from "@/lib/auth";
import { readJournal, writeJournal, Conflict } from "@/lib/storage";
import { validateJournal } from "@/lib/model";
import { applyChanges, ChangeConflict, parseChanges } from "@/lib/changes";
import { BodyTooLarge, NO_STORE, parseObject, readBody } from "@/lib/http";

const MAX_BODY_BYTES = 2_000_000;
// Attempts when another save lands between our read and write.
const WRITE_ATTEMPTS = 5;
const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

export async function GET() {
  if (!(await authorized()))
    return reply({ error: "Unlock your journal first." }, 401);
  try {
    return reply(await readJournal());
  } catch {
    return reply(
      {
        error:
          "Could not open your journal. Check the private file storage connection.",
      },
      503,
    );
  }
}
/** Shared checks for writes: origin, session, and a JSON object body. */
async function readWrite(
  request: Request,
): Promise<{ input: Record<string, unknown> } | { response: NextResponse }> {
  if (!sameOrigin(request))
    return { response: reply({ error: "Request rejected." }, 403) };
  if (!(await authorized()))
    return {
      response: reply(
        { error: "Your session expired. Unlock the journal again." },
        401,
      ),
    };
  try {
    const input = parseObject(await readBody(request, MAX_BODY_BYTES));
    if (input) return { input };
  } catch (e) {
    if (e instanceof BodyTooLarge)
      return { response: reply({ error: "The journal is too large." }, 413) };
  }
  return { response: reply({ error: "Invalid request." }, 400) };
}

const saveFailed = () =>
  reply(
    {
      error: "Could not save. Your change has not been saved; please try again.",
    },
    503,
  );

/**
 * Apply field-level changes to the latest journal. Edits to different fields
 * (or different people's rankings) never conflict; only a field that changed
 * since the editor saw it does.
 */
export async function PATCH(request: Request) {
  const write = await readWrite(request);
  if ("response" in write) return write.response;
  let changes;
  try {
    changes = parseChanges(write.input.changes);
  } catch (e) {
    return reply({ error: (e as Error).message }, 400);
  }
  for (let attempt = 1; ; attempt++) {
    let current;
    try {
      current = await readJournal();
    } catch {
      return saveFailed();
    }
    let journal;
    try {
      journal = validateJournal(applyChanges(current.journal, changes));
    } catch (e) {
      // A same-field edit by the partner, or a change that would leave
      // invalid data.
      return reply(
        { error: (e as Error).message },
        e instanceof ChangeConflict ? 409 : 400,
      );
    }
    try {
      const revision = await writeJournal(journal, current.revision);
      return reply({ journal, revision });
    } catch (e) {
      // Another save landed between our read and write: reapply on top of it.
      if (e instanceof Conflict && attempt < WRITE_ATTEMPTS) continue;
      return saveFailed();
    }
  }
}

/** Replace the whole journal at a known revision (used by tests and tools). */
export async function PUT(request: Request) {
  const write = await readWrite(request);
  if ("response" in write) return write.response;
  const { input } = write;
  let journal;
  try {
    journal = validateJournal(input.journal);
  } catch (e) {
    return reply({ error: (e as Error).message }, 400);
  }
  if (typeof input.revision !== "string" || input.revision.length > 200)
    return reply({ error: "Missing revision." }, 400);
  try {
    const revision = await writeJournal(journal, input.revision);
    return reply({ journal, revision });
  } catch (e) {
    if (e instanceof Conflict)
      return reply(
        {
          error:
            "Your partner changed the journal. Refresh, then apply your change again. Your draft is still open.",
        },
        409,
      );
    return saveFailed();
  }
}
