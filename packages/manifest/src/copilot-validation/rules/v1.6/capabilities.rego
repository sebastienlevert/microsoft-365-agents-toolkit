# Declarative Agent v1.6 capabilities validation
# Inherits from v1.5 with additions
package m365.v1_6.capabilities

import rego.v1
import data.m365.v1_5.capabilities as base
import data.m365.common.formats

# Inherit all v1.5 capability rules
deny contains result if {
  some result in base.deny
}

# ===========================================
# NEW IN v1.6: SCENARIO MODELS CAPABILITY
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  not cap.models
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[ScenarioModels].models",
    "message": "Models array is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  cap.models
  count(cap.models) == 0
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[ScenarioModels].models",
    "message": "At least one model is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  some i
  model := cap.models[i]
  not model.id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[ScenarioModels].models[%d].id", [i]),
    "message": "Model ID is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  some i
  model := cap.models[i]
  model.id
  not formats.is_not_empty(model.id)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[ScenarioModels].models[%d].id", [i]),
    "message": "Model ID must contain non-whitespace characters"
  }
}

# Scenario Models: Max 1 model with TC prefix (80001)
deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  cap.models
  tc_models := [m | some m in cap.models; m.id; startswith(m.id, "TC")]
  count(tc_models) > 1
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[ScenarioModels].models",
    "message": sprintf("At most 1 model with 'TC' prefix is allowed (found: %d)", [count(tc_models)])
  }
}

# Scenario Models: Unique model IDs (80002)
deny contains result if {
  some cap in input.capabilities
  cap.name == "ScenarioModels"
  cap.models
  some i, j
  i < j
  cap.models[i].id == cap.models[j].id
  result := {
    "code": "M365-006",
    "severity": "warning",
    "path": "capabilities[ScenarioModels].models",
    "message": sprintf("Duplicate model ID: '%s'", [cap.models[i].id])
  }
}

# ===========================================
# NEW IN v1.6: ONEDRIVE/SHAREPOINT GAPS
# ===========================================

# Max 5 items_by_sharepoint_ids (36003)
deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  cap.items_by_sharepoint_ids
  count(cap.items_by_sharepoint_ids) > 5
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids",
    "message": "Too many SharePoint files (maximum 5)"
  }
}

# Max 5 items_by_url (36001)
deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  cap.items_by_url
  count(cap.items_by_url) > 5
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[OneDriveAndSharePoint].items_by_url",
    "message": "Too many OneDrive files (maximum 5)"
  }
}

# items_by_url URL must be absolute (36006)
deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_url[i]
  item.url
  not formats.is_absolute_http_url(item.url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_url[%d].url", [i]),
    "message": "URL must be absolute HTTP/HTTPS"
  }
}

# file_name is required in items_by_sharepoint_ids (31004)
deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  not item.file_name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].file_name", [i]),
    "message": "file_name is required"
  }
}

# part_id and part_type must both be present together (70000)
deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.part_id
  not item.part_type
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d]", [i]),
    "message": "part_id and part_type must both be specified together"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.part_type
  not item.part_id
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d]", [i]),
    "message": "part_id and part_type must both be specified together"
  }
}

# Warn if OneDrive/SharePoint has neither files nor sites (36004, 36005)
deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  not cap.items_by_sharepoint_ids
  not cap.items_by_url
  result := {
    "code": "M365-001",
    "severity": "warning",
    "path": "capabilities[OneDriveAndSharePoint]",
    "message": "OneDriveAndSharePoint should have files or sites configured"
  }
}

# ===========================================
# NEW IN v1.6: DATAVERSE GAPS
# ===========================================

# knowledge_sources is required with at least one entry (36014)
deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  not cap.knowledge_sources
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[Dataverse].knowledge_sources",
    "message": "Dataverse requires at least one knowledge source"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  cap.knowledge_sources
  count(cap.knowledge_sources) == 0
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[Dataverse].knowledge_sources",
    "message": "Dataverse requires at least one knowledge source"
  }
}

# tables is required with at least one entry (36015)
deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i
  ks := cap.knowledge_sources[i]
  not ks.tables
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].tables", [i]),
    "message": "Dataverse knowledge source requires at least one table"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i
  ks := cap.knowledge_sources[i]
  ks.tables
  count(ks.tables) == 0
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].tables", [i]),
    "message": "Dataverse knowledge source requires at least one table"
  }
}

# skill is required (36017)
deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i
  ks := cap.knowledge_sources[i]
  not ks.skill
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].skill", [i]),
    "message": "Dataverse knowledge source 'skill' is required"
  }
}

# host_name must be valid hostname format (36018)
deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i
  ks := cap.knowledge_sources[i]
  ks.host_name
  formats.is_not_empty(ks.host_name)
  not formats.is_valid_hostname(ks.host_name)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].host_name", [i]),
    "message": "host_name is not a valid hostname format"
  }
}

# table_name max 50 characters (36020)
deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i, j
  table := cap.knowledge_sources[i].tables[j]
  table.table_name
  count(table.table_name) > 50
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].tables[%d].table_name", [i, j]),
    "message": "table_name exceeds maximum length of 50 characters"
  }
}

# ===========================================
# NEW IN v1.6: GRAPH CONNECTORS — UNIQUE CONNECTION_ID (60002)
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "GraphConnectors"
  cap.connections
  some i, j
  i < j
  cap.connections[i].connection_id == cap.connections[j].connection_id
  result := {
    "code": "M365-006",
    "severity": "warning",
    "path": "capabilities[GraphConnectors].connections",
    "message": sprintf("Duplicate connection_id: '%s'", [cap.connections[i].connection_id])
  }
}

# ===========================================
# NEW IN v1.6: EMAIL — FOLDER_ID REQUIRED (40001)
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "Email"
  some i
  folder := cap.folders[i]
  not folder.folder_id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Email].folders[%d].folder_id", [i]),
    "message": "folder_id is required"
  }
}

# ===========================================
# NEW IN v1.6: EMBEDDED KNOWLEDGE — RESOURCE_SNAPSHOT_ID (37002)
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  some i
  file := cap.files[i]
  file.resource_snapshot_id
  not formats.is_not_empty(file.resource_snapshot_id)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[EmbeddedKnowledge].files[%d].resource_snapshot_id", [i]),
    "message": "resource_snapshot_id must contain non-whitespace characters"
  }
}

# ===========================================
# NEW IN v1.6: MEETINGS CAPABILITY (81000-81002)
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "Meetings"
  cap.items_by_id
  count(cap.items_by_id) > 5
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[Meetings].items_by_id",
    "message": "Too many meeting items (maximum 5)"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Meetings"
  some i
  item := cap.items_by_id[i]
  not item.id
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Meetings].items_by_id[%d].id", [i]),
    "message": "Meeting item 'id' is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Meetings"
  some i
  item := cap.items_by_id[i]
  item.is_series == null
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Meetings].items_by_id[%d].is_series", [i]),
    "message": "Meeting item 'is_series' is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Meetings"
  some i
  item := cap.items_by_id[i]
  not item.is_series == true
  not item.is_series == false
  not item.is_series == null
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Meetings].items_by_id[%d].is_series", [i]),
    "message": "Meeting item 'is_series' is required"
  }
}

# ===========================================
# NEW IN v1.6: EDITORIAL ANSWERS CAPABILITY (38001-38007)
# ===========================================

# url and answers are mutually exclusive (38005)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.url
  cap.answers
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[EditorialAnswers]",
    "message": "'url' and 'answers' are mutually exclusive — provide one or the other"
  }
}

# At least url or answers must be present (38005)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  not cap.url
  not cap.answers
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[EditorialAnswers]",
    "message": "EditorialAnswers requires either 'url' or 'answers'"
  }
}

# url must be absolute (38001)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.url
  not formats.is_absolute_http_url(cap.url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[EditorialAnswers].url",
    "message": "URL must be absolute HTTP/HTTPS"
  }
}

# Max 300 answers (38002)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.answers
  count(cap.answers) > 300
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[EditorialAnswers].answers",
    "message": "Too many answers (maximum 300)"
  }
}

# question is required in each answer (38003)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  some i
  answer := cap.answers[i]
  not answer.question
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[EditorialAnswers].answers[%d].question", [i]),
    "message": "Answer 'question' is required"
  }
}

# answer_text is required in each answer (38004)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  some i
  answer := cap.answers[i]
  not answer.answer_text
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[EditorialAnswers].answers[%d].answer_text", [i]),
    "message": "Answer 'answer_text' is required"
  }
}

# similarity_threshold_min must be 0.0–10.0 (38006)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.similarity_threshold_min
  cap.similarity_threshold_min < 0
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[EditorialAnswers].similarity_threshold_min",
    "message": "similarity_threshold_min must be between 0.0 and 10.0"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.similarity_threshold_min
  cap.similarity_threshold_min > 10
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[EditorialAnswers].similarity_threshold_min",
    "message": "similarity_threshold_min must be between 0.0 and 10.0"
  }
}

# similarity_threshold_max must be 0.0–10.0 (38007)
deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.similarity_threshold_max
  cap.similarity_threshold_max < 0
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[EditorialAnswers].similarity_threshold_max",
    "message": "similarity_threshold_max must be between 0.0 and 10.0"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EditorialAnswers"
  cap.similarity_threshold_max
  cap.similarity_threshold_max > 10
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[EditorialAnswers].similarity_threshold_max",
    "message": "similarity_threshold_max must be between 0.0 and 10.0"
  }
}
