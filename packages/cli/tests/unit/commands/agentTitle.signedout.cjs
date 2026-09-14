// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

require("./agentPackage.offline.cjs");
const os = require("os");
const path = require("path");

// The real silent provider sees an empty test home, never the user's credential cache.
os.homedir = () => path.join(process.cwd(), "synthetic-empty-home");
