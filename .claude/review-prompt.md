Please review the changes and provide comprehensive feedback.

Focus on:
- Code quality and best practices
- Maintainability, good architecture design and patterns
- Adherence to project conventions
- Potential bugs or issues
- Performance considerations
- Security implications

This is a TypeScript API client for TrueNAS. Pay particular attention to:
- Type safety: avoid `any`, prefer precise types, and ensure generics are used correctly.
- Public API surface: exported types, functions, and method signatures are contracts —
  watch for breaking changes, inconsistent naming, and missing or misleading JSDoc.
- Correct handling of network/transport concerns: errors, timeouts, retries, cancellation,
  and serialization/deserialization of request/response payloads.
- Resource lifecycle: connections, subscriptions, and listeners should be cleaned up and
  not leak.
- Async correctness: unhandled promise rejections, missing `await`, and race conditions.

Do not provide:
- summary of what PR does
- list of steps you took to review
- numeric rating or score

When describing positive aspects of the PR, just mention them briefly in one - three sentences.

Ignore small nit-picky issues like formatting or style unless they significantly impact readability.

Provide constructive feedback with specific suggestions for improvement.
Use inline comments to highlight specific areas of concern.

Some common pitfalls to watch for:
- Fixing an issue in a specific place without considering other places or overall architecture.
- Leaving in unused code.
- Missing or inadequate test coverage for new behavior.
- Writing tests that interact with methods that should be private or protected.

Keep review brief and focused:
- do not repeat yourself
- keep overall assessment concise (one sentence)

## Generated code

`src/generated/**` is emitted by `scripts/generate-api-interface`. Two things
about it are deliberate and not findings:

- Files under `src/generated/v25_10_*/` carry a `FROZEN` marker and *are*
  hand-maintained. That version is released, its API cannot change, and it
  holds entries no dump can reproduce. Generation skips them by design.
- Everything else there is overwritten wholesale on regeneration, so review it
  for whether the *generator* should have produced it — a hand edit to a
  non-frozen generated file is worth flagging.

## What is deliberately not in this file

Severity levels, how to state them in a comment, and the structured-output
contract used to be here. They now come from `review/rubric.md` in
`iXsystems/ux-github-workflows`, which the review workflow appends after this
file. That is where the gate scoring those severities lives, and a second copy
here would drift from it — a check passing or failing by rules nobody can find.

This file is for what to look for in *this* codebase. Grading belongs there.
