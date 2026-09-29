/**
 * Creator login page tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

import CreatorLoginPage from "@/app/login/page";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("CreatorLoginPage", () => {
  it("renders email and password fields", () => {
    render(<CreatorLoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("accedi button is disabled while fields are empty", () => {
    render(<CreatorLoginPage />);
    expect(screen.getByRole("button", { name: /accedi/i })).toBeDisabled();
  });

  it("accedi button enables when both fields are filled", async () => {
    render(<CreatorLoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password123" },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /accedi/i })).not.toBeDisabled();
    });
  });

  it("shows error alert when API returns 401", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
    );

    render(<CreatorLoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "bad@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /accedi/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("saves token to localStorage on successful login", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
            ".eyJzdWIiOiJ1c2VyLTEiLCJhZ2VuY3lJZCI6ImFnZW5jeS0xIiwicm9sZSI6IkNSRUFUT1IifQ" +
            ".SIGNATURE",
        }),
        { status: 200 },
      ),
    );

    render(<CreatorLoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /accedi/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem("lf_access_token")).not.toBeNull();
    });
  });
});
