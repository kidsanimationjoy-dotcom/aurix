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

var launch = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Open Calculator","steps":[{"kind":"launch_application","app":"Calculator"}]}""",
    "Open Calculator");
Check("allowlisted application launch accepted",
    launch.IsPlan && launch.Plan?.Steps.Count == 1 &&
    launch.Plan.Steps[0].Kind == DesktopTaskStepKind.LaunchApplication &&
    launch.Plan.Steps[0].Executable == "calc.exe");

var inspection = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Inspect open windows","steps":[{"kind":"inspect_windows"}]}""",
    "Show me the open windows");
Check("read-only window inspection accepted",
    inspection.Plan?.Steps.Single().Kind == DesktopTaskStepKind.InspectWindows);

var clickJson =
    """{"type":"desktop_plan","summary":"Save a file","steps":[{"kind":"click_button","app":"Notepad","button":"Save"}]}""";
var click = AiDesktopCommandParser.Parse(clickJson, "Click the Save button in Notepad");
Check("explicitly named non-external button proposal accepted",
    click.Plan?.Steps.Single().Kind == DesktopTaskStepKind.ClickButton &&
    click.Plan.Steps[0].TargetName == "Save");

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

if (failed > 0)
{
    Console.Error.WriteLine($"{failed} of {passed + failed} proposal-policy checks failed.");
    return 1;
}

Console.WriteLine($"All {passed} proposal-policy checks passed.");
return 0;
