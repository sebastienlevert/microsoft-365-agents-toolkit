# Declarative Agent v1.5 capabilities validation
# Inherits from v1.4 with additions
package m365.v1_5.capabilities

import rego.v1
import data.m365.v1_4.capabilities as base
import data.m365.common.formats

# Inherit all v1.4 capability rules
deny contains result if {
  some result in base.deny
}

# ===========================================
# EMBEDDED KNOWLEDGE CAPABILITY
# ===========================================

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  not cap.files
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": "capabilities[EmbeddedKnowledge].files",
    "message": "Files array is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  cap.files
  count(cap.files) == 0
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[EmbeddedKnowledge].files",
    "message": "Files array must have at least 1 file"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  cap.files
  count(cap.files) > 10
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "capabilities[EmbeddedKnowledge].files",
    "message": "Too many files (maximum 10)"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  some i
  file := cap.files[i]
  not file.file
  result := {
    "code": "M365-001",
    "severity": "error",
    "path": sprintf("capabilities[EmbeddedKnowledge].files[%d].file", [i]),
    "message": "File path is required"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  some i
  file := cap.files[i]
  file.file
  not formats.is_relative_path(file.file)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": sprintf("capabilities[EmbeddedKnowledge].files[%d].file", [i]),
    "message": "File path must be relative (no leading / or ../ traversal)"
  }
}

deny contains result if {
  some cap in input.capabilities
  cap.name == "EmbeddedKnowledge"
  some i
  file := cap.files[i]
  file.file
  allowed := ["doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "pdf"]
  not formats.is_allowed_extension(file.file, allowed)
  result := {
    "code": "M365-008",
    "severity": "error",
    "path": sprintf("capabilities[EmbeddedKnowledge].files[%d].file", [i]),
    "message": "Invalid file extension (allowed: doc, docx, ppt, pptx, xls, xlsx, txt, pdf)"
  }
}
