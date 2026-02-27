# Declarative Agent v1.4 validation rules
# Inherits from v1.3 with additions
package m365.v1_4.agent

import rego.v1
import data.m365.v1_3.agent as base
import data.m365.common.formats

# Inherit all v1.3 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.4
is_overridden(result) if {
  result.message == "Instructions exceed maximum length of 6000 characters"
}

is_overridden(result) if {
  result.message == "Too many actions (maximum 8)"
}

# ===========================================
# OVERRIDES FROM v1.3
# ===========================================

# v1.4 increases instructions to 8000 characters
deny contains result if {
  input.instructions
  count(input.instructions) > 8000
  not formats.is_file_reference(input.instructions)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "instructions",
    "message": "Instructions exceed maximum length of 8000 characters"
  }
}

# v1.4 increases actions to 10
deny contains result if {
  input.actions
  count(input.actions) > 10
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "actions",
    "message": "Too many actions (maximum 10)"
  }
}

# ===========================================
# NEW IN v1.4: UNC PATH CHECK
# ===========================================

deny contains result if {
  input.instructions
  formats.is_file_reference(input.instructions)
  formats.is_valid_file_reference_syntax(input.instructions)
  file_path := formats.extract_file_reference_path(input.instructions)
  startswith(file_path, "\\\\")
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "instructions",
    "message": "File path must not be a UNC path"
  }
}

# ===========================================
# NEW IN v1.4: FILE EXTENSION CHECK
# ===========================================

deny contains result if {
  input.instructions
  formats.is_file_reference(input.instructions)
  formats.is_valid_file_reference_syntax(input.instructions)
  file_path := formats.extract_file_reference_path(input.instructions)
  formats.is_secure_file_path(file_path)
  not formats.is_allowed_extension(file_path, ["md", "txt"])
  result := {
    "code": "M365-008",
    "severity": "error",
    "path": "instructions",
    "message": "Invalid file extension. Allowed: md, txt"
  }
}
