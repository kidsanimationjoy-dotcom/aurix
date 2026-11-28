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
  - Explicitly enabled local wake-word listener
  - Wake-only grammar before activation; one-command dictation after activation
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

The desktop process owns microphone access and UI Automation because those capabilities belong to the interactive user session. A user must explicitly enable the hands-free preference. The microphone is then active for a narrow local wake-word grammar; full dictation is enabled only after the wake phrase is recognised, captures one command, and returns to wake-only mode. AURIX does not save microphone recordings or send room audio to an AURIX cloud service. The tray status shows whether wake listening is enabled, the tray menu provides pause/resume, and Exit stops the process and releases microphone access. When the optional current-user startup entry is enabled, it starts AURIX hidden in the tray and restores wake listening only if the user's saved wake-word preference is still enabled.

A Windows service must not attempt to interact with the logged-in desktop. Any future IPC must use a named pipe with an explicit ACL limited to the current user and the service identity.

## Current hands-free voice slice

- An explicit opt-in stores a per-Windows-user wake-word preference.
- At standby, the recognizer loads a narrow grammar with `AURIX` and `Hey AURIX` choices. General dictation is not loaded in this state.
- Once a wake phrase is recognised, AURIX switches to a dictation grammar for one command.
- The recognised command is sent to the existing bounded local task planner.
- The recognizer then unloads dictation and returns to the narrow wake grammar.
- Closing the main window hides it to the tray without stopping hands-free listening.
- Tray controls pause/resume wake listening or exit the application.
- Startup registration launches AURIX with a background argument so it starts hidden in the tray.
- A local English Windows speech recognizer and microphone permission are required. Live detection reliability still needs real-device testing.

## Current computer-use slice

Implemented capabilities:

- Parse a narrow set of explicit local commands.
- Launch only applications in a hard-coded allowlist (Notepad, Calculator, Paint, File Explorer, Edge, Chrome, Windows Terminal, Discord and Spotify).
- Execute a multi-app launch plan in order.
- Send a user-approved normal Windows close request to one visible Notepad, Paint or Calculator window; never force-terminate the process, and allow the app to show its own save prompt.
- Inspect visible top-level window titles and process names.
- Inspect named UI Automation controls in a selected supported application. Field values and password controls are not returned.
- Activate one exact, uniquely named, visible, enabled button through the UI Automation Invoke pattern, after an explicit user approval prompt.
- Replace the value of one exact, uniquely named editable UI Automation field through ValuePattern, after showing a preview and receiving approval. This action does not submit the form.
- Re-resolve the same process, window title and uniquely named control after the approval prompt, and fail closed if the target changed while the user was deciding.
- Verify text-entry values by reading the field back after setting it. For button activation, report only that Windows accepted the Invoke request; do not claim the resulting application state was independently verified.
- Refuse duplicate or ambiguous control matches.
- Block button names that look destructive (delete, remove, erase, format, wipe, uninstall or reset).
- Refuse password and common secret-field names (PIN, payment code, token, secret and recovery code).
- Cancel remaining steps with the emergency-stop control.
- Append a bounded local task-audit event for each attempted task step, with UTC time, action kind, supported application and outcome. Dictated instructions, entered field contents, window titles and exception messages are excluded.

The current slice does **not** read document contents, capture screenshots, click arbitrary screen coordinates, simulate keyboard input, handle password fields, close arbitrary apps or execute arbitrary shell commands. UI Automation is provider-dependent: an application that does not expose a named button or editable field cannot be operated through this slice.

## Computer-use engine roadmap

Extend the current observe-plan-act-verify loop in stages:

1. Observe visible windows and accessible UI Automation controls, within user-approved scope.
2. Present proposed actions and their targets. Require approval for sensitive, ambiguous or external-impact operations.
3. Execute only allowlisted UI Automation operations (for example, Invoke or Value patterns) against the intended application.
4. Read the resulting UI state and verify the expected change.
5. Append an inspectable audit event and expose a stop control throughout execution.

Coordinate-based input is a fallback only. Do not bypass Windows secure desktop, UAC, lock-screen, application permission prompts or access boundaries. Never capture passwords or payment credentials into model context.

## Hybrid reasoning

- Local layer: deterministic command parsing, device state, bounded desktop actions and policy checks.
- Optional reasoning layer: the paired local Codex CLI can answer voice questions or return a structured proposal for the bounded desktop action schema.
- AURIX rejects unknown action types, fields, applications and malformed proposals. Only the existing allowlisted desktop runner receives a validated plan.
- AI-proposed app launches and read-only inspection may target the supported application allowlist. AI-proposed button clicks are limited to Notepad, Paint and Calculator after exact target validation and individual approval. AI-proposed graceful close requests are limited to Notepad, Paint and Calculator and use the normal Windows close message, never a force kill. AI-proposed text entry remains restricted to Notepad; browsers, messaging clients, terminals and file-management surfaces remain excluded from model-generated UI mutations.
- Every AI-proposed plan is displayed for user approval; Notepad button activation and text entry retain their own per-action approvals. The documented deterministic local command grammar remains separately bounded and retains its per-action approvals for explicitly named supported apps.
- Network access, shell commands, scripts, arbitrary file access and general-purpose keyboard/mouse control are not exposed by this bridge.
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
- wake-word and speech recognition;
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
2. **Bounded local task console:** implemented — allowlisted multi-app launch and read-only visible-window inspection.
3. **Scoped UI Automation slice:** implemented — inspect supported-app controls, approve exact named button clicks and field-value entry, refuse ambiguous/destructive/password targets.
4. **Hands-free wake-word loop:** implemented in this branch — opt-in local wake grammar, one-command dictation, tray pause/resume, hidden-at-startup support. Real-device microphone and wake-word testing remains required.
5. **Interactive computer use:** next — expand supported-app coverage, reliable foreground targeting and verification of expected state changes. A bounded local task-audit history is implemented for the current task runner; it records action kind, application, UTC timestamp and outcome without recording speech or entered text.
6. **Hybrid reasoning:** future — local policy router plus connected provider adapters.
7. **Security event dashboard:** future — Defender history, scheduled scans and safe notifications.
8. **Installer and release:** future — signed installer, startup controls, update/rollback and Windows 11 test matrix.

## Acceptance criteria

- App starts only after explicit user launch or explicit current-user startup opt-in.
- Closing the window hides to tray without stopping enabled hands-free listening.
- Tray menu can pause or resume wake-word listening; Exit releases the microphone.
- Microphone is not opened until the user explicitly enables hands-free.
- Wake standby listens only for the narrow wake phrase grammar, not general dictation.
- Dictation is loaded only after the wake phrase and is limited to one command before returning to wake mode.
- Recognised speech is not an implicit approval for a sensitive action.
- UI Automation never runs against the secure desktop or locked session.
- No model output is executed as arbitrary PowerShell or shell commands.
- Defender status and scan failures are reported accurately.
- AURIX never claims to have removed a threat unless Defender confirms remediation.
- Sensitive actions require specific user approval and are recorded in local audit history.
