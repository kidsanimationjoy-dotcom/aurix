using Aurix.Desktop.Services;

var passed = 0;
var failed = 0;

void Check(string name, bool condition)
{
    if (!condition)
    {
        failed++;
        Console.Error.WriteLine("FAIL " + name);
        return;
    }

    passed++;
    Console.WriteLine("PASS " + name);
}

void Reject(string name, string json, string userPrompt)
{
    try
    {
        _ = AiDesktopCommandParser.Parse(json, userPrompt);
        Check(name, false);
    }
    catch (InvalidOperationException)
    {
        Check(name, true);
    }
}

var answer = AiDesktopCommandParser.Parse(
    """{"type":"answer","message":"Hello."}""",
    "What can you help me do?");
Check("plain answer accepted", !answer.IsPlan && answer.Message == "Hello." && answer.Plan is null);

Check("AURIX wake phrase accepted without clap", WakePhrasePolicy.IsAccepted("AURIX", 0.65));
Check("Hey AURIX wake phrase accepted without clap", WakePhrasePolicy.IsAccepted("Hey AURIX", 0.65));
Check("wake phrase punctuation is normalized", WakePhrasePolicy.IsAccepted("AURIX.", 0.65));
Check("wake phrase matching is case-insensitive", WakePhrasePolicy.IsAccepted("hey aurix", 0.65));
Check("ordinary speech cannot wake AURIX", !WakePhrasePolicy.IsAccepted("open calculator", 0.95));
Check("low-confidence wake phrase is rejected", !WakePhrasePolicy.IsAccepted("AURIX", 0.20));
Check("invalid wake confidence is rejected", !WakePhrasePolicy.IsAccepted("AURIX", double.NaN));

var launch = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Open Calculator","steps":[{"kind":"launch_application","app":"Calculator"}]}""",
    "Open Calculator");
Check("allowlisted application launch accepted",
    launch.IsPlan && launch.Plan?.Steps.Count == 1 &&
    launch.Plan.Steps[0].Kind == DesktopTaskStepKind.LaunchApplication &&
    launch.Plan.Steps[0].Executable == "calc.exe");

Reject("unrequested app launch rejected",
    """{"type":"desktop_plan","summary":"Open another app","steps":[{"kind":"launch_application","app":"Discord"}]}""",
    "Open Calculator");
Reject("app mention without launch request rejected",
    """{"type":"desktop_plan","summary":"Open Discord","steps":[{"kind":"launch_application","app":"Discord"}]}""",
    "Discord is installed on this computer");
Reject("negated app launch rejected",
    """{"type":"desktop_plan","summary":"Open Calculator","steps":[{"kind":"launch_application","app":"Calculator"}]}""",
    "Do not open Calculator");

var inspection = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Inspect open windows","steps":[{"kind":"inspect_windows"}]}""",
    "Show me the open windows");
Check("read-only window inspection accepted",
    inspection.Plan?.Steps.Single().Kind == DesktopTaskStepKind.InspectWindows);

Reject("unrequested open-window inspection rejected",
    """{"type":"desktop_plan","summary":"Inspect open windows","steps":[{"kind":"inspect_windows"}]}""",
    "Open Calculator");
Reject("negated open-window inspection rejected",
    """{"type":"desktop_plan","summary":"Inspect open windows","steps":[{"kind":"inspect_windows"}]}""",
    "Do not show the open windows");

var inspectControls = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Inspect controls","steps":[{"kind":"inspect_controls","app":"Notepad"}]}""",
    "Inspect controls in Notepad");
Check("explicit control inspection accepted",
    inspectControls.Plan?.Steps.Single().Kind == DesktopTaskStepKind.InspectControls);

Reject("unrequested control inspection rejected",
    """{"type":"desktop_plan","summary":"Inspect controls","steps":[{"kind":"inspect_controls","app":"Notepad"}]}""",
    "Open Notepad");

var clickJson =
    """{"type":"desktop_plan","summary":"Save a file","steps":[{"kind":"click_button","app":"Notepad","button":"Save"}]}""";
var click = AiDesktopCommandParser.Parse(clickJson, "Click the Save button in Notepad");
Check("explicitly named non-external button proposal accepted",
    click.Plan?.Steps.Single().Kind == DesktopTaskStepKind.ClickButton &&
    click.Plan.Steps[0].TargetName == "Save");

var paintClick = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Select the brush tool","steps":[{"kind":"click_button","app":"Paint","button":"Brush"}]}""",
    "Click the Brush button in Paint");
Check("explicit local Paint button action accepted",
    paintClick.Plan?.Steps.Single().TargetApp == "Paint" &&
    paintClick.Plan.Steps[0].TargetName == "Brush");

var multilinePrompt = "Type \"Hello\nWorld\" into \"Text Editor\" in Notepad";
var typeJson =
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello\nWorld"}]}""";
var type = AiDesktopCommandParser.Parse(typeJson, multilinePrompt);
Check("exact user-provided multiline text and field accepted",
    type.Plan?.Steps.Single().Kind == DesktopTaskStepKind.TypeText &&
    type.Plan.Steps[0].InputText == "Hello\nWorld");

Reject("external send button rejected",
    """{"type":"desktop_plan","summary":"Send a message","steps":[{"kind":"click_button","app":"Notepad","button":"Send"}]}""",
    "Click the Send button in Notepad");
Reject("external publish button rejected",
    """{"type":"desktop_plan","summary":"Publish","steps":[{"kind":"click_button","app":"Notepad","button":"Publish"}]}""",
    "Click the Publish button in Notepad");
Reject("payment action button rejected",
    """{"type":"desktop_plan","summary":"Pay","steps":[{"kind":"click_button","app":"Notepad","button":"Pay now"}]}""",
    "Click the Pay now button in Notepad");
Reject("browser button action rejected",
    """{"type":"desktop_plan","summary":"Open a website","steps":[{"kind":"click_button","app":"Microsoft Edge","button":"Open"}]}""",
    "Click Open in Microsoft Edge");

Reject("Paint text entry stays blocked",
    """{"type":"desktop_plan","summary":"Enter text","steps":[{"kind":"type_text","app":"Paint","control":"Text Editor","text":"Hello"}]}""",
    "Type Hello into Text Editor in Paint");
Reject("messaging text entry rejected",
    """{"type":"desktop_plan","summary":"Write a message","steps":[{"kind":"type_text","app":"Discord","control":"Message","text":"Hello"}]}""",
    "Type Hello into Message in Discord");
Reject("unsupported application rejected",
    """{"type":"desktop_plan","summary":"Open an app","steps":[{"kind":"launch_application","app":"UnknownApp"}]}""",
    "Open UnknownApp");
Reject("arbitrary shell action rejected",
    """{"type":"desktop_plan","summary":"Run a command","steps":[{"kind":"run_shell","command":"whoami"}]}""",
    "Run whoami");
Reject("unknown step property rejected",
    """{"type":"desktop_plan","summary":"Launch","steps":[{"kind":"launch_application","app":"Notepad","arguments":"anything"}]}""",
    "Open Notepad");
Reject("duplicate JSON property rejected",
    """{"type":"answer","type":"desktop_plan","message":"Ambiguous"}""",
    "What can you help me do?");
Reject("more than five steps rejected",
    """{"type":"desktop_plan","summary":"Too many","steps":[{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"}]}""",
    "Inspect my open windows");
Reject("empty action plan rejected",
    """{"type":"desktop_plan","summary":"Empty","steps":[]}""",
    "Inspect my open windows");
Reject("NUL in proposed text rejected",
    """{"type":"desktop_plan","summary":"Type text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"bad\u0000text"}]}""",
    "Type bad\u0000text into Text Editor in Notepad");
Reject("non-JSON response rejected", """not JSON""", "Hello");

Reject("button not explicitly named by user rejected", clickJson, "Open Notepad");
Reject("mentioning a button without asking to click rejected",
    """{"type":"desktop_plan","summary":"Save a file","steps":[{"kind":"click_button","app":"Notepad","button":"Save"}]}""",
    "The Save button is visible in Notepad");
Reject("click target must be Notepad in the same request clause",
    """{"type":"desktop_plan","summary":"Open a website","steps":[{"kind":"click_button","app":"Notepad","button":"Open"}]}""",
    "Click Open in Microsoft Edge. Notepad is open too");
Reject("text not supplied by user rejected", typeJson, "Type text into Text Editor in Notepad");
Reject("disconnected type verb and value rejected",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}]}""",
    "I can type. Hello is a greeting. Text Editor in Notepad");
Reject("editable field not named by user rejected",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}]}""",
    "Type Hello into Notepad");
Reject("button name must match the complete spoken label",
    """{"type":"desktop_plan","summary":"Save a file","steps":[{"kind":"click_button","app":"Notepad","button":"Save"}]}""",
    "Click the Save As button in Notepad");
Reject("field name must match the complete spoken label",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text","text":"Hello"}]}""",
    "Type Hello into Text Editor in Notepad");
Reject("entered text must match the complete supplied value",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}]}""",
    "Type Hello World into Text Editor in Notepad");
Reject("Notepad target not named by user rejected",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}]}""",
    "Type Hello into Text Editor");
Reject("negated text-entry request rejected",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}]}""",
    "Do not type Hello into Text Editor in Notepad");
Reject("negated click request rejected",
    """{"type":"desktop_plan","summary":"Save a file","steps":[{"kind":"click_button","app":"Notepad","button":"Save"}]}""",
    "I don't want you to click Save in Notepad");
Reject("negated text-entry request with conversational wording rejected",
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello"}]}""",
    "I don't want you to type Hello into Text Editor in Notepad");


Check("sharp transient qualifies as a clap", ClapDetectionPolicy.IsClap(0.78, 0.11));
Check("ordinary speech energy does not qualify as a clap", !ClapDetectionPolicy.IsClap(0.29, 0.12));
Check("quiet incidental noise does not qualify as a clap", !ClapDetectionPolicy.IsClap(0.18, 0.015));
Check("invalid audio measurement is rejected", !ClapDetectionPolicy.IsClap(double.NaN, 0.1));

Check("orb opens after wake phrase", 
    VoiceOrbStatusPolicy.Classify("AURIX heard you. Listening for your instruction…") == VoiceOrbDisposition.Listening);
Check("orb shows partial speech while listening",
    VoiceOrbStatusPolicy.Classify("Hearing: open Notepad") == VoiceOrbDisposition.Listening);
Check("partial wake phrase does not prematurely show the orb",
    VoiceOrbStatusPolicy.Classify("Checking wake phrase: hey") == VoiceOrbDisposition.None);
Check("orb switches to thinking after recognised speech",
    VoiceOrbStatusPolicy.Classify("I heard: open Notepad") == VoiceOrbDisposition.Thinking);
Check("orb closes after command silence timeout",
    VoiceOrbStatusPolicy.Classify("No speech detected within 6 seconds. The orb is closing.") == VoiceOrbDisposition.Hide);
Check("orb closes when speech cannot be transcribed",
    VoiceOrbStatusPolicy.Classify("I heard speech, but couldn't recognise the instruction clearly.") == VoiceOrbDisposition.Hide);
Check("orb closes when hands-free is paused",
    VoiceOrbStatusPolicy.Classify("AURIX wake-word listening is paused.") == VoiceOrbDisposition.Hide);

var taskRuns = new TaskRunCoordinator();
var firstRun = taskRuns.BeginRun();
Check("first desktop task becomes active", taskRuns.IsCurrent(firstRun));
var secondRun = taskRuns.BeginRun();
Check("new desktop task cancels the previous task", firstRun.IsCancellationRequested);
Check("new desktop task becomes active", taskRuns.IsCurrent(secondRun));
taskRuns.CompleteRun(firstRun);
Check("older task completion cannot clear the newer task", taskRuns.IsCurrent(secondRun));
taskRuns.CancelCurrent();
Check("emergency stop cancels the active task", secondRun.IsCancellationRequested);
taskRuns.CompleteRun(secondRun);
Check("completed desktop task is no longer active", !taskRuns.IsCurrent(secondRun));

var testPairingToken = "aurix-test-" + Guid.NewGuid().ToString("N");
try
{
    CompanionSettingsStore.SaveToken(testPairingToken);
    Check("pairing token is stored for the current Windows user",
        CompanionSettingsStore.LoadToken() == testPairingToken);
    Check("disconnect removes the saved pairing token",
        CompanionSettingsStore.ClearToken());
    Check("disconnected pairing token can no longer be loaded",
        string.IsNullOrEmpty(CompanionSettingsStore.LoadToken()));
}
catch (Exception ex)
{
    Check("pairing token save/disconnect round-trip", false);
    Console.Error.WriteLine("Pairing token persistence test error: " + ex.GetType().Name);
}
finally
{
    _ = CompanionSettingsStore.ClearToken();
}

if (failed > 0)
{
    Console.Error.WriteLine($"{failed} of {passed + failed} proposal-policy checks failed.");
    return 1;
}

Console.WriteLine($"All {passed} proposal-policy checks passed.");
return 0;
