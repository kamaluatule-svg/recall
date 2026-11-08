# ADR-0004: "Continue with Google" only, plus guest mode

**Status:** Accepted · **Date:** 2026-11-08

## Context
v2 offered email/password and Google. The product owner asked to continue with the Google flow.

## Decision
Google is the only account sign-in method (Firebase `signInWithPopup`, falling back to redirect if pop-ups are blocked). Guest mode remains for instant, account-free trials.

## Consequences
- ✅ No passwords to store, reset or secure; fewer screens; one-click onboarding (goal G1).
- ✅ Profile name and photo come for free.
- ❌ Learners without a Google account can only use guest mode (device-local). Adding another Firebase provider later needs one console toggle and a button.
