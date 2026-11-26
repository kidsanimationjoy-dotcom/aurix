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
  - Visible microphone/listening indicator
  - Clap / wake phrase listener (future stage)
  - Speech capture only after activation (future stage)
  - Screen understanding and Windows UI Automation (future stage)
  - Permission prompts, task view and emergency stop
              |
       ACL-protected named pipe
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

The desktop process owns microphone access and UI Automation because those capabilities belong to the interactive user session. A Windows service must not attempt to interact with the logged-in desktop. IPC must use a named pipe with an explicit ACL limited to the current user and the service identity.

## Computer-use engine

Implement an observe-plan-act-verify loop inspired by public computer-use interfaces, not private vendor internals:

1. Observe the foreground window and accessible UI Automation tree.
2. Present the proposed action and target to the user when the action is sensitive or ambiguous.
3. Execute only through an allowlisted UI Automation operation (for example, Invoke or Value patterns).
4. Capture the resulting UI state.
5. Verify the expected state change and append an audit event.

Coordinate-based input is a fallback only. Do not bypass Windows secure desktop, UAC, lock-screen, application permission prompts, or access boundaries. Never capture passwords or payment credentials into model context.

## Voice activation

- Microphone access is opt-in and shown by a persistent tray/window indicator.
- Clap detection and wake-phrase detection run locally.
- The pre-activation audio path is a short volatile ring buffer used only to classify the activation sound; it is not saved or transmitted.
- Speech is captured after activation and discarded after transcription unless the user explicitly chooses to save it.
- Provide hardware mute, software pause, sensitivity controls and a visible listening state.
- Cloud transcription is off by default; cloud AI receives only the text needed for the approved task.

## Hybrid reasoning

- Local layer: wake-word/clap classification, command parsing, device state, simple deterministic tasks and policy checks.
- Cloud layer: complex reasoning, planning and review through providers the user has connected.
- Route according to user preference, data sensitivity, provider availability and usage limits.
- No hidden browser-session scraping, credential extraction, or subscription-token reuse.

## Security monitoring

- Microsoft Defender remains the authoritative antivirus engine.
- AURIX may display Defender health, query threat history and request scans.
- Defender performs its own configured remediation and quarantine.
- AURIX must not delete files because a model labels them suspicious.
- Any AURIX-specific quarantine workflow must use a documented OS security interface, preserve restore capability and require confirmation when confidence or impact is uncertain.
- Security monitoring must not disable Defender, alter exclusions, or change system policy without a clear user-approved settings workflow.

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

High-impact operations (deleting files, installing software, changing security settings, sending messages, purchases, publishing, or external sharing) require explicit confirmation. Provide a global emergency stop that halts new actions and cancels AURIX-owned work.

## Implementation stages

1. **Desktop shell + Defender read/scan foundation:** implemented in `windows/Aurix.Desktop`.
2. **Interactive companion protocol:** authenticated loopback/named-pipe bridge, status, lifecycle and audit events.
3. **Voice activation:** local clap and wake phrase, visible indicator and mute/pause.
4. **Windows UI Automation:** read-only inspection first, then allowlisted actions with approvals.
5. **Hybrid reasoning:** local command router plus connected provider adapters.
6. **Security event dashboard:** Defender state/history, scheduled scans and safe notifications.
7. **Installer and release:** signed installer, startup controls, update/rollback and Windows 11 test matrix.

## Acceptance criteria

- App starts only after explicit user launch or explicit current-user startup opt-in.
- Closing the window hides to tray; tray Exit actually stops the process.
- Microphone is never used before the user enables voice activation.
- Voice activation is visible and can be paused immediately.
- UI Automation never runs against the secure desktop or locked session.
- No model output is executed as arbitrary PowerShell or shell commands.
- Defender status and scan failures are reported accurately.
- AURIX never claims to have removed a threat unless Defender confirms remediation.
- All actions and approvals are inspectable in a local audit history.
