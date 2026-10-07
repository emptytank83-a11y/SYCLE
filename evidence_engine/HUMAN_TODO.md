# Human review queue

Items are added here when source licensing, legal interpretation, expert
judgement, or manual source acquisition requires a person.

## Geography source files

- Download the current ISO 3166-1 and ISO 3166-2 machine-readable files from
  the ISO-authorized distribution used by the organisation and record its
  licence before production ingestion.
- Download current US Census state/county FIPS files and a Census place-to-
  county relationship file. Run `node evidence_engine/geography/import-geographies.js`
  with those files; retain checksums and download dates.

## US jurisdiction rules

- Review all seven rule keys for every US state and the District of Columbia:
  right-to-work, OSHA plan coverage, workers' compensation mandate and opt-out,
  minimum wage, pay transparency, and paid sick leave.
- Replace each null only after checking the linked authoritative page, record
  effective date, reviewer, and review timestamp. Until then the engine returns
  a gap and the narrator cannot state the rule.
