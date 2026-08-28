# BuildUp — Final Frontend Prototype

A Hebrew/RTL React Native + TypeScript (Expo) app connecting **construction workers** with **contractors**, with an **admin** authority that approves registrations and manages users.

This is the **complete, fully-connected frontend prototype** before backend development. All screens are functional, all flows are wired through a centralized in-memory state, and the project type-checks cleanly under `--strict`.

---

## How to run

Requirements: Node 18+, Expo CLI (`npx expo`).

```bash
npm install
npx expo start
```

Then open the app in Expo Go (iOS/Android) or in a simulator.

---

## Demo accounts

The app starts with seeded data. To log in:

| Role        | ID number     | Password              | How                                  |
|-------------|---------------|-----------------------|--------------------------------------|
| **Admin**   | use the seeded admin ID in `data/mockData.ts` (`MOCK_ADMINS`) | any non-empty string | Welcome → "כניסת מנהל"               |
| Worker      | use one of the seeded worker IDs in `data/mockData.ts` | any non-empty string | Welcome → choose Worker → Login |
| Contractor  | use one of the seeded contractor IDs in `data/mockData.ts` | any non-empty string | Welcome → choose Contractor → Login |

You can also register a new worker/contractor via SignUp; the registration goes into the **pending** queue and only becomes a usable customer **after admin approval**.

---

## Architecture

- **State** lives in `context/AppContext.tsx` — a single source of truth for users, jobs, applications, invitations, conversations, notifications, support tickets, and registrations. Every screen reads via `useApp()` and never imports raw mock data.
- **Navigation** lives in `navigation/AppNavigator.tsx` — a state-machine navigator (no react-navigation runtime). Three role shells, each with bottom tabs and a full drilldown stack.
- **Types** in `types/index.ts` — strict, with discriminated unions for status fields and a clean separation between `RegistrationRecord` (pending) and approved `Worker`/`Contractor`.
- **Matching** in `utils/matching.ts` — Smart Match scoring: profession 50 + location 30 + availability 20 (no rating factor — the app has no real review mechanism), with certifications gating.

### Locked behavior (per user requirements)

1. **ADMIN authority.** Registration creates a `RegistrationRecord`. Only after `approveRegistration` does an active customer materialize in `workers` / `contractors`. Blocked / rejected users cannot log in as active.
2. **Registration review** shows ID number, full name, role, ID-photo placeholder, profession / certifications / preferred areas (worker), or contractor registration number / company / project types / area (contractor), plus current status and approve/reject actions.
3. **ApplicationsReceivedScreen** — real screen showing applications joined to the contractor's jobs, status-filterable, with inline accept/reject and drilldowns to worker profile / job details.
4. **WorkerInvitationsScreen** — real screen for invitations the worker has received, with accept/decline calling `respondToInvitation`.
5. **Completed jobs (worker)** — derived only from accepted applications whose linked job has `status === 'completed'`.
6. **Messages / Notifications / Support** — shared screens that filter by `currentUser.id` and `currentUser.role` internally; never global lists.
7. **JobDetailsScreen** is role-aware: contractor mode = management hub (candidates, invitations sent, smart match for this job); worker mode = read-only with Apply button or current application status.
8. **Three connected bodies** — Worker, Contractor, Admin. Every dashboard card opens its real source screen.

---

## Project structure

```
buildup/
├── App.tsx
├── theme/colors.ts                 # Colors, Spacing, Radius, FontSize, Shadow
├── types/index.ts                  # All domain types
├── data/mockData.ts                # Seed data
├── utils/matching.ts               # Smart Match scoring
├── context/AppContext.tsx          # Central state + mutators + selectors
├── components/StatusBadge.tsx      # Reusable status pill
├── navigation/AppNavigator.tsx     # State-machine navigator
└── screens/                        # 37 screens
```

---

## Type-check

```
npx tsc --noEmit
```

The project type-checks cleanly under `--strict`. ✅

---

## Limitations (deliberate, for backend stage)

- All state is **in-memory**; reloading the app resets to seed data. Persistence (AsyncStorage / SQLite / remote DB) is a backend-stage task.
- **Messaging UI is interactive but `send` shows a demo Alert** — real send/receive needs backend wiring.
- Auth uses simple ID + non-empty password. Real password hashing / JWT comes with the backend.
- **External checks** (ID validity, contractor registration number lookup) are mocked; the registration review UI shows the placeholder rows where real API calls will plug in.
- **ID-photo upload** is rendered as a labeled placeholder; file upload connects in the backend stage.
