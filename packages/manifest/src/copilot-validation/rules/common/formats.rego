# Common format validation helpers
package m365.common.formats

import rego.v1

# Check if string is valid email format (including IP address domains)
is_valid_email(email) if {
  regex.match(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`, email)
}

is_valid_email(email) if {
  # Email with IP address domain (e.g., user@123.123.123.123)
  regex.match(`^[a-zA-Z0-9._%+-]+@[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$`, email)
}

# Check if string is valid GUID format (with or without braces)
is_valid_guid(guid) if {
  # Without braces
  regex.match(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`, guid)
}

is_valid_guid(guid) if {
  # With braces
  regex.match(`^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$`, guid)
}

# Check if string is valid GUID format with optional T_, U_, or P_ prefix
is_valid_prefixed_guid(guid) if {
  is_valid_guid(guid)
}

is_valid_prefixed_guid(guid) if {
  regex.match(`^[TUP]_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`, guid)
}

is_valid_prefixed_guid(guid) if {
  regex.match(`^[TUP]_\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$`, guid)
}

# Check if string is non-empty (has at least one non-whitespace character)
is_not_empty(s) if {
  trimmed := trim_space(s)
  count(trimmed) > 0
}

# Check if URL is absolute HTTP/HTTPS
is_absolute_http_url(url) if {
  startswith(url, "http://")
}

is_absolute_http_url(url) if {
  startswith(url, "https://")
}

# Count URL path segments
count_url_path_segments(url) := count(segments) if {
  # Remove protocol by splitting on ://
  parts_after_protocol := split(url, "://")
  count(parts_after_protocol) >= 2
  without_protocol := parts_after_protocol[1]
  # Split by / to get host and path parts
  all_parts := split(without_protocol, "/")
  # Get path parts (skip host at index 0, filter empty)
  path_parts := array.slice(all_parts, 1, count(all_parts))
  segments := [s | s := path_parts[_]; s != ""]
}

# Check if URL has query parameters
has_query_params(url) if {
  contains(url, "?")
}

# Check if path is relative (not absolute, no traversal, not Windows absolute)
is_relative_path(path) if {
  not startswith(path, "/")
  not startswith(path, "\\")
  not contains(path, "..")
  not startswith(path, "//")  # UNC paths
  not is_windows_absolute_path(path)
}

# Check if path is a Windows absolute path (C:\ or C:/)
is_windows_absolute_path(path) if {
  regex.match(`^[a-zA-Z]:[\\/]`, path)
}

# Get file extension
get_file_extension(path) := ext if {
  parts := split(path, ".")
  count(parts) > 1
  ext := lower(parts[count(parts) - 1])
}

# Check if extension is allowed
is_allowed_extension(path, allowed) if {
  ext := get_file_extension(path)
  ext in allowed
}

# ===========================================
# FILE REFERENCE HELPERS
# ===========================================

# File reference pattern: $[file('path')] or $[file("path")]
is_file_reference(value) if {
  startswith(value, "$[file(")
  endswith(value, ")]")
}

# Extract path from file reference
# Handles both $[file('path')] and $[file("path")]
extract_file_reference_path(value) := path if {
  is_file_reference(value)
  # Remove $[file( prefix and )] suffix
  inner := substring(value, 7, count(value) - 9)
  # Remove quotes (first and last char)
  count(inner) >= 2
  path := substring(inner, 1, count(inner) - 2)
}

# Check if file reference has valid syntax
is_valid_file_reference_syntax(value) if {
  is_file_reference(value)
  inner := substring(value, 7, count(value) - 9)
  count(inner) >= 2
  # Check first char is quote
  first_char := substring(inner, 0, 1)
  first_char in ["'", "\""]
  # Check last char is matching quote
  last_char := substring(inner, count(inner) - 1, 1)
  last_char == first_char
}

# Check if file reference path is secure (relative, no traversal)
is_secure_file_path(path) if {
  not contains(path, "..")
  not startswith(path, "/")
  not startswith(path, "\\")
  not startswith(path, "//")
  not startswith(path, "\\\\")
  not is_windows_absolute_path(path)
}
