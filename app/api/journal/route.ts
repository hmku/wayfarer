import { NextResponse } from "next/server";
import { authorized, sameOrigin } from "@/lib/auth";
import { readJournal, writeJournal, Conflict } from "@/lib/storage";
import { validateJournal } from "@/lib/model";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  if (!(await authorized()))
    return NextResponse.json(
      { error: "Unlock your journal first." },
      { status: 401, headers },
    );
  try {
    return NextResponse.json(await readJournal(), { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not open your journal. Check the private file storage connection.",
      },
      { status: 503, headers },
    );
  }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Request rejected." },
      { status: 403, headers },
    );
  if (!(await authorized()))
    return NextResponse.json(
      { error: "Your session expired. Unlock the journal again." },
      { status: 401, headers },
    );
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000)
      return NextResponse.json(
        { error: "The journal is too large." },
        { status: 413, headers },
      );
    const input = JSON.parse(raw);
    let journal;
    try {
      journal = validateJournal(input.journal);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400, headers },
      );
    }
    if (typeof input.revision !== "string" || input.revision.length > 200)
      return NextResponse.json(
        { error: "Missing revision." },
        { status: 400, headers },
      );
    const revision = await writeJournal(journal, input.revision);
    return NextResponse.json({ journal, revision }, { headers });
  } catch (e) {
    if (e instanceof Conflict)
      return NextResponse.json(
        {
          error:
            "Your partner changed the journal. Refresh, then apply your change again. Your draft is still open.",
        },
        { status: 409, headers },
      );
    if (e instanceof SyntaxError)
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400, headers },
      );
    return NextResponse.json(
      {
        error:
          "Could not save. Your change has not been saved; please try again.",
      },
      { status: 503, headers },
    );
  }
}
