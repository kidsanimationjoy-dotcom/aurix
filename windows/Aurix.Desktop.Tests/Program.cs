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

void Reject(string name, string json)
{
    try
    {
        _ = AiDesktopCommandParser.Parse(json);
        Check(name, false);
    }
    catch (InvalidOperationException)
    {
        Check(name, true);
    }
}

var answer = AiDesktopCommandParser.Parse("""{"type":"answer","message":"Hello."}""");
Check("plain answer accepted", !answer.IsPlan && answer.Message == "Hello." && answer.Plan is null);

var launch = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Open Calculator","steps":[{"kind":"launch_application","app":"Calculator"}]}""");
Check("allowlisted application launch accepted",
    launch.IsPlan && launch.Plan?.Steps.Count == 1 &&
    launch.Plan.Steps[0].Kind == DesktopTaskStepKind.LaunchApplication &&
    launch.Plan.Steps[0].Executable == "calc.exe");

var inspection = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Inspect open windows","steps":[{"kind":"inspect_windows"}]}""");
Check("read-only window inspection accepted",
    inspection.Plan?.Steps.Single().Kind == DesktopTaskStepKind.InspectWindows);

var click = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Save a file","steps":[{"kind":"click_button","app":"Notepad","button":"Save"}]}""");
Check("named non-external button proposal accepted",
    click.Plan?.Steps.Single().Kind == DesktopTaskStepKind.ClickButton &&
    click.Plan.Steps[0].TargetName == "Save");

var type = AiDesktopCommandParser.Parse(
    """{"type":"desktop_plan","summary":"Enter supplied text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"Hello\nWorld"}]}""");
Check("user-provided multiline text accepted",
    type.Plan?.Steps.Single().Kind == DesktopTaskStepKind.TypeText &&
    type.Plan.Steps[0].InputText == "Hello\nWorld");

Reject("external send button rejected",
    """{"type":"desktop_plan","summary":"Send a message","steps":[{"kind":"click_button","app":"Notepad","button":"Send"}]}""");
Reject("browser button action rejected",
    """{"type":"desktop_plan","summary":"Open a website","steps":[{"kind":"click_button","app":"Microsoft Edge","button":"Open"}]}""");
Reject("messaging text entry rejected",
    """{"type":"desktop_plan","summary":"Write a message","steps":[{"kind":"type_text","app":"Discord","control":"Message","text":"Hello"}]}""");
Reject("external publish button rejected",
    """{"type":"desktop_plan","summary":"Publish","steps":[{"kind":"click_button","app":"Notepad","button":"Publish"}]}""");
Reject("payment action button rejected",
    """{"type":"desktop_plan","summary":"Pay","steps":[{"kind":"click_button","app":"Notepad","button":"Pay now"}]}""");
Reject("unsupported application rejected",
    """{"type":"desktop_plan","summary":"Open an app","steps":[{"kind":"launch_application","app":"UnknownApp"}]}""");
Reject("arbitrary shell action rejected",
    """{"type":"desktop_plan","summary":"Run a command","steps":[{"kind":"run_shell","command":"whoami"}]}""");
Reject("unknown step property rejected",
    """{"type":"desktop_plan","summary":"Launch","steps":[{"kind":"launch_application","app":"Notepad","arguments":"anything"}]}""");
Reject("duplicate JSON property rejected",
    """{"type":"answer","type":"desktop_plan","message":"Ambiguous"}""");
Reject("more than five steps rejected",
    """{"type":"desktop_plan","summary":"Too many","steps":[{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"},{"kind":"inspect_windows"}]}""");
Reject("empty action plan rejected",
    """{"type":"desktop_plan","summary":"Empty","steps":[]}""");
Reject("NUL in proposed text rejected",
    """{"type":"desktop_plan","summary":"Type text","steps":[{"kind":"type_text","app":"Notepad","control":"Text Editor","text":"bad\u0000text"}]}""");
Reject("non-JSON response rejected", """not JSON""");

if (failed > 0)
{
    Console.Error.WriteLine($"{failed} of {passed + failed} proposal-policy checks failed.");
    return 1;
}

Console.WriteLine($"All {passed} proposal-policy checks passed.");
return 0;
