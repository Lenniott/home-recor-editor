# Worker protocol — one ticket, TDD

You implement **one** ticket. Stop when that ticket’s acceptance criteria have tests and those tests pass.

## Read first (in order)

1. This file.
2. If you were not given a ticket path, stop and follow `.scratch/CONTINUE.md` instead (orchestrator pickup).
3. The ticket markdown you were given.
4. The matching `## NN` section in that area’s `TDD.md`.
5. Locked decisions in `.scratch/DELIVERY.md` if the ticket is a product-lock.

## Skills

Follow TDD: red before green, one test then minimal code, tests at the **seam** named in `TDD.md` only. Follow codebase-design vocabulary: module, interface, seam, adapter. Do not add a TypeScript `interface` unless the ticket’s first red test cannot compile without it.

## Branch

Stay on the branch named in `.scratch/CONTINUE.md` Status. Do not create a per-ticket branch unless the orchestrator named one. Do not push unless asked.

## Loop

1. Write **only** the **First red** test (name must match `TDD.md`). Use a known literal as the expected value. Call the public interface at the seam. Fake adapters at the seam — not private methods.
2. Run the prove-red command. Confirm that test fails for the named reason, not compile noise you caused elsewhere.
3. Write the smallest implementation that makes that test pass. No extra methods “for later tickets”.
4. Repeat for the next AC as the next red test, one at a time, using **Next reds** in `TDD.md` as the menu.
5. When ACs are checked: `npm test` and `npm run check`. Rust tickets also `cargo test --manifest-path src-tauri/Cargo.toml`.
6. Stop. Leave a 2–4 sentence note: tests added, behavior now true, anything you refused to expand. Add **Manual test:** either `none — <reason>` or 2–5 steps for the Tauri app.
7. If the ticket asks for LOG.md: `python3 "$HOME/.cursor/skills/log-work/scripts/log.py" "<telegraphic outcome>"`. Update README only when an AC says so. Never edit `.scratch/CONTINUE.md`.

## Done

- First red was observed red, then green.
- Every AC has an automated check or an explicit “docs-only” AC already marked in the ticket.
- Unrelated files untouched.
- Orchestrator (not the worker) rewrites `.scratch/CONTINUE.md`.

## If blocked

Product already locked in `DELIVERY.md`. If `TDD.md` is missing First red, stop and tell the orchestrator. Do not invent a second seam.
