# BotolaGO agent roles

Each file here is the operating contract of one role from
`docs/engineering/AGENT_SYSTEM.md`. Every contract has the five mandatory
fields: **Job, Inputs / Sources, Judgment, Output, Forbidden**. The master
system instruction (specification §39) is prepended to every role.

| Role       | File            | Effort      | Output schema                                 |
| ---------- | --------------- | ----------- | --------------------------------------------- |
| Chief      | `chief.md`      | XHIGH       | `schemas/handoff.yaml` (delegation)           |
| Scout      | `scout.md`      | LOW         | `schemas/scout-report.yaml`                   |
| Extractor  | `extractor.md`  | LOW         | requested structured dataset                  |
| Researcher | `researcher.md` | HIGH        | `schemas/engineering-brief.yaml`              |
| Builder    | `builder.md`    | MEDIUM/HIGH | `schemas/implementation-report.yaml`          |
| Verifier   | `verifier.md`   | HIGH        | `schemas/verification-report.yaml`            |
| Reviewer   | `reviewer.md`   | HIGH        | `schemas/review-report.yaml`                  |
| Refiner    | `refiner.md`    | MEDIUM      | `schemas/implementation-report.yaml` (refine) |
| Packager   | `packager.md`   | LOW         | `schemas/release-package.yaml`                |
| Shipper    | `shipper.md`    | MEDIUM      | `schemas/deployment-ready.yaml`               |

Schemas: `docs/engineering/schemas/`. Ledger: `docs/engineering/LAUNCH_LEDGER.yaml`.

Runtime mapping in this repository: the Chief is the coordinating session;
every other role runs as an isolated sub-agent that receives only the handoff
envelope and the inputs it names. The Reviewer sub-agent is always started
fresh and receives no Builder conversation.
