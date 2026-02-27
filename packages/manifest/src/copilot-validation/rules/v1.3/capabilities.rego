# Declarative Agent v1.3 capabilities validation
# Inherits from v1.2 with additions
package m365.v1_3.capabilities

import rego.v1
import data.m365.v1_2.capabilities as base
import data.m365.common.formats

# Inherit all v1.2 capability rules
deny contains result if {
  some result in base.deny
}

# ===========================================
# NEW IN v1.3: EMAIL CAPABILITY
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "Email"
  cap.shared_mailbox
  not formats.is_valid_email(cap.shared_mailbox)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "capabilities[Email].shared_mailbox",
    "message": "Invalid email format for shared mailbox"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Email"
  cap.group_mailboxes
  count(cap.group_mailboxes) > 15
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[Email].group_mailboxes",
    "message": "Too many group mailboxes (maximum 15)"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Email"
  some i
  email := cap.group_mailboxes[i]
  not formats.is_valid_email(email)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[Email].group_mailboxes[%d]", [i]),
    "message": "Invalid email format"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "Email"
  cap.group_mailboxes
  emails := cap.group_mailboxes
  some i, j
  i < j
  lower(emails[i]) == lower(emails[j])
  result := {
    "code": "M365-006",
    "severity": "warning",
    "path": "capabilities[Email].group_mailboxes",
    "message": sprintf("Duplicate email address: %s", [emails[i]])
  }
}

# ===========================================
# NEW IN v1.3: URL PATH SEGMENTS CHECK
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "WebSearch"
  some i
  site := cap.sites[i]
  site.url
  formats.count_url_path_segments(site.url) > 2
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[WebSearch].sites[%d].url", [i]),
    "message": sprintf("URL has too many path segments (maximum 2, found %d)", [formats.count_url_path_segments(site.url)])
  }
}
