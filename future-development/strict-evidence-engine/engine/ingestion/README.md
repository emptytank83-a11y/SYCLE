# Connector input

CI never calls live services. File connectors accept a canonical JSON document:

```json
{"evidence":[{"indicator_id":"...","geography_id":"...","sector_code":null,"value":null,"value_text":"...","geo_level_used":"country","is_fallback":false,"confidence":"H","notes":"..."}]}
```

The conversion from each publisher's original file must be reviewed separately.
Keep the untouched original beside the canonical file and record its URL,
edition, retrieval date, and checksum. API connectors require an injected row
mapper because publisher response fields differ by indicator and edition.
