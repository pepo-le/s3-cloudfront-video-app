import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock HLS.js
vi.mock("hls.js", () => {
  return {
    default: {
      isSupported: vi.fn(() => false), // Force fallback to native HLS
    },
  };
});

// Mock video element methods
Object.defineProperty(HTMLVideoElement.prototype, "canPlayType", {
  writable: true,
  value: vi.fn().mockReturnValue("maybe"), // Support native HLS
});

Object.defineProperty(HTMLVideoElement.prototype, "play", {
  writable: true,
  value: vi.fn().mockImplementation(() => Promise.resolve()),
});

// Lazy import App to ensure mocks are set up
const App = await import("../App").then((m) => m.default);

describe("App Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the video player application", () => {
    render(<App />);

    expect(screen.getByText("動画視聴")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "読み込み" })
    ).toBeInTheDocument();
  });

  it("displays watermark with timestamp", () => {
    render(<App />);

    const watermark = screen.getByText(/CONFIDENTIAL/);
    expect(watermark).toBeInTheDocument();
    expect(watermark.textContent).toContain("2023/1/1");
  });

  it("initializes with default key value", () => {
    render(<App />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("media/moon.m3u8");
  });

  it("updates key value when input changes", () => {
    render(<App />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test/video.m3u8" } });

    expect(input.value).toBe("test/video.m3u8");
  });

  it("prevents context menu on container", () => {
    render(<App />);

    const container = screen.getByText("動画視聴").closest("div");
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    let defaultPrevented = false;
    contextMenuEvent.preventDefault = () => {
      defaultPrevented = true;
    };

    container?.dispatchEvent(contextMenuEvent);
    expect(defaultPrevented).toBe(true);
  });

  it("displays security features information", () => {
    render(<App />);

    const hint = screen.getByText(/HLS \+ 署名クエリで直接保存を抑止/);
    expect(hint).toBeInTheDocument();
    expect(
      screen.getByText(/右クリック\/ショートカット\/PiP\/リモート再生を抑止/)
    ).toBeInTheDocument();
  });

  it("has proper video security attributes", () => {
    const { container } = render(<App />);

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute(
      "controlsList",
      "nodownload noremoteplayback"
    );
    expect(video).toHaveAttribute("disablePictureInPicture");
    expect(video).toHaveAttribute("playsInline");
  });

  it("prevents Ctrl+S keyboard shortcut on video", () => {
    const { container } = render(<App />);

    const video = container.querySelector("video") as HTMLVideoElement;
    const keyDownEvent = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    let defaultPrevented = false;
    keyDownEvent.preventDefault = () => {
      defaultPrevented = true;
    };

    video.dispatchEvent(keyDownEvent);
    expect(defaultPrevented).toBe(true);
  });

  it("prevents Cmd+S keyboard shortcut on video (Mac)", () => {
    const { container } = render(<App />);

    const video = container.querySelector("video") as HTMLVideoElement;
    const keyDownEvent = new KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    let defaultPrevented = false;
    keyDownEvent.preventDefault = () => {
      defaultPrevented = true;
    };

    video.dispatchEvent(keyDownEvent);
    expect(defaultPrevented).toBe(true);
  });
});
