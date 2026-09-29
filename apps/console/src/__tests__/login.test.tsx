/**
 * Login page render + interaction tests (Console).
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

import LoginPage from "@/app/login/page";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("LoginPage (Console)", () => {
  it("renders email and password fields", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders the Sign In button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("Sign In button is disabled while fields are empty", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("Sign In button enables when both fields are filled", async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "test@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password123" },
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
    });
  });

  it("shows error alert when API returns 401", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "bad@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid email or password/i);
    });
  });

  it("shows network error when fetch throws", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network failure"));

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "test@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/cannot reach the server/i);
    });
  });

  it("rejects a CREATOR account: no token saved, shows access error", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
            ".eyJzdWIiOiJ1c2VyLTIiLCJhZ2VuY3lJZCI6ImFnZW5jeS0xIiwicm9sZSI6IkNSRUFUT1IifQ" +
            ".SIGNATURE",
        }),
        { status: 200 },
      ),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "lisa@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/non ha accesso alla console/i);
    });
    expect(window.localStorage.getItem("lf_access_token")).toBeNull();
  });

  it("saves token to localStorage on successful login", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
            ".eyJzdWIiOiJ1c2VyLTEiLCJhZ2VuY3lJZCI6ImFnZW5jeS0xIiwicm9sZSI6Ik9XTkVSIn0" +
            ".SIGNATURE",
        }),
        { status: 200 },
      ),
    );

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "owner@agency.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem("lf_access_token")).not.toBeNull();
    });
  });
});
