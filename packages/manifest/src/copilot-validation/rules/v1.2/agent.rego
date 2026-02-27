# Declarative Agent v1.2 validation rules
# Inherits from v1.0 with additions
package m365.v1_2.agent

import rego.v1
import data.m365.v1_0.agent as base
import data.m365.common.formats

# Inherit all v1.0 rules except overridden ones
deny contains result if {
  some result in base.deny
  not is_overridden(result)
}

# Rules overridden in v1.2
is_overridden(result) if {
  result.message == "Instructions exceed maximum length of 4000 characters"
}

is_overridden(result) if {
  result.message == "Too many conversation starters (maximum 4)"
}

# ===========================================
# OVERRIDES FROM v1.0
# ===========================================

# v1.2 increases instructions to 6000 characters
deny contains result if {
  input.instructions
  count(input.instructions) > 6000
  not formats.is_file_reference(input.instructions)
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "instructions",
    "message": "Instructions exceed maximum length of 6000 characters"
  }
}

# v1.2 increases conversation starters to 5
deny contains result if {
  input.conversation_starters
  count(input.conversation_starters) > 5
  result := {
    "code": "M365-003",
    "severity": "error",
    "path": "conversation_starters",
    "message": "Too many conversation starters (maximum 5)"
  }
}

# ===========================================
# NEW IN v1.2: FILE REFERENCE INSTRUCTIONS
# ===========================================

deny contains result if {
  input.instructions
  formats.is_file_reference(input.instructions)
  not formats.is_valid_file_reference_syntax(input.instructions)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "instructions",
    "message": "Invalid file reference syntax. Use $[file('path/to/file.md')]"
  }
}

deny contains result if {
  input.instructions
  formats.is_file_reference(input.instructions)
  formats.is_valid_file_reference_syntax(input.instructions)
  file_path := formats.extract_file_reference_path(input.instructions)
  contains(file_path, "..")
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "instructions",
    "message": "File path must not contain path traversal (..)"
  }
}

deny contains result if {
  input.instructions
  formats.is_file_reference(input.instructions)
  formats.is_valid_file_reference_syntax(input.instructions)
  file_path := formats.extract_file_reference_path(input.instructions)
  startswith(file_path, "/")
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "instructions",
    "message": "File path must be relative, not absolute"
  }
}

deny contains result if {
  input.instructions
  formats.is_file_reference(input.instructions)
  formats.is_valid_file_reference_syntax(input.instructions)
  file_path := formats.extract_file_reference_path(input.instructions)
  formats.is_windows_absolute_path(file_path)
  result := {
    "code": "M365-002",
    "severity": "error",
    "path": "instructions",
    "message": "File path must be relative, not an absolute Windows path"
  }
}
