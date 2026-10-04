import { NextResponse } from "next/server";
import { authorized, sameOrigin } from "@/lib/auth";
import { readJournal, writeJournal, Conflict } from "@/lib/storage";
import { validateJournal } from "@/lib/model";
import { BodyTooLarge, NO_STORE, parseObject, readBody } from "@/lib/http";

const MAX_BODY_BYTES = 2_000_000;
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
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Request rejected." }, 403);
  if (!(await authorized()))
    return reply(
      { error: "Your session expired. Unlock the journal again." },
      401,
    );
  let input;
  try {
    input = parseObject(await readBody(request, MAX_BODY_BYTES));
  } catch (e) {
    if (e instanceof BodyTooLarge)
      return reply({ error: "The journal is too large." }, 413);
    return reply({ error: "Invalid request." }, 400);
  }
  if (!input) return reply({ error: "Invalid request." }, 400);
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
    return reply(
      {
        error:
          "Could not save. Your change has not been saved; please try again.",
      },
      503,
    );
  }
}
