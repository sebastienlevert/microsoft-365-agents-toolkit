# Declarative Agent v1.4 capabilities validation
# Inherits from v1.3 with additions
package m365.v1_4.capabilities

import rego.v1
import data.m365.v1_3.capabilities as base
import data.m365.common.formats

# Inherit all v1.3 capability rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.4
is_overridden(result) if {
  result.message == "Too many sites (maximum 3)"
}

is_overridden(result) if {
  result.message == "Too many group mailboxes (maximum 15)"
}

# ===========================================
# OVERRIDES FROM v1.3
# ===========================================

# v1.4 increases WebSearch sites to 4
deny contains result if {
  some cap in input.capabilities
  cap.name == "WebSearch"
  cap.sites
  count(cap.sites) > 4
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[WebSearch].sites",
    "message": "Too many sites (maximum 4)"
  }
}

# v1.4 increases group mailboxes to 25
deny contains result if {
  some cap in input.capabilities
  cap.name == "Email"
  cap.group_mailboxes
  count(cap.group_mailboxes) > 25
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[Email].group_mailboxes",
    "message": "Too many group mailboxes (maximum 25)"
  }
}

# ===========================================
# NEW IN v1.4: ONEDRIVE PART TYPE/ID
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.part_type
  item.part_type != "OneNotePart"
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].part_type", [i]),
    "message": "part_type must be \"OneNotePart\""
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.part_id
  count(item.part_id) > 256
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].part_id", [i]),
    "message": "part_id exceeds maximum length of 256 characters"
  }
}

# ===========================================
# NEW IN v1.4: TEAMS MESSAGES CAPABILITY
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "TeamsMessages"
  cap.urls
  count(cap.urls) > 5
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[TeamsMessages].urls",
    "message": "Too many URLs (maximum 5)"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "TeamsMessages"
  some i
  url_item := cap.urls[i]
  url_item.url
  not formats.is_absolute_http_url(url_item.url)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[TeamsMessages].urls[%d].url", [i]),
    "message": "URL must be absolute HTTP/HTTPS"
  }
}

# ===========================================
# NEW IN v1.4: DATAVERSE CAPABILITY
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i
  ks := cap.knowledge_sources[i]
  not ks.host_name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].host_name", [i]),
    "message": "Hostname is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i
  ks := cap.knowledge_sources[i]
  ks.host_name
  not formats.is_not_empty(ks.host_name)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].host_name", [i]),
    "message": "Hostname must contain non-whitespace characters"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i, j
  ks := cap.knowledge_sources[i]
  table := ks.tables[j]
  not table.table_name
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].tables[%d].table_name", [i, j]),
    "message": "Table name is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Dataverse"
  some i, j
  ks := cap.knowledge_sources[i]
  table := ks.tables[j]
  table.table_name
  not formats.is_not_empty(table.table_name)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": sprintf("capabilities[Dataverse].knowledge_sources[%d].tables[%d].table_name", [i, j]),
    "message": "Table name must contain non-whitespace characters"
  }
}
