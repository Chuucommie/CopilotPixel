@echo off
setlocal

if defined HOME (
  set "MOCK_HOME=%HOME%"
) else (
  set "MOCK_HOME=%USERPROFILE%"
)
if not exist "%MOCK_HOME%\.copilot-mock" mkdir "%MOCK_HOME%\.copilot-mock"
echo %DATE% %TIME% wrapper node=%COPILOT_AGENTS_NODE_BIN% cwd=%CD% args=%* >> "%MOCK_HOME%\.copilot-mock\actions.log"

rem Cosmetic: background a headerless narration tail into this terminal tab
rem (twin of the bash wrapper). Windows never records review videos, but the
rem hook must stay failure-proof so CI stays green. Only internal (terminal-
rem hosted) sessions get COPILOT_AGENTS_TEST_NARRATION_LOG.
if defined COPILOT_AGENTS_TEST_NARRATION_LOG (
  if defined COPILOT_AGENTS_NODE_BIN (
    start /b "" "%COPILOT_AGENTS_NODE_BIN%" "%~dp0tail-follow.cjs" none "%COPILOT_AGENTS_TEST_NARRATION_LOG%" "%COPILOT_AGENTS_EXTERNAL_NARRATION_LOG%"
  ) else (
    start /b "" node "%~dp0tail-follow.cjs" none "%COPILOT_AGENTS_TEST_NARRATION_LOG%" "%COPILOT_AGENTS_EXTERNAL_NARRATION_LOG%"
  )
)

if defined COPILOT_AGENTS_NODE_BIN (
  "%COPILOT_AGENTS_NODE_BIN%" "%~dp0mock-copilot-runner.cjs" %*
) else (
  node "%~dp0mock-copilot-runner.cjs" %*
)
