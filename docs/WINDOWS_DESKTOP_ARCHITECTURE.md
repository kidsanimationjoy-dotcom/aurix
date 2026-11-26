# AURIX Windows Desktop Architecture

## Target and hardware profile

- Initial target: Windows 11 x64.
- Design baseline: Intel Core i5-8365U, 8 GB RAM, integrated graphics.
- Keep the always-on local process lightweight; do not load a large language model into memory by default.
- Hybrid AI: local deterministic intent handling and optional small local models; cloud reasoning only through explicitly connected, user-authorised providers.

## Process model

```text
AURIX Desktop (signed-in user session)
  - WPF shell and system tray
  - Explicit opt-in local speech dictation while the window is visible
  - Deterministic allowlisted app launcher and bounded task runner
  - Read-only inspection of visible windows and accessible UI Automation controls
  - Approval-gated Invoke / Value UI Automation actions
  - Permission prompts, task view and emergency stop
              |
       Future authenticated IPC
              |
AURIX Background Service (future stage; least privilege)
  - Health and lifecycle monitoring
  - Security event collection
  - Scheduled Defender status/scan coordination
  - No interactive desktop control
              |
      Windows Security APIs
              |
Microsoft Defender Antivirus
  - Real-time protection
  - Threat detection
  - Quarantine and remediation
```

The desktop process owns microphone access and UI Automation because those capabilities belong to the interactive user session. Microphone access starts only after the user presses the voice control, stops when the window is hidden or the app exits, and does not upload audio. Recognised words are placed in the command box for user review; speech is never an implicit approval to execute a task. A Windows service must not attempt to interact with the logged-in desktop. Any future IPC must use a named pipe with an explicit ACL limited to the current user and the service identity.

## Current computer-use slice

Implemented capabilities:

- Parse a narrow set of explicit local commands.
- Launch only applications in a hard-coded allowlist (Notepad, Calculator, Paint, File Explorer, Edge, Chrome, Windows Terminal, Discord and Spotify).
- Execute a multi-app launch plan in order.
- Inspect visible top-level window titles and process names.
- Inspect named UI Automation controls in a selected supported application. Field values and password controls are not returned.
- Activate one exact, uniquely named, visible, enabled button through the UI Automation Invoke pattern, after an explicit user approval prompt.
- Replace the value of one exact, uniquely named editable UI Automation field through ValuePattern, after showing a preview and receiving approval. This action does not submit the form.
- Refuse duplicate or ambiguous control matches.
- Block button names that look destructive (delete, remove, erase, format, wipe, uninstall or reset).
- Refuse password and common secret-field names (PIN, payment code, token, secret and recovery code).
- Cancel remaining steps with the emergency-stop control.

The current slice does **not** read document contents, capture screenshots, click arbitrary screen coordinates, simulate keyboard input, handle password fields or execute arbitrary shell commands. UI Automation is provider-dependent: an application that does not expose a named button or editable field cannot be operated through this slice.

## Computer-use engine roadmap

Extend the current observe-plan-act-verify loop in stages:

1. Observe visible windows and accessible UI Automation controls, within user-approved scope.
2. Present proposed actions and their targets. Require approval for sensitive, ambiguous or external-impact operations.
3. Execute only allowlisted UI Automation operations (for example, Invoke or Value patterns) against the intended application.
4. Read the resulting UI state and verify the expected change.
5. Append an inspectable audit event and expose a stop control throughout execution.

Coordinate-based input is a fallback only. Do not bypass Windows secure desktop, UAC, lock-screen, application permission prompts or access boundaries. Never capture passwords or payment credentials into model context.

## Voice activation

Current:

- Explicit button-controlled Windows speech dictation through the installed local speech recognizer.
- No audio recording file is written by the AURIX dictation service.
- Recognised text is returned to the visible command box and must be reviewed and manually submitted.
- Voice listening stops when the window is hidden or the application exits.
- If no compatible Windows recognizer is installed, typed commands remain available.

Future:

- Local clap and wake-phrase detection.
- A visible tray-level microphone indicator that remains accurate in all app states.
- Sensitivity controls, hardware mute guidance and a global software pause.
- Cloud transcription only as an explicit opt-in; cloud AI receives only the text needed for the approved task.

## Hybrid reasoning

- Local layer: deterministic command parsing, device state, simple tasks and policy checks.
- Cloud layer: complex reasoning, planning and review through providers the user has connected.
- Route according to user preference, data sensitivity, provider availability and usage limits.
- No hidden browser-session scraping, credential extraction or subscription-token reuse.
- A connected model may propose a plan, but it cannot authorize or directly execute an action that the permission layer requires the user to approve.

## Security monitoring

- Microsoft Defender remains the authoritative antivirus engine.
- AURIX may display Defender health, query threat history and request scans.
- Defender performs its own configured remediation and quarantine.
- AURIX must not delete files because a model labels them suspicious.
- Any AURIX-specific quarantine workflow must use a documented OS security interface, preserve restore capability and require confirmation when confidence or impact is uncertain.
- Security monitoring must not disable Defender, alter exclusions or change system policy without a clear user-approved settings workflow.

## Permission model

Separate grants for:
- microphone activation;
- speech transcription;
- screen observation;
- UI Automation read access;
- UI Automation action access;
- project-folder read/write;
- network access;
- Defender status and scan requests;
- system settings.

High-impact operations (deleting files, installing software, changing security settings, sending messages, purchases, publishing or external sharing) require explicit confirmation. Provide a global emergency stop that halts new actions and cancels AURIX-owned work.

## Implementation stages

1. **Desktop shell + Defender read/scan foundation:** implemented in `windows/Aurix.Desktop`.
2. **Bounded local task console:** implemented — local dictation after explicit activation, allowlisted multi-app launch and read-only visible-window inspection.
3. **Scoped UI Automation slice:** implemented — inspect supported-app controls, approve exact named button clicks and field-value entry, refuse ambiguous/destructive/password targets.
4. **Interactive computer use:** next — expand supported-app coverage, reliable foreground targeting, verify expected state changes and add persistent local audit history.
5. **Hands-free activation:** future — local clap and wake phrase, always-visible state, mute and pause controls.
6. **Hybrid reasoning:** future — local policy router plus connected provider adapters.
7. **Security event dashboard:** future — Defender history, scheduled scans and safe notifications.
8. **Installer and release:** future — signed installer, startup controls, update/rollback and Windows 11 test matrix.

## Acceptance criteria

- App starts only after explicit user launch or explicit current-user startup opt-in.
- Closing the window hides to tray; tray Exit actually stops the process.
- Microphone is never used before the user enables voice dictation.
- Voice listening stops when the window is hidden or the application exits.
- Recognised speech is not executed until the user reviews and submits it.
- UI Automation never runs against the secure desktop or locked session.
- No model output is executed as arbitrary PowerShell or shell commands.
- Defender status and scan failures are reported accurately.
- AURIX never claims to have removed a threat unless Defender confirms remediation.
- Sensitive actions require specific user approval and are recorded in local audit history.
