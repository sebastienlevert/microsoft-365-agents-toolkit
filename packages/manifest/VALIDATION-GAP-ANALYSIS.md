# Copilot Validation Rules: Gap Analysis Report

> **Source of truth**: [`Microsoft.Plugins.Manifest`](https://github.com/microsoft/Microsoft.Plugins.Manifest) (.NET library)
> **Target**: [`microsoft-365-agents-toolkit`](https://github.com/AzBuilder/microsoft-365-agents-toolkit) TypeScript copilot-validation module
> **Date**: 2026-03-03
> **Branch**: `feat/copilot-validation`

---

## Executive Summary

The .NET `Microsoft.Plugins.Manifest` library contains **~95 DA rules** and **~45 Plugin rules** across two validation walkers. The ATK TypeScript port currently implements **~85 DA rules** and **~0 Plugin rules** (plugin validation is done via Rego/WASM). This report catalogs every .NET rule, maps it to the ATK equivalent (or marks the gap), and identifies the rules that must be added.

---

## 1. Declarative Agent (DA) Manifest Rules

### 1.1 Core Manifest Rules (`DaManifestRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 30000 | `name` | Required (non-empty) | Error | ✅ `name-empty` |
| 30001 | `name` | Max 100 chars | Error | ✅ `name-max-length` |
| 30002 | `name` | Pattern `^[a-zA-Z0-9_]*$` | Error | ❌ **MISSING** |
| 30003 | `id` | Required | Error | ⚠️ Not enforced (optional in schema) |
| 30005 | `version` | Valid schema version | Error | ✅ Via schema validation |
| 30006 | `description` | Required (non-empty) | Error | ✅ `description-empty` |
| 30007 | `description` | Max 1000 chars | Error | ✅ `description-max-length` |
| 30010 | `instructions` | Required (non-empty) | Error | ✅ `instructions-inline-empty` |
| 30011 | `instructions` | Max 8000 chars | Error | ✅ `instructions-inline-max-length` |
| 30012 | `conversation_starters` | Required array | Error | ⚠️ Not required in ATK (optional in schema) |
| 30013 | `conversation_starters` | Max 12 items | Error | ✅ `conversation-starters-max` |
| 30015 | `capabilities` | Required array | Error | ⚠️ Not required in ATK (optional in schema) |
| 30016 | `capabilities` | Max items | Error | ❌ **MISSING** — no max cap count |
| 30017 | `actions` | Required array | Error | ⚠️ Not required in ATK (optional in schema) |
| 30018 | `actions` | Max 10 items | Error | ✅ `actions-max` / `agent-actions-max-length` |
| 30019 | Localization keys | Key must exist in localization strings | Error | ❌ **MISSING** |
| 30020 | Localization keys | Key only in localizable properties | Error | ❌ **MISSING** |
| 40000 | `capabilities[].name` | Unique capability names | Error | ✅ `capability-duplicate` (warning) |

### 1.2 Disclaimer Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 50000 | `disclaimer.text` | Required | Error | ✅ `disclaimer-text-required` |
| 50001 | `disclaimer.text` | Max 500 chars | Error | ✅ `disclaimer-text-max-length` |

### 1.3 Worker Agent Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 60000 | `worker_agents` | Cannot contain nested worker agents | Warning | ❌ **MISSING** |
| 60001 | `worker_agents[]` | `id` and `file` mutually exclusive | Error | ❌ **MISSING** |
| 60002 | `worker_agents` | Max 10 items | Error | ✅ `worker-agents-max` |

### 1.4 User Override Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 70000 | `user_overrides[].path` | Valid JSONPath syntax | Error | ❌ **MISSING** |
| 70001 | `user_overrides[].path` | Must target `Capabilities` | Error | ❌ **MISSING** |
| 70002 | `user_overrides[].path` | Path must exist in manifest | Error | ❌ **MISSING** |
| 81000 | `user_overrides[].allowed_actions` | Min 1 item | Error | ❌ **MISSING** |
| 81001 | `user_overrides[].path` | Required | Error | ❌ **MISSING** |
| 81002 | `user_overrides[].allowed_actions[]` | Only `"remove"` allowed | Error | ❌ **MISSING** |

### 1.5 Behavior Overrides Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 82000 | `behavior_overrides.default_response_mode` | Values: `Auto`, `Quick response`, `Think deeper` | Error | ❌ **MISSING** |

### 1.6 Action Rules (`DaActionRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 35000 | `actions[].id` | Required | Error | ✅ Via schema |
| 35001 | `actions[].file` | Required | Error | ✅ Via schema |

### 1.7 Conversation Starter Rules (`DaConversationStarterRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 33000 | `conversation_starters[].title` | Required | Error | ✅ `conversation-starter-title-empty` |
| 33001 | `conversation_starters[].text` | Required | Error | ✅ `conversation-starter-text-required` |
| 33002 | `conversation_starters[].dependsOn` | Unique IDs | Error | ❌ **MISSING** |
| 33100 | `conversation_starters[].dependsOn.name` | Must be `"capabilities"` | Error | ❌ **MISSING** |
| 33101 | `conversation_starters[].dependsOn.id` | Must reference defined capability | Error | ❌ **MISSING** |

### 1.8 Connection Rules (`DaConnectionRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 34000 | `connections[].connection_id` | Required | Error | ✅ `connection-id-empty` |

### 1.9 SharePoint File Rules (`DaFileRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 31000 | `items_by_sharepoint_ids[].site_id` | Required | Error | ✅ `sp-site-id-guid` (GUID check) |
| 31001 | `items_by_sharepoint_ids[].web_id` | Required | Error | ✅ `sp-web-id-guid` |
| 31002 | `items_by_sharepoint_ids[].list_id` | Required | Error | ✅ `sp-list-id-guid` |
| 31003 | `items_by_sharepoint_ids[].unique_id` | Required | Error | ✅ `sp-unique-id-guid` |
| 31004 | `items_by_sharepoint_ids[].file_name` | Required | Error | ❌ **MISSING** |

### 1.10 Site Rules (`DaSiteRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 32000 | `path` | Required | Error | ❌ **MISSING** |
| 32001 | `site_name` | Required | Error | ❌ **MISSING** |

---

## 2. Capability-Specific Rules (`DaCapabilityRules.cs`)

### 2.1 General

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 36000 | `capabilities[].name` | Required | Error | ✅ Via schema |

### 2.2 OneDrive & SharePoint

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 36001 | OneDrive files | Max 5 | Error | ❌ **MISSING** |
| 36002 | SharePoint sites | Max 5 | Error | ❌ **MISSING** |
| 36003 | SharePoint files | Max 5 | Error | ❌ **MISSING** |
| 36004 | SharePoint | Site or file required | Warning | ❌ **MISSING** |
| 36005 | OneDrive | File required | Warning | ❌ **MISSING** |
| 36006 | `items_by_url[].url` | Absolute URL | Error | ❌ **MISSING** — only GUID checks exist |
| 36007 | `items_by_sharepoint_ids[].site_id` | Valid GUID | Error | ✅ `sp-site-id-guid` |
| 36008 | `items_by_sharepoint_ids[].web_id` | Valid GUID | Error | ✅ `sp-web-id-guid` |
| 36009 | `items_by_sharepoint_ids[].list_id` | Valid GUID | Error | ✅ `sp-list-id-guid` |
| 36010 | `items_by_sharepoint_ids[].unique_id` | Valid GUID | Error | ✅ `sp-unique-id-guid` |
| 70000 | `part_id` + `part_type` | Both required together | Error | ❌ **MISSING** |
| 70001 | `part_type` | Only `"OneNotePart"` | Error | ✅ `sp-part-type-value` |

### 2.3 Teams Messages

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 36011 | `urls` | Max 5 | Error | ✅ `teams-urls-max` |
| 36013 | `urls[].url` | Absolute URL | Error | ✅ `teams-url-absolute` |

### 2.4 Dataverse

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 36014 | `knowledge_sources` | At least one required | Error | ❌ **MISSING** — only checks emptiness of host_name |
| 36015 | `knowledge_sources[].tables` | At least one required | Error | ❌ **MISSING** |
| 36016 | `knowledge_sources[].host_name` | Required | Error | ✅ `host-name-empty` |
| 36017 | `knowledge_sources[].skill` | Required | Error | ❌ **MISSING** |
| 36018 | `knowledge_sources[].host_name` | Valid hostname format | Error | ❌ **MISSING** |
| 36019 | `tables[].table_name` | Required | Error | ✅ `table-name-empty` |
| 36020 | `tables[].table_name` | Max 50 chars | Error | ❌ **MISSING** |

### 2.5 Web Search

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 36021 | `sites` | Max 4 | Error | ✅ `websearch-sites-max` |
| 36022 | `sites[].url` | Absolute URL | Error | ✅ `site-url-absolute` |
| 36023 | `sites[].url` | Max 2 path segments, no query params | Error | ✅ `site-url-path-segments` + `site-url-no-query` |

### 2.6 Embedded Knowledge

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 37000 | `files[].file` | Required | Error | ✅ `file-path-empty` |
| 37001 | `files[].file` | Relative path | Error | ✅ `file-path-relative` |
| 37002 | `files[].resource_snapshot_id` | Non-empty string | Error | ❌ **MISSING** |
| 37003 | `files[].file` | Extensions: `.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.pdf` | Error | ✅ `file-extension` |
| 37004 | `files` | Max 10 | Error | ✅ `embedded-knowledge-files-max` |
| 37005 | `files[].file` | Max 1 MB file size | Error | ⚠️ ATK uses 512 MB — **WRONG LIMIT** |
| 37006 | `files[].file` | File must exist | Error | ✅ `file-not-found` |
| 37007 | `files[].file` | File must not be empty | Warning | ✅ `file-empty` |

### 2.7 Email

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 40000 | `shared_mailbox` | Valid email | Error | ✅ `shared-mailbox-email` |
| 40001 | `folders[].folder_id` | Required | Error | ❌ **MISSING** |
| 40002 | `group_mailboxes` | Max 25 | Error | ✅ `group-mailboxes-max` |
| 40003 | `group_mailboxes[]` | Valid email | Error | ✅ `group-mailbox-email` |
| 40004 | `group_mailboxes` | Unique emails | Warning | ✅ `group-mailboxes-no-duplicates` |

### 2.8 Graph Connectors

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 60000 | `additional_search_terms` | Valid KQL syntax | Error | ✅ `kql-query-invalid` |
| 60001 | `items_by_external_url[].url` | Absolute URL | Error | ✅ `container-url-absolute` |
| 60002 | `connections[].connection_id` | Unique | Error | ❌ **MISSING** |

### 2.9 Scenario Models

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 80000 | `models[].id` | Required | Error | ✅ `scenario-model-id-empty` |
| 80001 | `models` | Max 1 model with `TC` prefix | Error | ❌ **MISSING** |
| 80002 | `models[].id` | Unique | Error | ❌ **MISSING** |
| 80003 | `models` | At least one model | Error | ✅ `scenario-models-required` |

### 2.10 Meetings

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 81000 | `items_by_id` | Max 5 | Error | ❌ **MISSING** — no Meetings validator |
| 81001 | `items_by_id[].id` | Required | Error | ❌ **MISSING** |
| 81002 | `items_by_id[].is_series` | Required boolean | Error | ❌ **MISSING** |

### 2.11 Editorial Answers

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 38001 | `url` | Absolute URL | Error | ❌ **MISSING** — no editorial answers validator |
| 38002 | `answers` | Max 300 | Error | ❌ **MISSING** |
| 38003 | `answers[].question` | Required | Error | ❌ **MISSING** |
| 38004 | `answers[].answer_text` | Required | Error | ❌ **MISSING** |
| 38005 | `url` / `answers` | Exactly one required (mutually exclusive) | Error | ❌ **MISSING** |
| 38006 | `similarity_threshold_min` | Range 0.0–10.0 | Error | ❌ **MISSING** |
| 38007 | `similarity_threshold_max` | Range 0.0–10.0 | Error | ❌ **MISSING** |

---

## 3. Plugin Manifest Rules

### 3.1 Core Plugin Rules (`PluginManifestRules.cs`)

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 21456 | `schema_version` | Supported version | Error | ✅ Via Rego/WASM |
| 21674 | `schema_version` | Required | Error | ✅ Via Rego/WASM |
| 21675 | `name_for_human` | Required | Error | ✅ `name-for-human-empty` |
| 21459 | `name_for_human` | Max 20 chars | Error | ⚠️ ATK uses 2048 — **WRONG LIMIT** |
| 21676 | `description_for_human` | Required | Error | ✅ `description-for-human-empty` |
| 21633 | `description_for_human` | Max 100 chars | Error | ✅ `description-for-human-max-length` |
| 21678 | `description_for_model` | Required (Store ruleset) | Error | ✅ `description-for-model-empty` |
| 21634 | `description_for_model` | Max 2048 chars | Error | ✅ `description-for-model-max-length` |
| 21677 | `logo_url` | Required (Store ruleset) | Error | ❌ **MISSING** |
| 21460 | `logo_url` | Absolute URL | Error | ❌ **MISSING** |
| 21679 | `contact_email` | Required (Store ruleset) | Error | ❌ **MISSING** |
| 21673 | `contact_email` | Valid email | Error | ❌ **MISSING** |
| 21680 | `legal_info_url` | Required (Store ruleset) | Error | ❌ **MISSING** |
| 41000 | `legal_info_url` | Absolute URL | Error | ❌ **MISSING** |
| 21681 | `privacy_policy_url` | Required (Store ruleset) | Error | ❌ **MISSING** |
| 41001 | `privacy_policy_url` | Absolute URL | Error | ❌ **MISSING** |
| 41002 | `namespace` | Pattern `^[A-Za-z0-9-]+$` | Error | ❌ **MISSING** |
| 41003 | `namespace` + `function.name` | Combined max 64 chars | Error | ❌ **MISSING** |
| 21457 | `functions[].name` | Unique names | Error | ❌ **MISSING** |
| 21458 | `functions[].name` | Pattern `^[a-zA-Z0-9_-]*$` | Error | ❌ **MISSING** |

### 3.2 Function Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 21681 | `functions[].name` | Required | Error | ✅ `function-name-empty` |
| 21683 | `functions[].description` | Required | Error | ✅ `function-description-required` |
| 21587 | `functions[].description` | Max 1024 chars | Error | ❌ **MISSING** |
| 21586 | `functions[].parameters.type` | Must be `"object"` | Error | ❌ **MISSING** |
| 21588 | `functions[].returns.type` | Must be `"string"` | Error | ❌ **MISSING** |
| 21687 | `parameters.properties[].type` | Allowed: `string,array,boolean,integer,number` | Error | ❌ **MISSING** |
| 21693 | `parameters.properties[].items` | Only when type=`array` | Error | ❌ **MISSING** |
| 21692 | `confirmation.type` | Only `"AdaptiveCard"` | Error | ❌ **MISSING** |
| 21695 | `response_semantics.data_path` | Required | Error | ❌ **MISSING** |
| 21706 | `security_info.data_handling[]` | Allowed: `GetPublicData,GetPrivateData,DataTransform,ResourceStateUpdate,DataExport` | Error | ❌ **MISSING** |
| 40000 | `functions[].name` | Must match OpenAPI operationId | Error | ❌ **MISSING** |

### 3.3 Runtime Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| 21695 | `auth.reference_id` | Required for OAuthPluginVault | Error | ❌ **MISSING** |
| 21696 | `auth.reference_id` | Required for ApiKeyPluginVault | Error | ❌ **MISSING** |
| 21704 | `spec.url` / `spec.api_description` | At least one required | Error | ❌ **MISSING** |
| 30103 | `spec.api_description` | Valid OpenAPI JSON/YAML | Error | ❌ **MISSING** |
| 60000 | MCP runtime `run_for_functions` | Min 1 item | Error | ❌ **MISSING** |
| 60001 | Runtime URL | Absolute URL | Error | ❌ **MISSING** |
| 60004 | `enable_dynamic_discovery` | Deprecated property | Warning | ❌ **MISSING** |

### 3.4 OpenAPI Rules

| .NET Rule ID | Field | Constraint | Severity | ATK Status |
|---|---|---|---|---|
| — | `server.url` | Must use HTTPS | Error | ❌ **MISSING** |
| — | OAuth2 | Only Authorization Code flow | Error | ❌ **MISSING** |
| — | ApiKey | Only http+bearer supported | Error | ❌ **MISSING** |
| — | Operations | Max 1 security scheme per operation | Error | ❌ **MISSING** |
| — | Request body | Supported media types only | Error | ❌ **MISSING** |
| — | Query params | No nested objects | Error | ❌ **MISSING** |
| — | Request body | No nested objects | Error | ❌ **MISSING** |

---

## 4. JSON Document Base Rules

| .NET Rule ID | Description | Severity | ATK Status |
|---|---|---|---|
| 10000 | Invalid JSON syntax | Error | ✅ Via JSON parser |
| 10001 | Invalid JSON semantics | Error | ✅ Via schema validation |
| 10002 | Unrecognized member | Warning | ✅ Via schema `propertyNames` |
| 10003 | Document exceeds 100KB | Error | ❌ **MISSING** |
| 10004 | Task canceled | Error | N/A |
| 10005 | Duplicate JSON key | Error | ❌ **MISSING** |
| 10006 | Document processing error | Error | ✅ Via error handling |

---

## 5. ATK-Only Rules (Not in .NET)

These rules exist in ATK but have no .NET equivalent — they are ATK value-adds:

| Rule ID | Field | Constraint | Severity | Notes |
|---|---|---|---|---|
| instructions-weak-language | instructions | Detect weak language (try to, consider, etc.) | Warning | Style check |
| instructions-ambiguity | instructions | Detect vague quantifiers (a few, some, etc.) | Warning | Style check |
| instructions-missing-persona | instructions | Include "You are..." definition | Info | Best practice |
| instructions-missing-capability | instructions | Reference all capabilities | Info | Best practice |
| instructions-redundancy | instructions | Duplicate sentences | Info | Quality check |
| instructions-contradiction | instructions | Conflicting directives (LLM) | Warning | LLM-powered |
| instructions-persona-inconsistency | instructions | Inconsistent personality (LLM) | Warning | LLM-powered |
| instructions-cognitive-load | instructions | Nested conditions (LLM) | Warning | LLM-powered |
| instructions-coverage-gap | instructions | Unhandled scenarios (LLM) | Warning | LLM-powered |
| instructions-safety | instructions | Missing guardrails (LLM) | Warning | LLM-powered |
| instructions-file-path-security | instructions | No `../` traversal | Error | Security |
| instructions-file-extension | instructions | Only `.md` or `.txt` | Error | Format check |
| worker-agent-id-prefixed-guid | worker_agents[].id | GUID with `T_/U_/P_` prefix | Error | ATK-specific |
| connected-agent-* | connected_agents | Connected agents validation | Error | ATK-specific |
| card-* | cards | Adaptive card validation | Error | ATK-specific |

---

## 6. Gap Summary

### Critical Gaps (Error severity in .NET, completely missing in ATK)

| Priority | Area | Missing Rules | Count |
|---|---|---|---|
| 🔴 High | **Meetings capability** | All rules (81000–81002) — no validator exists | 3 |
| 🔴 High | **Editorial Answers** | All rules (38001–38007) — no validator exists | 7 |
| 🔴 High | **User Overrides** | All rules (70000–70002, 81000–81002) — no validator exists | 6 |
| 🔴 High | **Behavior Overrides** | Response mode validation (82000) | 1 |
| 🔴 High | **Plugin functions** | Parameter/return type, description length, operationId match, security_info | 11 |
| 🔴 High | **Plugin runtimes** | Auth reference_id, URL/apiDescription, MCP, OpenAPI rules | 7+ |
| 🟡 Medium | **Localization** | Key existence + non-localizable property checks (30019, 30020) | 2 |
| 🟡 Medium | **OneDrive/SharePoint** | Max files/sites (36001–36005), items_by_url URL check (36006), file_name (31004) | 7 |
| 🟡 Medium | **Dataverse** | knowledge_sources required, tables required, skill required, hostname valid, table_name max | 5 |
| 🟡 Medium | **Graph Connectors** | Unique connection_id (60002) | 1 |
| 🟡 Medium | **Scenario Models** | TC prefix max, unique IDs (80001, 80002) | 2 |
| 🟡 Medium | **Worker Agents** | No nested workers, id/file mutual exclusion (60000, 60001) | 2 |
| 🟡 Medium | **Conversation Starters** | dependsOn rules (33002, 33100, 33101) | 3 |
| 🟢 Low | **Name pattern** | Invalid characters check (30002) | 1 |
| 🟢 Low | **Email folders** | folder_id required (40001) | 1 |
| 🟢 Low | **Embedded Knowledge** | resource_snapshot_id (37002), file size limit is WRONG (512MB vs 1MB) | 2 |
| 🟢 Low | **Plugin store fields** | logo_url, contact_email, legal_info_url, privacy_policy_url | 8 |
| 🟢 Low | **Document-level** | 100KB size limit, duplicate key detection | 2 |

### Wrong Limits in ATK

| Field | ATK Value | .NET Value | Fix |
|---|---|---|---|
| `name_for_human` max length | 2048 | **20** | Reduce to 20 |
| Embedded knowledge file size | 512 MB | **1 MB** | Reduce to 1 MB |

### **Total Missing: ~62 rules**

---

## 7. Recommended Implementation Order

1. **Fix wrong limits** — `name_for_human` (20 chars) and embedded knowledge file size (1 MB)
2. **Add Meetings capability validator** — new file, 3 rules
3. **Add Editorial Answers validator** — new file, 7 rules
4. **Add User Overrides validator** — new file, 6 rules
5. **Add missing OneDrive/SharePoint rules** — extend existing validator, 7 rules
6. **Add missing Dataverse rules** — extend existing validator, 5 rules
7. **Add Worker Agent structural rules** — extend agent validator, 2 rules
8. **Add Conversation Starter dependsOn rules** — extend agent validator, 3 rules
9. **Add Behavior Overrides validation** — extend agent validator, 1 rule
10. **Add Plugin function/runtime deep validation** — major work, 18+ rules
11. **Add localization validation** — 2 rules
12. **Add document-level rules** — 2 rules

---

## Appendix A: .NET Rule Sets

### Authoring Rule Set (default)
Core rules applied during manifest authoring — excludes store-only requirements like `description_for_model` required.

### Store Rule Set
Extends authoring with additional requirements for publishing: `description_for_model`, `logo_url`, `contact_email`, `legal_info_url`, `privacy_policy_url` all become required.

### Orchestrator Rule Set
Same as Store rule set — used for runtime orchestrator validation.

## Appendix B: Constants Reference

| Constant | Value |
|---|---|
| Name max length | 100 |
| Description max length | 1000 |
| Instructions max length | 8000 |
| Disclaimer max length | 500 |
| Conversation starters max | 12 |
| Actions max | 10 |
| Worker agents max | 10 |
| Web search sites max | 4 |
| Teams URLs max | 5 |
| OneDrive files max | 5 |
| SharePoint sites max | 5 |
| SharePoint files max | 5 |
| Embedded knowledge files max | 10 |
| Embedded knowledge max file size | 1 MB |
| Email group mailboxes max | 25 |
| Meeting IDs max | 5 |
| Editorial answers max | 300 |
| Similarity threshold range | 0.0–10.0 |
| Dataverse table_name max | 50 |
| Plugin name_for_human max | 20 |
| Plugin description_for_human max | 100 |
| Plugin description_for_model max | 2048 |
| Plugin function description max | 1024 |
| Plugin namespace+function name max | 64 |
| Plugin namespace pattern | `^[A-Za-z0-9-]+$` |
| Plugin function name pattern | `^[a-zA-Z0-9_-]*$` |
| DA name pattern | `^[a-zA-Z0-9_]*$` |
| Embedded knowledge extensions | `.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.pdf` |
| User override allowed actions | `["remove"]` |
| Behavior overrides response modes | `["Auto","Quick response","Think deeper"]` |
| SP part type allowed values | `["OneNotePart"]` |
| Confirmation type allowed values | `["AdaptiveCard"]` |
| Security info data_handling values | `["GetPublicData","GetPrivateData","DataTransform","ResourceStateUpdate","DataExport"]` |
| Scenario models TC prefix max | 1 |
