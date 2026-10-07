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
