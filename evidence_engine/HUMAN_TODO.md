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

## Source licensing and downloads

Commercial-use licensing must be reviewed for every connector before production
use. Current status is deliberately `null`: BLS SOII, BLS CPS, Census ACS, MIT
Living Wage, OSHA enforcement/establishment data, ITUC Global Rights Index,
Transparency International CPI, World Bank WGI, Walk Free GSI, Fund for Peace
FSI, US DOL List of Goods, UN Comtrade/USITC DataWeb, and USGS Mineral Commodity
Summaries.

Manual downloads are required for sources without a stable supported API. Save
the original file, download URL, edition, download timestamp, and checksum, then
convert it to the canonical connector input documented in `ingestion/README.md`.

The UNEP source ranking and passenger-car ICE/EV product mappings are draft
expert judgements. A qualified S-LCA practitioner and trade-classification
specialist must approve them before production use.
