# Autonomous Flight Intelligence Platform (AFIP)
## Future Roadmap

**Document Series:** AFIP Professional Documentation Suite — 8 of 8
**Classification:** Internal / Program Reference
**Derived From:** AFIP Product Specification v0.2 (§12, Future Scalability), AFIP Software Architecture v0.1 (§9, Extensibility Points; Open Questions)
**Scope Note:** This roadmap describes extension directions that are structurally supported by AFIP's current design. It does not commit to specific timelines, fleet sizes, or certification pathways — the Product Specification explicitly withholds those claims until further input is available (§12).

---

## 1. Roadmap Philosophy

AFIP's roadmap is unusual in one respect: every direction listed below is possible **without a redesign of what AFIP fundamentally is**. This follows directly from AFIP's core design choice — authority expressed only as narrow, checked, high-level intent, and reasoning organized around clearly separated domains. Growth in this roadmap is expected to extend AFIP's understanding and reach; none of it is expected to loosen the proposal-only, independently-arbitrated relationship AFIP has with the aircraft.

---

## 2. Near-Term Extension Points (Structurally Ready Today)

| Extension | Why It Requires No Structural Change |
|---|---|
| New categories of evidence (additional sensors, new signal types) | Belief Formation's contract with the layers above it is unchanged as long as new evidence still resolves into the existing belief structure (aircraft condition / environment / mission) |
| New or improved advisory/model-based judgment | Advisory output only ever enters as a confidence-scored flag into an unchanged deterministic decision structure — improving the model changes nothing about how a decision is made or checked |
| A different or upgraded flight-control layer | AFIP's only awareness of the flight-control layer is confined to the single, narrow interface boundary described in the Software Architecture Document — the layer beneath that boundary can change without touching anything above it |
| Additional human or fleet-level oversight | Any additional oversight enters at the Operator Interface Boundary as one more checked source of proposed intent — structurally identical to a single operator today |

---

## 3. Open Engineering Questions Carried Forward

These are unresolved decisions explicitly on record in the Product Specification and Software Architecture Document, not yet answered by this documentation suite:

1. **Should AFIP's health and navigation reasoning explicitly account for the airframe's current known aerodynamic limitations now, or defer until the airframe design matures further?** (Product Spec, Open Questions #1; carried into SEDR-007.)
2. **What does a "mission" concretely consist of for this cargo use case** — single-destination delivery only, or multi-stop/re-taskable missions? (Product Spec, Open Questions #2.)
3. **What latitude does a human ground operator have relative to AFIP's own proposals** — is there any scenario where an operator command is treated differently from an AFIP-originated proposal? (Product Spec, Open Questions #3. Current answer, per §9.15: none — see Operator/User Manual, §3.)
4. **Is there an existing or intended certification pathway** (defense, commercial BVLOS) that should shape how conservatively this specification is written? (Product Spec, Open Questions #4.)
5. **Should the "minimal safe proposal" used during a Decision & Arbitration fault be a single fixed behavior, or vary by flight phase** (hover vs. transition vs. cruise)? (Software Architecture, Open Questions #1.)
6. **Does the Operator Interface Boundary need to support more than one simultaneous human operator**, given the aircraft's heavy-lift cargo context? (Software Architecture, Open Questions #2.)

---

## 4. Long-Range Direction (Contingent on Open Questions Above)

Consistent with the Product Specification's stated scalability claims — and no further than those claims:

- **Regulatory and certification scrutiny:** Because every AFIP decision is explainable and auditable by design, the product is positioned to face increasing regulatory or certification-adjacent scrutiny as it matures, without requiring a fundamental redesign of how it behaves.
- **Airframe evolution:** The aircraft's currently known aerodynamic limitations (high drag, negative lift, positive pitching moment) may change as the airframe design matures. AFIP's health and navigation reasoning is intended to reflect the aircraft's real operating characteristics at any given time — future airframe revisions are expected to be an input AFIP adapts to, not an occasion to redesign AFIP itself.
- **Multi-aircraft / fleet-level oversight:** Because the operator relationship is already structured as one more checked source of intent, extending toward fleet-level oversight does not require changing AFIP's core relationship to any single aircraft.

---

## 5. What Is Explicitly Not on This Roadmap

Per the Product Specification's own scope discipline, this roadmap does not claim: a specific fleet size, a specific certification pathway, a specific new aircraft type, or any capability beyond what is directly supported by the current product and architecture documents. Any such claim would be speculative and is intentionally excluded, consistent with the Product Specification's own closing statement (§12).

---

*AFIP Program Office — Professional Documentation Suite, Document 8 of 8: Future Roadmap*
