"""Install and exercise a published APK on a disposable Android emulator."""

import re
import subprocess
import sys
import time
from xml.etree import ElementTree


ADB, APK = sys.argv[1:]
PACKAGE = "info.cosmonet.cosmocoding"


def adb(*args, timeout=45):
    result = subprocess.run(
        [ADB, "-s", "emulator-5554", *args],
        text=True,
        check=True,
        capture_output=True,
        timeout=timeout,
    )
    return result.stdout.strip()


def wait_until(check, description, timeout=60):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        result = check()
        if result:
            return result
        time.sleep(2)
    raise AssertionError(description)


def ui():
    try:
        adb("shell", "uiautomator", "dump", "/sdcard/cosmocoding.xml", timeout=12)
        return list(ElementTree.fromstring(adb("exec-out", "cat", "/sdcard/cosmocoding.xml")).iter("node"))
    except (ElementTree.ParseError, subprocess.SubprocessError):
        return []


def label(text):
    return lambda node: any(text.casefold() in node.get(name, "").casefold() for name in ("text", "content-desc"))


def find(predicate, description, timeout=35):
    return wait_until(lambda: next((node for node in ui() if predicate(node)), None) is not None,
                      description, timeout)


def tap(predicate, description):
    def bounds():
        for node in ui():
            if predicate(node) and node.get("bounds"):
                x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds")))
                if x2 > x1 and y2 > y1:
                    return (str((x1 + x2) // 2), str((y1 + y2) // 2))
        return None

    adb("shell", "input", "tap", *wait_until(bounds, description, 30))


def smoke():
    adb("wait-for-device", timeout=210)
    wait_until(lambda: adb("shell", "getprop", "sys.boot_completed") == "1", "Emulatore non avviato", 140)
    adb("shell", "input", "keyevent", "82")
    assert "Success" in adb("install", "--no-streaming", APK, timeout=75)
    assert "package:" in adb("shell", "pm", "path", PACKAGE)
    start = adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.WorkspaceActivity")
    assert "Status: ok" in start, start
    find(label("Scrivi codice"), "Il workspace integrato non si è aperto")
    print("APK della release installato e workspace aperto su Android 15.", flush=True)

    tap(label("Esplora il modello Flutter"), "Pulsante del modello assente")
    find(label("Rivedi proposta"), "L'anteprima Flutter non si è aperta")
    print("Modello Flutter locale caricato e revisione visualizzata.", flush=True)

    tap(lambda node: label("Connessioni")(node) and node.get("clickable") == "true", "Connessioni non raggiungibili")
    find(label("Token GitHub"), "Schermata Connessioni senza il connettore GitHub")
    tap(label("Elenca repository"), "Pulsante Elenca repository assente")
    find(label("Inserisci una credenziale valida per GitHub"), "Il connettore non ha risposto alla validazione")
    print("Connessioni aperte e validazione del connettore GitHub riuscita.", flush=True)


if __name__ == "__main__":
    try:
        smoke()
    except Exception:
        for node in ui():
            if node.get("text") or node.get("content-desc"):
                print(node.get("text"), node.get("content-desc"))
        raise
