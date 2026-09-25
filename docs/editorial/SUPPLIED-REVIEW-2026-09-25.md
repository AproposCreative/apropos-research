# Supplied review import and local host diagnosis

- Extends authenticated `/api/liv/operations/prepare` with strict `suppliedArticle` copy input for a literature review. Uses existing immutable reservation, preparation lease, saved checkpoint, media, safety gates, CMS readback and queue admission.
- No client-supplied approval, CMS ID, model evidence or media receipt accepted. Same request resumes; changed request conflicts. Failed daily candidates remain untouched.
- Imported copy is limited to 450–3,000 body words; original copy is checked again before CMS save. Generated daily copy retains 450–650 words. Automatic factual/length rewriting is disabled for supplied copy; failed checks still block publication.
- Literature may use explicitly credited illustrations. Film/TV reviews retain mandatory real imagery. No publication result is established by these code changes.
- Regression: 296 files / 4,080 tests passed, TypeScript passed. First full run had nine timing failures after a ~16-minute local pause; rerun under temporary `caffeinate -is -t 7200` passed in 14.49 seconds.
- Mac on AC: `sleep=1`, display sleep 10 minutes, network wake enabled. Power log shows repeated Maintenance Sleep / DarkWake transitions on 25 September. This establishes actual sleep and explains local unavailability; not proof that every reported disconnect has the same cause. Temporary assertion keeps display sleep/lock unaffected. Permanent settings unchanged; user asked separately about disabling system sleep on AC.
- Liv's Vercel cron is independent of this Mac. Its empty queue and failed source/research stages are separate server workflow failures.
