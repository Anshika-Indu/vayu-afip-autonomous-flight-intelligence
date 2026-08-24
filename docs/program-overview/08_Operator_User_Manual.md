# Autonomous Flight Intelligence Platform (AFIP)
## Operator / User Manual

**Document Series:** AFIP Professional Documentation Suite — 7 of 8
**Classification:** Internal / Program Reference
**Audience:** Ground control station operators and mission supervisors
**Scope Note:** This manual describes the operator's relationship to AFIP as defined by the Product Specification and Software Architecture Document. It does not describe specific screens, controls, or UI layout — the Product Specification explicitly excludes UI design from AFIP's scope (§4). It describes what information is available to an operator and how operator input is handled.

---

## 1. What AFIP Is, From the Operator's Seat

AFIP does not fly the aircraft, and it will never take an action on the aircraft that you cannot see the reasoning for. Every time AFIP proposes something — continue, adjust, hold, divert, abort — that proposal is checked by an independent function before it can take effect, and AFIP produces a plain explanation of why it made that proposal at the same moment it makes it. You are not being asked to trust a black box; you are being given AFIP's reasoning as a byproduct of every decision it makes.

---

## 2. What You Can See

AFIP is designed to make three things visible to you at all times:

- **Current understanding** — what AFIP currently believes to be true about the aircraft, the environment, and the mission, including how confident that belief is and how fresh it is.
- **Current intent** — what AFIP is currently proposing the aircraft do, and whether that proposal has been accepted, modified, or rejected by the independent check.
- **Current reasoning** — the specific facts and rejected alternatives behind AFIP's current proposal, in a form you can read and question.

If AFIP's picture of the aircraft or the mission is stale, incomplete, or internally inconsistent, this is not hidden from you — AFIP is designed to become visibly more conservative in exactly those situations, not silently continue as if nothing changed.

---

## 3. Your Commands Are Treated the Same Way AFIP's Are

This is the single most important operating principle for you to understand: **a command you issue is treated as a proposed intent, exactly like a proposal AFIP generates on its own** — not as a privileged override. Your command still passes through the same independent check before it reaches the aircraft. This is a deliberate design choice, not a limitation on your authority: it means neither you nor AFIP can accidentally bypass the one safety check that exists between reasoning and flight control.

In practice, this means:
- A command you issue can be rejected or modified by the same arbitration function that checks AFIP's own proposals, if it fails a safety or operational constraint.
- There is no emergency channel that skips this check for operator commands, just as there is none for AFIP.
- You will see the outcome of your command (executed, rejected, or modified) with the same explanation standard applied to any other proposal.

---

## 4. What AFIP Tracks About You

To support situational awareness and command handling, AFIP's Operator Interface Boundary tracks (at the level currently defined in the architecture):

| Category | What It Covers |
|---|---|
| Operator identity | Authenticated identity, certification level, session start |
| Commands pending | Queued commands, their type, and their current status (pending, executed, rejected, failed) |
| Situational awareness | What telemetry and alerts you have and have not yet acknowledged |
| Override state | Whether direct stick input (RC override) is currently active, and in what mode |

Every action you take — every click, command, and mode change — is preserved in a permanent, immutable record, on the same basis as AFIP's own decisions are preserved (Product Spec §9.13).

---

## 5. Alerts You Are Expected to Acknowledge

AFIP distinguishes between alerts you have seen and critical alerts that require your explicit response. An unacknowledged critical alert is not treated as "handled" by AFIP — if a condition requires your judgment, AFIP will not assume your silence means agreement.

---

## 6. When AFIP Becomes More Conservative

You should expect AFIP's proposed behavior to become visibly more conservative — not more aggressive — whenever:
- Its understanding of aircraft health, navigation, or mission status is based on stale or low-confidence information.
- A health or navigation condition has crossed a degraded or critical threshold.
- Mission status indicates the mission may no longer be achievable as planned.

In every one of these cases, AFIP's response is to propose holding, adjusting, or reducing scope — never to attempt a more autonomous or aggressive corrective action to compensate for uncertainty.

---

## 7. What AFIP Will Never Do, Regardless of Your Input

- Issue a command directly to an actuator or control surface.
- Bypass the independent check on any proposal, including one it generates in response to your command.
- Treat your input as authoritative over the independent check.
- Hide, suppress, or delay an explanation for a decision it has already made.

---

*AFIP Program Office — Professional Documentation Suite, Document 7 of 8: Operator / User Manual*
