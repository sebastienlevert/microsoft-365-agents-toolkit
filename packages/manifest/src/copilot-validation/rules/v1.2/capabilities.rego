# Declarative Agent v1.2 capabilities validation
# Inherits from v1.0 with additions
package m365.v1_2.capabilities

import rego.v1
import data.m365.v1_0.capabilities as base
import data.m365.common.formats

# Inherit all v1.0 capability rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.2
is_overridden(result) if {
  result.message == "Too many sites (maximum 2)"
}

# ===========================================
# OVERRIDES FROM v1.0
# ===========================================

# v1.2 increases WebSearch sites to 3
deny contains result if {
  some cap in input.capabilities
  cap.name == "WebSearch"
  cap.sites
  count(cap.sites) > 3
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[WebSearch].sites",
    "message": "Too many sites (maximum 3)"
  }
}

# ===========================================
# NEW IN v1.2: ONEDRIVE AND SHAREPOINT
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.site_id
  not formats.is_valid_guid(item.site_id)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].site_id", [i]),
    "message": "Invalid GUID format for site_id"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.web_id
  not formats.is_valid_guid(item.web_id)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].web_id", [i]),
    "message": "Invalid GUID format for web_id"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.list_id
  not formats.is_valid_guid(item.list_id)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].list_id", [i]),
    "message": "Invalid GUID format for list_id"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "OneDriveAndSharePoint"
  some i
  item := cap.items_by_sharepoint_ids[i]
  item.unique_id
  not formats.is_valid_guid(item.unique_id)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[OneDriveAndSharePoint].items_by_sharepoint_ids[%d].unique_id", [i]),
    "message": "Invalid GUID format for unique_id"
  }
}
