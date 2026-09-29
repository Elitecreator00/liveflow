/**
 * Monitoring page (Live Wall) render tests — Console.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/monitoring",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@liveflow/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@liveflow/api-client")>();
  return {
    ...actual,
    connectSocket: vi.fn(() =>
      Promise.resolve({
        connected: false,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
      }),
    ),
    disconnectSocket: vi.fn(),
    getToken: () => null,
    getStreamHealth: vi.fn(),
  };
});

import MonitoringPage from "@/app/(dashboard)/monitoring/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MonitoringPage (Console)", () => {
  it("renders the Live Wall heading", () => {
    render(<MonitoringPage />);
    expect(screen.getByText(/live wall/i)).toBeInTheDocument();
  });

  it("renders mock stream tiles when API is unavailable", () => {
    render(<MonitoringPage />);
    expect(screen.getByText("Luna_Star")).toBeInTheDocument();
    expect(screen.getByText("Violet_Rose")).toBeInTheDocument();
  });

  it("renders filter tabs", () => {
    render(<MonitoringPage />);
    expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /live/i })).toBeInTheDocument();
  });

  it("renders KPI stat tiles", () => {
    render(<MonitoringPage />);
    const liveEls = screen.getAllByText("Live");
    expect(liveEls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows refresh button", () => {
    render(<MonitoringPage />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });
});
