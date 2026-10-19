import { describe, expect, it } from 'vitest';

import {
  extractToolName,
  isReadingToolName,
  isSubagentToolName,
  setProviderCapabilities,
} from '../src/office/toolUtils.js';

describe('toolUtils', () => {
  it('extracts tool names from status messages', () => {
    expect(extractToolName('Reading src/index.ts')).toBe('Read');
    expect(extractToolName('Viewing file: server.ts')).toBe('view_file');
    expect(extractToolName('Searching code: function')).toBe('Grep');
    expect(extractToolName('Editing package.json')).toBe('Edit');
    expect(extractToolName('Running: npm test')).toBe('Bash');
    expect(extractToolName('Subtask: Check docs')).toBe('Task');
  });

  it('identifies reading tools correctly with capabilities and fallback keywords', () => {
    setProviderCapabilities({
      readingTools: ['Read', 'readFile', 'view_file', 'grep_search'],
      subagentToolNames: ['Task', 'browser_subagent'],
    });

    expect(isReadingToolName('Read')).toBe(true);
    expect(isReadingToolName('readFile')).toBe(true);
    expect(isReadingToolName('view_file')).toBe(true);
    expect(isReadingToolName('grep_search')).toBe(true);
    expect(isReadingToolName('READFILE')).toBe(true); // case-insensitive
    expect(isReadingToolName('fetchWeb')).toBe(true); // keyword fetch
    expect(isReadingToolName('list_dir')).toBe(true); // keyword list
    expect(isReadingToolName('searchCode')).toBe(true); // keyword search

    expect(isReadingToolName('Edit')).toBe(false);
    expect(isReadingToolName('Bash')).toBe(false);
    expect(isReadingToolName('runInTerminal')).toBe(false);
    expect(isReadingToolName(null)).toBe(false);
    expect(isReadingToolName('')).toBe(false);
  });

  it('identifies subagent tools correctly with capabilities and fallback keywords', () => {
    setProviderCapabilities({
      readingTools: ['Read'],
      subagentToolNames: ['Task', 'browser_subagent'],
    });

    expect(isSubagentToolName('Task')).toBe(true);
    expect(isSubagentToolName('browser_subagent')).toBe(true);
    expect(isSubagentToolName('invoke_subagent')).toBe(true);
    expect(isSubagentToolName('agent')).toBe(true);

    expect(isSubagentToolName('run_command')).toBe(false);
    expect(isSubagentToolName('view_file')).toBe(false);
    expect(isSubagentToolName('replace_file_content')).toBe(false);
    expect(isSubagentToolName(null)).toBe(false);
  });
});
