# Sentinel's Journal

## 2026-03-31 - Path Traversal in Autonomous Agent Workspace Actions
**Vulnerability:** The autonomous agent runner (`adapters/vscode/autonomousAgentRunner.ts`) performed file operations (`read_file` and `write_file`) using `vscode.Uri.joinPath(workspaceRoot, filePath)` without validating that the resulting path remained within `workspaceRoot`. An AI prompt payload or malicious action block specifying `filePath: "../../secret"` could read or write sensitive files outside the workspace directory.
**Learning:** `vscode.Uri.joinPath` resolves path relative components like `..` without throwing errors or locking access to the base workspace URI.
**Prevention:** Always validate resolved target file URIs against workspace boundaries using relative path checks (`path.relative(workspaceUri.fsPath, targetUri.fsPath)` ensuring it does not start with `..` or resolve to an absolute path outside the root).
