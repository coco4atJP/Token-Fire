import AppKit
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2, let pid = pid_t(CommandLine.arguments[1]) else {
  fputs("usage: send-macos-keys.swift <pid>\n", stderr)
  exit(2)
}
guard let application = NSRunningApplication(processIdentifier: pid) else {
  fputs("Token Fire process was not found\n", stderr)
  exit(3)
}

application.activate(options: [.activateAllWindows])
Thread.sleep(forTimeInterval: 0.8)

let keys: [CGKeyCode] = [12, 37, 48, 48, 124, 124, 53, 35, 35] // Q L Tab Tab Right Right Esc P P
for key in keys {
  CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true)?.post(tap: .cghidEventTap)
  CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false)?.post(tap: .cghidEventTap)
  Thread.sleep(forTimeInterval: 0.65)
}
